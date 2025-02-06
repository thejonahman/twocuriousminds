import fs from "fs";
import path from "path";

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

    if (files.length === 0) {
      console.log('No image files found in folder');
      return null;
    }

    console.log('Analyzing content:', { title, description });

    // Convert content to lowercase for matching
    const contentText = `${title} ${description}`.toLowerCase();
    console.log('Content text for matching:', contentText);

    // Check for exact matches in filename
    const exactMatchFile = files.find(file => {
      const fileName = file.toLowerCase();
      return contentText.split(/\s+/).some(word => 
        word.length > 3 && fileName.includes(word)
      );
    });

    if (exactMatchFile) {
      console.log('Found exact word match:', exactMatchFile);
      return exactMatchFile;
    }

    // Look for category-based matches
    const categories = {
      'thumbnail_skiing.': ['ski', 'slope', 'mountain', 'snow'],
      'thumbnail_psychology.': ['mind', 'brain', 'think', 'mental', 'behavior'],
      'thumbnail_learning.': ['learn', 'study', 'education', 'knowledge'],
      'thumbnail_business.': ['business', 'economy', 'market', 'finance'],
      'thumbnail_science.': ['science', 'research', 'experiment', 'lab']
    };

    for (const [filePrefix, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => contentText.includes(keyword))) {
        const categoryFile = files.find(file => file.startsWith(filePrefix));
        if (categoryFile) {
          console.log('Found category match:', categoryFile);
          return categoryFile;
        }
      }
    }

    // Try to find any relevant image by checking common words
    const relevantWords = contentText.split(/\s+/).filter(word => word.length > 3);
    for (const word of relevantWords) {
      const matchingFile = files.find(file => 
        file.toLowerCase().includes(word)
      );
      if (matchingFile) {
        console.log('Found relevant word match:', matchingFile);
        return matchingFile;
      }
    }

    // If no specific match found, try to find default thumbnail
    const defaultFile = files.find(file => file.includes('thumbnail_default.'));
    if (defaultFile) {
      console.log('Using default thumbnail:', defaultFile);
      return defaultFile;
    }

    // As a last resort, use any available image
    console.log('Using first available image:', files[0]);
    return files[0];

  } catch (error) {
    console.error('Error finding best image:', error);
    return null;
  }
}