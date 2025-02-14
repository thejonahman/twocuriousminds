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
    console.log('Processing uploaded file:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });

    if (!file.mimetype.startsWith('image/')) {
      console.error('Invalid file type:', file.mimetype);
      cb(new Error('Only image files are allowed'));
      return;
    }
    console.log('File type validated successfully');
    cb(null, true);
  }
});

const thumbnailRequestSchema = z.object({
  url: z.string().url("Must be a valid URL"),
  platform: z.enum(["youtube", "tiktok", "instagram"]),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  videoId: z.number()
});

router.post('/generate', async (req, res) => {
  try {
    console.log('Starting thumbnail generation request:', req.body);

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
    console.log('Processing request for:', { title, description, videoId, url, platform });

    // Get images folder path
    const imagesFolder = path.join(process.cwd(), 'attached_assets');
    console.log('Using images folder:', imagesFolder);

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
    console.log('Found matching file:', fileName);

    let thumbnailUrl: string;

    if (fileName) {
      // Read and convert the image
      try {
        const imagePath = path.join(imagesFolder, fileName);
        const imageBuffer = fs.readFileSync(imagePath);
        const extension = path.extname(fileName).substring(1);
        thumbnailUrl = `data:image/${extension};base64,${imageBuffer.toString('base64')}`;
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

    console.log('Sending successful response');
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
router.patch('/:videoId/thumbnail', upload.single('thumbnail'), async (req, res) => {
  try {
    console.log('Processing thumbnail upload request for video:', req.params.videoId);
    console.log('Request headers:', req.headers);
    console.log('Request files:', req.file);

    if (!req.file) {
      console.error('No file provided in request');
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
        details: 'Please provide a thumbnail image file'
      });
    }

    // Convert the uploaded file to base64
    const thumbnailUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    console.log('Successfully processed uploaded thumbnail');

    return res.status(200).json({
      success: true,
      thumbnailUrl
    });
  } catch (error) {
    console.error('Error uploading thumbnail:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to upload thumbnail',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;