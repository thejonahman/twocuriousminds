import { Router } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { findBestImageForVideo } from '../lib/imageAnalysis';

const router = Router();

// Simple multer setup with memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  }
}).single('thumbnail');

const thumbnailRequestSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  videoId: z.number().optional(),
  url: z.string().url(),
  platform: z.enum(["youtube", "tiktok", "instagram"])
});

// Generate thumbnail route
router.post('/generate', async (req, res) => {
  try {
    const validation = thumbnailRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.message });
    }

    const { title, description = '' } = validation.data;
    const imagesFolder = path.join(process.cwd(), 'attached_assets');

    if (!fs.existsSync(imagesFolder)) {
      return res.status(500).json({ error: 'Images folder not found' });
    }

    const fileName = await findBestImageForVideo(title, description, imagesFolder);
    let thumbnailUrl: string;

    if (fileName) {
      const imagePath = path.join(imagesFolder, fileName);
      const imageBuffer = fs.readFileSync(imagePath);
      const extension = path.extname(fileName).substring(1);
      thumbnailUrl = `data:image/${extension};base64,${imageBuffer.toString('base64')}`;
    } else {
      const svgContent = `
        <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#2563eb"/>
          <text x="640" y="360" font-family="Arial" font-size="48" fill="white" text-anchor="middle" dominant-baseline="middle">
            ${title}
          </text>
        </svg>
      `;
      thumbnailUrl = `data:image/svg+xml;base64,${Buffer.from(svgContent.trim()).toString('base64')}`;
    }

    return res.json({ thumbnailUrl });
  } catch (error) {
    console.error('Thumbnail generation error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to generate thumbnail'
    });
  }
});

// Upload custom thumbnail route
router.patch('/:videoId/thumbnail', (req, res) => {
  upload(req, res, (err) => {
    if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({ 
        error: err instanceof multer.MulterError ? 'File too large' : err.message 
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      const thumbnailUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      return res.json({ thumbnailUrl });
    } catch (error) {
      console.error('File processing error:', error);
      return res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to process thumbnail'
      });
    }
  });
});

export default router;