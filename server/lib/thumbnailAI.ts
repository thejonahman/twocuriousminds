import OpenAI from 'openai';
import path from 'path';
import fs from 'fs';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ThumbnailSuggestion {
  imageUrl: string;
  confidence: number;
  reasoning: string;
}

export async function analyzeThumbnailContent(videoTitle: string, videoDescription: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are an expert at analyzing video content and suggesting appropriate thumbnail imagery. Consider engagement, clarity, and relevance in your suggestions."
        },
        {
          role: "user",
          content: `Analyze this video content and suggest key visual elements for a thumbnail:
          Title: ${videoTitle}
          Description: ${videoDescription}
          
          Provide a brief description of what the thumbnail should contain to best represent this content.`
        }
      ],
      max_tokens: 150,
    });

    return response.choices[0]?.message?.content || "";
  } catch (error) {
    console.error('Error analyzing thumbnail content:', error);
    throw new Error('Failed to analyze video content for thumbnail suggestions');
  }
}

export async function suggestThumbnails(
  videoTitle: string, 
  videoDescription: string
): Promise<ThumbnailSuggestion[]> {
  try {
    // Get AI analysis of the content
    const analysis = await analyzeThumbnailContent(videoTitle, videoDescription);
    
    // Get available images from assets
    const imagesFolder = path.join(process.cwd(), 'attached_assets');
    const files = await fs.promises.readdir(imagesFolder);
    const imageFiles = files.filter(file => 
      /\.(jpg|jpeg|png|webp)$/i.test(file)
    );

    // Use OpenAI to evaluate each image against the analysis
    const suggestions: ThumbnailSuggestion[] = [];
    
    for (const imageFile of imageFiles) {
      const imageBuffer = await fs.promises.readFile(path.join(imagesFolder, imageFile));
      const base64Image = imageBuffer.toString('base64');
      
      const response = await openai.chat.completions.create({
        model: "gpt-4-vision-preview",
        messages: [
          {
            role: "system",
            content: "Evaluate how well this image matches the video content description. Consider relevance, visual appeal, and potential engagement."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Video Title: ${videoTitle}\nVideo Description: ${videoDescription}\nDesired Thumbnail: ${analysis}\n\nRate how well this image matches (0-100) and explain why.`
              },
              {
                type: "image_url",
                image_url: `data:image/${path.extname(imageFile).slice(1)};base64,${base64Image}`
              }
            ]
          }
        ],
        max_tokens: 150,
      });

      const evaluation = response.choices[0]?.message?.content || "";
      const confidenceMatch = evaluation.match(/(\d+)/);
      const confidence = confidenceMatch ? parseInt(confidenceMatch[0]) : 0;

      suggestions.push({
        imageUrl: `/attached_assets/${imageFile}`,
        confidence,
        reasoning: evaluation
      });
    }

    // Sort by confidence and return top suggestions
    return suggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);
    
  } catch (error) {
    console.error('Error suggesting thumbnails:', error);
    throw new Error('Failed to generate thumbnail suggestions');
  }
}
