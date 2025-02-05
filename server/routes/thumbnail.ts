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
  // Ensure we always send JSON responses
  res.setHeader('Content-Type', 'application/json');

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
    }. The image should be clean, modern, and feature skiing-related imagery. Show a scenic mountain landscape with dynamic skiing action, using high contrast and clear composition suitable for a video thumbnail.`;

    console.log('Using prompt:', prompt);

    let imageUrl: string;

    try {
      const response = await openai.images.generate({
        prompt,
        n: 1,
        size: "1024x1024",
        model: "dall-e-3",
        quality: "standard",
        response_format: "url",
      });

      console.log('OpenAI API Response:', JSON.stringify(response, null, 2));

      // Validate response structure
      if (!response?.data?.[0]?.url || typeof response.data[0].url !== 'string') {
        console.error('Invalid response structure from OpenAI:', response);
        throw new Error('Invalid response structure from OpenAI API');
      }

      imageUrl = response.data[0].url;
      console.log('Successfully generated thumbnail:', { imageUrl });

    } catch (openaiError) {
      console.error('OpenAI API error:', openaiError);
      if (openaiError instanceof OpenAI.APIError) {
        return res.status(openaiError.status || 500).json({
          error: 'OpenAI API error',
          details: openaiError.message,
          code: openaiError.code
        });
      }
      throw openaiError;
    }

    // Send successful response
    return res.status(200).json({ 
      success: true,
      imageUrl 
    });

  } catch (error) {
    console.error('Thumbnail generation error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.issues
      });
    }

    return res.status(500).json({ 
      error: 'Failed to generate thumbnail',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;