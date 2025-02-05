import { Router } from 'express';
import OpenAI from 'openai';
import { z } from 'zod';

const router = Router();

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const thumbnailRequestSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
});

router.post('/generate', async (req, res) => {
  try {
    // Validate request body
    const validation = thumbnailRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validation.error.issues
      });
    }

    const { title, description } = validation.data;

    if (!process.env.OPENAI_API_KEY) {
      console.error('OpenAI API key is not configured');
      return res.status(500).json({
        error: 'OpenAI configuration error',
        details: 'API key is not configured'
      });
    }

    console.log('Generating thumbnail for:', { title, description });

    const prompt = `Create a professional, high-quality thumbnail for a ski instruction video titled "${title}"${
      description ? ` about ${description}` : ''
    }. The image should be clean, modern, and feature skiing-related imagery. Show a scenic mountain landscape with dynamic skiing action.`;

    const response = await openai.images.generate({
      prompt,
      n: 1,
      size: "1024x1024",
      model: "dall-e-3",
      quality: "standard",
      response_format: "url",
    });

    if (!response.data?.[0]?.url) {
      console.error('Invalid response from OpenAI:', response);
      return res.status(500).json({
        error: 'Invalid response from image generation service',
        details: 'No image URL in response'
      });
    }

    const imageUrl = response.data[0].url;
    console.log('Successfully generated thumbnail:', { imageUrl });
    res.json({ imageUrl });

  } catch (error) {
    console.error('Thumbnail generation error:', error);

    // Handle different types of errors
    if (error instanceof OpenAI.APIError) {
      return res.status(error.status || 500).json({
        error: 'OpenAI API error',
        details: error.message,
        code: error.code
      });
    }

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.issues
      });
    }

    res.status(500).json({ 
      error: 'Failed to generate thumbnail',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;