import OpenAI from "openai";
import fs from "fs";
import path from "path";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
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
            { type: "text", text: "What is the main subject or theme of this image? Respond with key themes like 'skiing', 'psychology', 'business', 'science', 'learning', etc. Only respond with the theme, no other text." },
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
  title: string,
  description: string, 
  imagesFolder: string
): Promise<string | null> {
  try {
    // Get all images from the folder
    const files = fs.readdirSync(imagesFolder).filter(file => 
      /\.(jpg|jpeg|png|webp)$/i.test(file)
    );

    // Analyze the title and description to determine the theme
    const contentResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: `What is the main theme of this content? Title: "${title}" Description: "${description}". Respond with only one word from: skiing, psychology, business, science, learning, lifestyle. Just the word, no other text.`
        }
      ],
      max_tokens: 10
    });

    const contentTheme = contentResponse.choices[0].message.content.toLowerCase().trim();

    // Analyze each image and find the best match
    const imageAnalyses = await Promise.all(
      files.map(async file => {
        const fullPath = path.join(imagesFolder, file);
        const imageTheme = await analyzeImage(fullPath);
        return {
          file,
          theme: imageTheme,
          score: calculateThemeMatch(contentTheme, imageTheme)
        };
      })
    );

    // Sort by score and get the best match
    const bestMatch = imageAnalyses.sort((a, b) => b.score - a.score)[0];
    if (bestMatch && bestMatch.score > 0) {
      return bestMatch.file;
    }

    // If no good match found, return null
    return null;
  } catch (error) {
    console.error('Error finding best image:', error);
    return null;
  }
}

function calculateThemeMatch(contentTheme: string, imageTheme: string): number {
  if (contentTheme === imageTheme) return 1;
  
  // Define related themes that might partially match
  const themeGroups = {
    learning: ['education', 'study', 'knowledge', 'school', 'teaching'],
    psychology: ['mind', 'brain', 'mental', 'thinking', 'cognitive'],
    business: ['economics', 'finance', 'corporate', 'market', 'commercial'],
    science: ['chemistry', 'physics', 'laboratory', 'experiment', 'research'],
    skiing: ['snow', 'winter', 'mountain', 'slope', 'alpine']
  };

  // Check for partial matches within theme groups
  for (const [key, related] of Object.entries(themeGroups)) {
    if ((key === contentTheme && related.includes(imageTheme)) ||
        (key === imageTheme && related.includes(contentTheme))) {
      return 0.8;
    }
  }

  return 0;
}
