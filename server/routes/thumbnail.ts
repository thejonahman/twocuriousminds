import { Router } from 'express';
import OpenAI from 'openai';
import { z } from 'zod';

const router = Router();

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const thumbnailRequestSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
});

router.post('/generate', async (req, res) => {
  try {
    const { title, description } = thumbnailRequestSchema.parse(req.body);

    const prompt = `Create a professional, high-quality thumbnail for a ski instruction video titled "${title}"${
      description ? ` about ${description}` : ''
    }. The image should be clean, modern, and feature skiing-related imagery.`;

    const response = await openai.images.generate({
      prompt,
      n: 1,
      size: "1024x1024",
      model: "dall-e-3",
      quality: "standard",
      response_format: "url",
    });

    const imageUrl = response.data[0].url;
    res.json({ imageUrl });
  } catch (error) {
    console.error('Thumbnail generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate thumbnail',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;