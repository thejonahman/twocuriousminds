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

    // Find matching image with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Image search timed out')), 5000);
    });

    const imageSearchPromise = findBestImageForVideo(
      title,
      description || '',
      imagesFolder
    );

    const fileName = await Promise.race([imageSearchPromise, timeoutPromise])
      .catch(error => {
        console.error('Image search failed or timed out:', error);
        return null;
      });

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
      // Generate enhanced fallback SVG with gradient background and better typography
      console.log('No matching image found, generating enhanced SVG fallback');
      const sanitizedTitle = title
        .replace(/[<>]/g, '')
        .substring(0, 50);

      const svgContent = `
        <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#2563eb;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#1d4ed8;stop-opacity:1" />
            </linearGradient>
            <filter id="shadow">
              <feDropShadow dx="2" dy="2" stdDeviation="2" flood-opacity="0.3"/>
            </filter>
          </defs>
          <rect width="100%" height="100%" fill="url(#grad)"/>
          <rect x="5%" y="5%" width="90%" height="90%" fill="none" 
                stroke="rgba(255,255,255,0.1)" stroke-width="2"/>
          <text x="640" y="360" 
                font-family="Arial, sans-serif" 
                font-size="48" 
                font-weight="bold"
                fill="white" 
                text-anchor="middle" 
                dominant-baseline="middle"
                filter="url(#shadow)"
                style="text-transform: capitalize;">
            ${sanitizedTitle}
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
    return res.status(500).json({ 
      success: false,
      error: 'Thumbnail generation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;