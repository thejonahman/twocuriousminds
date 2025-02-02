import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { promisify } from "util";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024
const openai = new OpenAI();

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

export async function generateThumbnail(videoTitle: string, category: string): Promise<string> {
  try {
    const prompt = `Create an educational thumbnail image for a video titled "${videoTitle}" in the category "${category}". 
    Style: Modern, clean, professional education platform look.
    Must include: Visual elements that clearly represent the topic, simple iconography, and a clean background.
    Do not include: Text, watermarks, or complex patterns.`;

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
    });

    const imageUrl = response.data[0].url;
    if (!imageUrl) {
      throw new Error("No image URL received from OpenAI");
    }

    // Download the image
    const imageResponse = await fetch(imageUrl);
    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Create thumbnails directory if it doesn't exist
    const thumbnailsDir = path.join(process.cwd(), "public", "thumbnails");
    await mkdir(thumbnailsDir, { recursive: true });

    // Generate a unique filename based on the video title
    const safeTitle = videoTitle.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const filename = `${safeTitle}-${Date.now()}.png`;
    const filePath = path.join(thumbnailsDir, filename);

    // Save the image
    await writeFile(filePath, buffer);

    return `/thumbnails/${filename}`;
  } catch (error) {
    console.error("Error generating thumbnail:", error);
    throw error;
  }
}
