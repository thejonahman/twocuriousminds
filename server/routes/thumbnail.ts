import { Router } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { findBestImageForVideo } from '../lib/imageAnalysis';

const router = Router();

// Configure multer for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    console.log('Multer processing file:', file.originalname, 'type:', file.mimetype);
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  }
}).single('thumbnail');

const thumbnailRequestSchema = z.object({
  url: z.string().url("Must be a valid URL"),
  platform: z.enum(["youtube", "tiktok", "instagram"]),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  videoId: z.number()
});

router.post('/generate', async (req, res) => {
  try {
    console.log('Received thumbnail generation request:', req.body);

    // Validate request body
    const validation = thumbnailRequestSchema.safeParse(req.body);
    if (!validation.success) {
      console.error('Validation failed:', validation.error);
      return res.status(400).json({ 
        success: false,
        error: 'Invalid request data',
        details: validation.error.issues
      });
    }

    const { title, description, videoId, url, platform } = validation.data;

    // Get images folder path
    const imagesFolder = path.join(process.cwd(), 'attached_assets');
    console.log('Looking for images in:', imagesFolder);

    if (!fs.existsSync(imagesFolder)) {
      console.error('Images folder not found:', imagesFolder);
      return res.status(500).json({
        success: false,
        error: 'Server configuration error',
        details: 'Images folder not found'
      });
    }

    // Find matching image
    const fileName = await findBestImageForVideo(
      title,
      description || '',
      imagesFolder
    );
    console.log('Selected image file:', fileName);

    let thumbnailUrl: string;

    if (fileName) {
      // Read and convert the image
      try {
        const imagePath = path.join(imagesFolder, fileName);
        const imageBuffer = fs.readFileSync(imagePath);
        const extension = path.extname(fileName).substring(1);
        thumbnailUrl = `data:image/${extension};base64,${imageBuffer.toString('base64')}`;
        console.log('Successfully generated thumbnail from file');
      } catch (readError) {
        console.error('Error reading image file:', readError);
        return res.status(500).json({
          success: false,
          error: 'Image processing error',
          details: 'Failed to read image file'
        });
      }
    } else {
      // Generate fallback SVG
      console.log('No matching image found, generating SVG fallback');
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

    return res.status(200).json({ 
      success: true,
      thumbnailUrl
    });
  } catch (error) {
    console.error('Unhandled error in thumbnail generation:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Thumbnail generation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Handle custom thumbnail uploads
router.patch('/:videoId/thumbnail', (req, res) => {
  console.log('Received thumbnail upload request for video:', req.params.videoId);

  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      return res.status(400).json({
        success: false,
        error: 'File upload error',
        details: err.message
      });
    } else if (err) {
      console.error('Unknown upload error:', err);
      return res.status(400).json({
        success: false,
        error: 'File upload failed',
        details: err.message
      });
    }

    try {
      console.log('File upload completed, processing request');
      console.log('Request file:', req.file);

      if (!req.file) {
        console.error('No file provided in request');
        return res.status(400).json({
          success: false,
          error: 'No file uploaded',
          details: 'Please provide a thumbnail image file'
        });
      }

      const thumbnailUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      console.log('Successfully processed thumbnail');

      return res.status(200).json({
        success: true,
        thumbnailUrl
      });
    } catch (error) {
      console.error('Error processing thumbnail:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to process thumbnail',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
});

export default router;