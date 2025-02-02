import fs from "fs";
import path from "path";
import { promisify } from "util";

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

async function fetchRandomImage(): Promise<string | null> {
  try {
    // Using Lorem Picsum which provides random high-quality images
    const imageUrl = `https://picsum.photos/1600/900`;
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    return response.url; // This will be the URL of a random image
  } catch (error) {
    console.error("Error fetching image:", error);
    return null;
  }
}

export async function generateThumbnail(videoTitle: string, category: string, videoUrl: string, platform: string): Promise<string | null> {
  try {
    // Create thumbnails directory if it doesn't exist
    const thumbnailsDir = path.join(process.cwd(), "public", "thumbnails");
    await mkdir(thumbnailsDir, { recursive: true });

    // Get random image URL
    const imageUrl = await fetchRandomImage();
    if (!imageUrl) {
      console.error("Could not fetch image for:", videoTitle);
      return null;
    }

    // Download the image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.statusText}`);
    }

    // Generate a unique filename based on the video title
    const safeTitle = videoTitle.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const filename = `${safeTitle}-${Date.now()}.jpg`;
    const filePath = path.join(thumbnailsDir, filename);

    // Save the image
    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await writeFile(filePath, buffer);

    console.log(`Generated thumbnail for "${videoTitle}": ${filename}`);
    return `/thumbnails/${filename}`;
  } catch (error) {
    console.error("Error generating thumbnail:", error);
    return null;
  }
}