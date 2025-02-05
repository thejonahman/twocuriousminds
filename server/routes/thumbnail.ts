import { Router } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { findBestImageForVideo } from '../lib/imageAnalysis';

const router = Router();

const thumbnailRequestSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
});

router.post('/generate', async (req, res) => {
  console.log('Starting thumbnail generation request:', req.body);

  try {
    // Set content type immediately
    res.setHeader('Content-Type', 'application/json');

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

    const { title, description } = validation.data;
    console.log('Processing request for:', { title, description });

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

    let imageUrl: string;

    if (fileName) {
      // Read and convert the image
      try {
        const imagePath = path.join(imagesFolder, fileName);
        const imageBuffer = fs.readFileSync(imagePath);
        const extension = path.extname(fileName).substring(1);
        imageUrl = `data:image/${extension};base64,${imageBuffer.toString('base64')}`;
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
          <text x="640" y="360" font-family="Arial" font-size="64" fill="white" text-anchor="middle" dominant-baseline="middle">
            ${title}
          </text>
        </svg>
      `;
      imageUrl = 'data:image/svg+xml;base64,' + Buffer.from(svgContent.trim()).toString('base64');
    }

    // Send successful response
    console.log('Sending successful response');
    return res.status(200).json({ 
      success: true,
      imageUrl 
    });

  } catch (error) {
    console.error('Unhandled error in thumbnail generation:', error);
    // Ensure we're still sending JSON even in case of errors
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ 
      success: false,
      error: 'Thumbnail generation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;