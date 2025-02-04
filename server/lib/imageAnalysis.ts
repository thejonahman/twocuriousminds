import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { videos } from "../../client/src/lib/videos";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function analyzeImage(imagePath: string): Promise<string> {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What is the main subject or theme of this image? Respond with key themes like 'business', 'startup', 'retail', 'investment', etc. Only respond with the theme, no other text." },
            {
              type: "image_url",
              image_url: {
                url: `data:image/${path.extname(imagePath).slice(1)};base64,${base64Image}`
              }
            }
          ],
        },
      ],
      max_tokens: 50
    });

    return response.choices[0].message.content.toLowerCase().trim();
  } catch (error) {
    console.error('Error analyzing image:', error);
    return '';
  }
}

export async function findBestImageForVideo(
  videoId: string,
  assetsDir: string
): Promise<string | null> {
  try {
    // Find the video details
    const video = videos.find(v => v.id === videoId);
    if (!video) return null;

    // Get all images from the assets directory
    const files = fs.readdirSync(assetsDir).filter(file => 
      /\.(jpg|jpeg|png|webp)$/i.test(file)
    );

    // For each video title/category, define relevant keywords
    const keywordMap = {
      "Rent the runway": ["fashion", "retail", "startup", "business"],
      "Grocery store": ["retail", "store", "business", "shopping"],
      "Buffet": ["finance", "investment", "business", "money"]
    };

    // Get relevant keywords for this video
    const relevantKeywords = Object.entries(keywordMap).find(([key]) => 
      video.title.toLowerCase().includes(key.toLowerCase())
    )?.[1] || [];

    // Analyze each image and find the best match
    const imageAnalyses = await Promise.all(
      files.map(async file => {
        const fullPath = path.join(assetsDir, file);
        const imageTheme = await analyzeImage(fullPath);
        return {
          file,
          theme: imageTheme,
          score: calculateMatchScore(imageTheme, relevantKeywords)
        };
      })
    );

    // Sort by score and get the best match
    const bestMatch = imageAnalyses.sort((a, b) => b.score - a.score)[0];

    if (bestMatch && bestMatch.score > 0) {
      return `/attached_assets/${bestMatch.file}`;
    }

    // If no good match found, return default business image
    return "/attached_assets/thumbnail_business.jpg";
  } catch (error) {
    console.error('Error finding best image:', error);
    return null;
  }
}

function calculateMatchScore(imageTheme: string, relevantKeywords: string[]): number {
  // Direct match with any keyword
  if (relevantKeywords.some(keyword => imageTheme.includes(keyword))) {
    return 1;
  }

  // Partial match (check if any keyword is partially contained in the theme)
  if (relevantKeywords.some(keyword => 
    imageTheme.includes(keyword.substring(0, 4)) || 
    keyword.includes(imageTheme.substring(0, 4))
  )) {
    return 0.5;
  }

  return 0;
}