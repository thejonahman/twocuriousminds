import OpenAI from "openai";
import fs from "fs";
import path from "path";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
export async function analyzeImage(imagePath: string): Promise<string> {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    console.log(`Analyzing image: ${path.basename(imagePath)}`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What is the main subject or theme of this image? Please respond with one of these themes: 'skiing', 'psychology', 'business', 'science', 'learning'. Only respond with the theme, no other text." },
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

    const theme = response.choices[0].message.content.toLowerCase().trim();
    console.log(`Theme detected for ${path.basename(imagePath)}: ${theme}`);
    return theme;
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
    console.log(`Finding best image for: "${title}"`);

    // Get all images from the folder
    const files = fs.readdirSync(imagesFolder).filter(file => 
      /\.(jpg|jpeg|png|webp)$/i.test(file) && !file.includes('875752ee') && !file.includes('8fa9df90')
    );

    // Get content theme
    const contentResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: `What is the main theme of this content? Title: "${title}" Description: "${description}". Respond with only one word from: skiing, psychology, business, science, learning. Just the word, no other text.`
        }
      ],
      max_tokens: 10
    });

    const contentTheme = contentResponse.choices[0].message.content.toLowerCase().trim();
    console.log(`Content theme detected: ${contentTheme}`);

    // Analyze each image and find the best match
    const imageAnalyses = await Promise.all(
      files.map(async file => {
        const fullPath = path.join(imagesFolder, file);
        const imageTheme = await analyzeImage(fullPath);
        const score = calculateThemeMatch(contentTheme, imageTheme);
        console.log(`Score for ${file}: ${score} (${imageTheme} vs ${contentTheme})`);
        return {
          file,
          theme: imageTheme,
          score
        };
      })
    );

    // Sort by score and get the best match
    const bestMatch = imageAnalyses.sort((a, b) => b.score - a.score)[0];
    console.log(`Best match: ${bestMatch?.file} (score: ${bestMatch?.score})`);

    if (bestMatch && bestMatch.score > 0) {
      return bestMatch.file;
    }

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