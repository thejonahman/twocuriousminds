import OpenAI from "openai";
import fs from "fs";
import path from "path";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface ImageAnalysisResult {
  fileName: string;
  score: number;
  reason: string;
}

export async function analyzeImageContent(
  imagePath: string
): Promise<string | null> {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    const response = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Describe this image's main subject, style, and mood in a concise way. Focus on key elements that would make it suitable as a video thumbnail."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ],
        },
      ],
      max_tokens: 200,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error analyzing image:', error);
    return null;
  }
}

export async function findBestImageMatch(
  title: string,
  description: string,
  imagesFolder: string
): Promise<string | null> {
  try {
    // Get content understanding first
    const contentAnalysis = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "system",
          content: "You are an expert at analyzing video content and finding suitable thumbnail images. Focus on identifying key visual elements that would make a good thumbnail."
        },
        {
          role: "user",
          content: `Analyze this video content and describe what visual elements would make a good thumbnail:
            Title: ${title}
            Description: ${description}`
        }
      ],
      temperature: 0.7,
      max_tokens: 200
    });

    const contentUnderstanding = contentAnalysis.choices[0].message.content;
    console.log('Content understanding:', contentUnderstanding);

    // Get all images
    const files = fs.readdirSync(imagesFolder).filter(file =>
      /\.(jpg|jpeg|png|webp)$/i.test(file)
    );

    if (files.length === 0) return null;

    // Analyze each image
    const analysisResults: ImageAnalysisResult[] = [];

    // Analyze up to 5 images to stay within rate limits
    const imagesToAnalyze = files.slice(0, 5);

    for (const file of imagesToAnalyze) {
      const imagePath = path.join(imagesFolder, file);
      const imageAnalysis = await analyzeImageContent(imagePath);

      if (imageAnalysis) {
        // Compare image analysis with content understanding using simpler comparison
        const matchScore = await evaluateMatch(contentUnderstanding || "", imageAnalysis);

        analysisResults.push({
          fileName: file,
          score: matchScore.score,
          reason: matchScore.reason
        });
      }
    }

    // Sort by score and get best match
    analysisResults.sort((a, b) => b.score - a.score);
    console.log('Analysis results:', analysisResults);

    if (analysisResults.length > 0 && analysisResults[0].score > 0.6) {
      return analysisResults[0].fileName;
    }

    return null;
  } catch (error) {
    console.error('Error in AI image matching:', error);
    return null;
  }
}

async function evaluateMatch(contentDescription: string, imageDescription: string): Promise<{ score: number; reason: string }> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "system",
          content: "You are an expert at matching video content with thumbnail images. Score matches from 0-1 and explain why."
        },
        {
          role: "user",
          content: `How well does this image match the video content? Score from 0-1 and explain why.
            Video content: ${contentDescription}
            Image description: ${imageDescription}

            Respond in JSON format like: {"score": 0.8, "reason": "explanation"}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 150
    });

    const result = JSON.parse(response.choices[0].message.content);
    return {
      score: result.score,
      reason: result.reason
    };
  } catch (error) {
    console.error('Error evaluating match:', error);
    return { score: 0, reason: "Error evaluating match" };
  }
}