import { Router } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';

const router = Router();

const thumbnailRequestSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
});

router.post('/generate', async (req, res) => {
  try {
    console.log('Received thumbnail generation request:', req.body);

    // Validate request body
    const validation = thumbnailRequestSchema.safeParse(req.body);
    if (!validation.success) {
      console.error('Validation failed:', validation.error);
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validation.error.issues
      });
    }

    const { title, description } = validation.data;

    // Get a suitable image from our assets
    const imagesFolder = path.join(process.cwd(), 'attached_assets');
    let imageUrl: string;

    try {
      // Try to find a matching image
      const fileName = await findBestImageForVideo(
        title,
        description || '',
        imagesFolder
      );

      if (fileName) {
        // If we found a matching image, read and convert it
        const imagePath = path.join(imagesFolder, fileName);
        const imageBuffer = fs.readFileSync(imagePath);
        const extension = path.extname(fileName).substring(1);
        imageUrl = `data:image/${extension};base64,${imageBuffer.toString('base64')}`;
      } else {
        // Generate a fallback SVG
        imageUrl = 'data:image/svg+xml;base64,' + Buffer.from(`
          <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#2563eb"/>
            <text x="640" y="360" font-family="Arial" font-size="64" fill="white" text-anchor="middle" dominant-baseline="middle">
              ${title}
            </text>
          </svg>
        `).toString('base64');
      }

      // Send successful response
      return res.json({ 
        success: true,
        imageUrl 
      });

    } catch (error) {
      console.error('Error processing image:', error);
      return res.status(500).json({
        error: 'Failed to process image',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }

  } catch (error) {
    console.error('Thumbnail generation error:', error);
    return res.status(500).json({ 
      error: 'Failed to generate thumbnail',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;

// Placeholder for the image selection logic.  This needs to be implemented.
async function findBestImageForVideo(title: string, description: string, imagesFolder: string): Promise<string | null> {
  // Implement your image selection logic here.  This function should return the filename
  // of the best matching image, or null if no suitable image is found.  Consider using
  // string matching techniques to find images that best match the title and description.

  // Example (replace with your actual logic):
  const files = fs.readdirSync(imagesFolder);
  const matchingFile = files.find(file => file.includes(title.toLowerCase()));
  return matchingFile || null;
}