import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { videos, categories, chatMessages } from "@db/schema";
import { eq } from "drizzle-orm";
import fetch from "node-fetch";

async function getThumbnailUrl(url: string, platform: string): Promise<string | null> {
  try {
    switch (platform.toLowerCase()) {
      case 'youtube': {
        const videoId = url.split('v=')[1]?.split('&')[0];
        return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      }
      case 'tiktok': {
        const response = await fetch(url);
        const html = await response.text();
        const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/);
        return ogImage ? ogImage[1] : null;
      }
      case 'instagram': {
        const response = await fetch(url);
        const html = await response.text();
        const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/);
        return ogImage ? ogImage[1] : null;
      }
      default:
        return null;
    }
  } catch (error) {
    console.error('Error fetching thumbnail:', error);
    return null;
  }
}

export function registerRoutes(app: Express): Server {
  // Videos endpoints
  app.get("/api/videos", async (_req, res) => {
    const result = await db.query.videos.findMany({
      with: {
        category: true,
        subcategory: true,
      },
      orderBy: (videos) => [videos.title],
    });

    // Update missing thumbnails
    for (const video of result) {
      if (!video.thumbnailUrl) {
        const thumbnailUrl = await getThumbnailUrl(video.url, video.platform);
        if (thumbnailUrl) {
          await db.update(videos)
            .set({ thumbnailUrl })
            .where(eq(videos.id, video.id));
          video.thumbnailUrl = thumbnailUrl;
        }
      }
    }

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

    // Update thumbnail if missing
    if (!result.thumbnailUrl) {
      const thumbnailUrl = await getThumbnailUrl(result.url, result.platform);
      if (thumbnailUrl) {
        await db.update(videos)
          .set({ thumbnailUrl })
          .where(eq(videos.id, result.id));
        result.thumbnailUrl = thumbnailUrl;
      }
    }

    res.json(result);
  });

  // Categories endpoints
  app.get("/api/categories", async (_req, res) => {
    const result = await db.query.categories.findMany({
      with: {
        subcategories: true,
      },
    });
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