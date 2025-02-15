import fs from "fs";
import path from "path";

// Simplified image finding function without AI analysis
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

    // Simple keyword matching from title/description
    const searchText = `${title} ${description}`.toLowerCase();

    // Try to find a matching image by filename
    for (const file of files) {
      const filename = file.toLowerCase();
      if (searchText.split(' ').some(word => 
        word.length > 3 && filename.includes(word)
      )) {
        return file;
      }
    }

    // If no match found, use default
    const defaultImage = files.find(file => /thumbnail_default\.(jpg|jpeg|png|webp)$/i.test(file));
    if (defaultImage) {
      return defaultImage;
    }

    // Return first image as fallback, or null if no images
    return files[0] || null;

  } catch (error) {
    console.error('Error finding image:', error);
    return null;
  }
}

// Add function to analyze a specific image file
export async function analyzeImageFile(filePath: string): Promise<string | null> {
  try {
    const imageBuffer = fs.readFileSync(filePath);
    const base64Image = imageBuffer.toString('base64');
    return await analyzeImage(base64Image);
  } catch (error) {
    console.error('Error analyzing specific image:', error);
    return null;
  }
}