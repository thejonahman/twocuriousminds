import fs from "fs";
import path from "path";
import { promisify } from "util";

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

// Function to extract video ID from different platforms
function extractVideoId(url: string, platform: string): string | null {
  try {
    switch (platform) {
      case 'youtube':
        const youtubeMatch = url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/);
        return youtubeMatch ? youtubeMatch[1] : null;
      case 'tiktok':
        const tiktokMatch = url.match(/video\/(\d+)/);
        return tiktokMatch ? tiktokMatch[1] : null;
      default:
        return null;
    }
  } catch (error) {
    console.error("Error extracting video ID:", error);
    return null;
  }
}

export async function generateThumbnail(videoTitle: string, category: string, videoUrl: string, platform: string): Promise<string> {
  try {
    // Create thumbnails directory if it doesn't exist
    const thumbnailsDir = path.join(process.cwd(), "public", "thumbnails");
    await mkdir(thumbnailsDir, { recursive: true });

    // Generate a unique filename based on the video title
    const safeTitle = videoTitle.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const filename = `${safeTitle}-${Date.now()}.jpg`;
    const filePath = path.join(thumbnailsDir, filename);

    // Try to get platform-specific thumbnail
    const videoId = extractVideoId(videoUrl, platform);
    let thumbnailUrl: string | null = null;

    if (videoId) {
      switch (platform) {
        case 'youtube':
          thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
          break;
        case 'tiktok':
          // TikTok doesn't provide direct thumbnail URLs, fallback to category icon
          break;
      }
    }

    if (thumbnailUrl) {
      try {
        const response = await fetch(thumbnailUrl);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          await writeFile(filePath, buffer);
          console.log(`Generated thumbnail for "${videoTitle}": ${filename}`);
          return `/thumbnails/${filename}`;
        }
      } catch (error) {
        console.error("Error fetching platform thumbnail:", error);
      }
    }

    // Fallback: Return null to indicate that no thumbnail could be generated
    // The frontend will handle this by showing a category-specific icon
    return null;
  } catch (error) {
    console.error("Error generating thumbnail:", error);
    return null;
  }
}