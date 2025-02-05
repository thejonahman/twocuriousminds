import fs from "fs";
import path from "path";

// Simple content-based image matching without OpenAI
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

    // Define keywords for different categories
    const categoryKeywords = {
      technique: ['turn', 'posture', 'position', 'stance', 'form', 'technique', 'ski', 'skiing'],
      beginner: ['basic', 'beginner', 'start', 'learning', 'first', 'new'],
      advanced: ['advanced', 'expert', 'professional', 'steep', 'difficult'],
      equipment: ['gear', 'equipment', 'boot', 'ski', 'pole', 'binding'],
      safety: ['safety', 'precaution', 'warning', 'careful', 'protect'],
    };

    // Convert content to lowercase for matching
    const contentText = `${title} ${description}`.toLowerCase();

    // Find matching category based on keywords
    let bestCategory = 'general';
    let maxMatches = 0;

    Object.entries(categoryKeywords).forEach(([category, keywords]) => {
      const matches = keywords.filter(keyword => 
        contentText.includes(keyword.toLowerCase())
      ).length;

      if (matches > maxMatches) {
        maxMatches = matches;
        bestCategory = category;
      }
    });

    // Map categories to specific image patterns
    const categoryPatterns: Record<string, RegExp[]> = {
      technique: [/turn/i, /posture/i, /ski.*technique/i],
      beginner: [/basic/i, /begin/i, /learn/i],
      advanced: [/steep/i, /advanced/i, /expert/i],
      equipment: [/gear/i, /equipment/i, /boot/i],
      safety: [/safety/i, /protect/i],
      general: [/ski/i, /snow/i, /mountain/i],
    };

    // Find first matching image based on category
    const patterns = categoryPatterns[bestCategory] || categoryPatterns.general;
    for (const pattern of patterns) {
      const matchingFile = files.find(file => pattern.test(file));
      if (matchingFile) {
        return matchingFile;
      }
    }

    // Default to a general skiing image if no match found
    const defaultImages = files.filter(file => /ski|snow|mountain/i.test(file));
    if (defaultImages.length > 0) {
      return defaultImages[Math.floor(Math.random() * defaultImages.length)];
    }

    // Fallback to generating an SVG with the title
    return null;

  } catch (error) {
    console.error('Error finding best image:', error);
    return null;
  }
}