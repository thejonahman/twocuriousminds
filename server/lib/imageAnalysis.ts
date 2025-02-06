import fs from "fs";
import path from "path";
import { findBestImageMatch } from './aiImageAnalysis';

export async function findBestImageForVideo(
  title: string,
  description: string,
  imagesFolder: string
): Promise<string | null> {
  try {
    console.log('Starting image search for:', { title, description });

    // Try AI-powered matching first
    try {
      const aiMatch = await findBestImageMatch(title, description, imagesFolder);
      if (aiMatch) {
        console.log('Found AI-powered match:', aiMatch);
        return aiMatch;
      }
    } catch (aiError) {
      console.error('AI matching failed, falling back to basic matching:', aiError);
    }

    // Get all images from the folder
    const files = fs.readdirSync(imagesFolder).filter(file =>
      /\.(jpg|jpeg|png|webp)$/i.test(file)
    );

    if (files.length === 0) {
      console.log('No image files found in folder');
      return null;
    }

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

    // If no specific match found, try to find default thumbnail
    const defaultFile = files.find(file => file.includes('thumbnail_default.'));
    if (defaultFile) {
      console.log('Using default thumbnail:', defaultFile);
      return defaultFile;
    }

    // As a last resort, use first available image
    console.log('Using first available image:', files[0]);
    return files[0];

  } catch (error) {
    console.error('Error finding best image:', error);
    return null;
  }
}