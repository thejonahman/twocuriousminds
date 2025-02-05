import { Router } from 'express';
import { Configuration, OpenAIApi } from 'openai';
import { z } from 'zod';

const router = Router();

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

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

    const response = await openai.createImage({
      prompt,
      n: 1,
      size: "1024x1024",
      response_format: "url",
    });

    const imageUrl = response.data.data[0].url;
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
