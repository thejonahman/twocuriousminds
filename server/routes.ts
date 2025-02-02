import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { videos, categories, subcategories, chatMessages } from "@db/schema";
import { eq } from "drizzle-orm";
import path from "path";
import express from "express";
import { generateThumbnail } from "./utils/thumbnail-generator";
import { parse } from "csv-parse";
import fs from "fs";

export function registerRoutes(app: Express): Server {
  // Serve thumbnail images with proper encoding
  app.use('/thumbnails', express.static(path.join(process.cwd(), "public", "thumbnails")));

  // Import videos from CSV
  app.post("/api/import-videos", async (_req, res) => {
    try {
      const csvPath = path.join(process.cwd(), "attached_assets", "Videos links 18dddbcd8a1080daa23ad9562f0ed3e4_all.csv");
      const fileContent = fs.readFileSync(csvPath, 'utf-8');

      const records: any[] = await new Promise((resolve, reject) => {
        parse(fileContent, { 
          columns: true,
          skip_empty_lines: true,
          trim: true,
          quote: '"',
          escape: '"',
          relaxColumnCount: true
        }, (err, records) => {
          if (err) reject(err);
          else resolve(records);
        });
      });

      const results = [];

      for (const record of records) {
        try {
          // First, create or get the category
          const [category] = await db.insert(categories)
            .values({ name: record.Topic.split(" (")[0] })
            .onConflictDoNothing()
            .returning();

          let subcategory = null;
          if (record.Subcategory) {
            const [sub] = await db.insert(subcategories)
              .values({ 
                name: record.Subcategory, 
                categoryId: category.id 
              })
              .onConflictDoNothing()
              .returning();
            subcategory = sub;
          }

          // Determine platform from URL
          let platform = "unknown";
          if (record.URL.includes("tiktok.com")) platform = "tiktok";
          else if (record.URL.includes("instagram.com")) platform = "instagram";
          else if (record.URL.includes("youtube.com")) platform = "youtube";

          // Try to generate thumbnail
          console.log(`Generating thumbnail for: ${record.Name}`);
          const thumbnailUrl = await generateThumbnail(
            record.Name,
            record.Topic.split(" (")[0],
            record.URL,
            platform
          );
          console.log(`Thumbnail result for ${record.Name}:`, thumbnailUrl || "Using fallback icon");

          // Insert video
          const [video] = await db.insert(videos)
            .values({
              title: record.Name,
              url: record.URL,
              thumbnailUrl,
              platform,
              categoryId: category.id,
              subcategoryId: subcategory?.id || null,
              watched: record.Status === "Already watched",
            })
            .onConflictDoNothing()
            .returning();

          if (video) {
            results.push({
              id: video.id,
              title: video.title,
              thumbnailUrl: video.thumbnailUrl
            });
          }
        } catch (error) {
          console.error(`Error processing record: ${record.Name}`, error);
        }
      }

      res.json({ 
        message: "Videos imported successfully", 
        count: results.length,
        videos: results 
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error("Error importing videos:", error);
      res.status(500).json({ message: "Failed to import videos", error: errorMessage });
    }
  });

  // Videos endpoints
  app.get("/api/videos", async (_req, res) => {
    const result = await db.query.videos.findMany({
      with: {
        category: true,
        subcategory: true,
      },
      orderBy: (videos) => [videos.title],
    });
    res.json(result);
  });

  app.get("/api/videos/:id", async (req, res) => {
    const result = await db.query.videos.findFirst({
      where: eq(videos.id, parseInt(req.params.id)),
      with: {
        category: true,
        subcategory: true,
      },
    });

    if (!result) {
      res.status(404).json({ message: "Video not found" });
      return;
    }

    res.json(result);
  });

  // Chat messages endpoints
  app.post("/api/chat", async (req, res) => {
    const { videoId, question } = req.body;

    try {
      // Call Delphi.ai API
      const delphiResponse = await fetch("https://delphi.ai/jonah/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });

      const answer = await delphiResponse.text();

      const message = await db.insert(chatMessages).values({
        videoId,
        question,
        answer
      }).returning();

      res.json(message[0]);
    } catch (error) {
      res.status(500).json({ message: "Failed to get chat response" });
    }
  });

  app.get("/api/chat/:videoId", async (req, res) => {
    const messages = await db.query.chatMessages.findMany({
      where: eq(chatMessages.videoId, parseInt(req.params.videoId)),
      orderBy: (messages) => [messages.createdAt],
    });
    res.json(messages);
  });

  const httpServer = createServer(app);
  return httpServer;
}