import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { videos, categories, chatMessages } from "@db/schema";
import { eq } from "drizzle-orm";
import fetch from "node-fetch";

async function getThumbnailUrl(url: string, platform: string): Promise<string | null> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  try {
    switch (platform.toLowerCase()) {
      case 'youtube': {
        const videoId = url.split('v=')[1]?.split('&')[0];
        if (!videoId) {
          console.error('Could not extract YouTube video ID from:', url);
          return null;
        }
        return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      }
      case 'tiktok': {
        try {
          // Handle both web and mobile TikTok URLs
          let tiktokUrl = url;
          if (!url.includes('www.tiktok.com')) {
            // Convert mobile URL to web URL
            const videoId = url.match(/\d+/)?.[0];
            if (!videoId) {
              console.error('Could not extract TikTok video ID from:', url);
              return null;
            }
            tiktokUrl = `https://www.tiktok.com/t/${videoId}`;
          }

          const response = await fetch(tiktokUrl, { headers });
          const html = await response.text();

          // Try different meta tag patterns
          const patterns = [
            /<meta\s+property="og:image"\s+content="([^"]+)"/i,
            /<meta\s+name="twitter:image"\s+content="([^"]+)"/i,
            /<link\s+rel="preload"\s+as="image"\s+href="([^"]+)"/i
          ];

          for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match?.[1]) return match[1];
          }

          console.error('No thumbnail found in TikTok HTML for:', url);
          return null;
        } catch (error) {
          console.error('Error fetching TikTok thumbnail:', error);
          return null;
        }
      }
      case 'instagram': {
        try {
          const match = url.match(/\/(p|reel|share)\/([^/?]+)/);
          if (match) {
            const [, , id] = match;
            // Try to get the embed version which might be more accessible
            const embedUrl = `https://www.instagram.com/p/${id}/embed/`;
            const response = await fetch(embedUrl, { headers });
            const html = await response.text();

            // Try different meta tag patterns
            const patterns = [
              /<meta\s+property="og:image"\s+content="([^"]+)"/i,
              /<meta\s+name="twitter:image"\s+content="([^"]+)"/i,
              /<img\s+class="EmbeddedMediaImage"\s+src="([^"]+)"/i
            ];

            for (const pattern of patterns) {
              const match = html.match(pattern);
              if (match?.[1]) return match[1];
            }
          }

          console.error('No thumbnail found in Instagram HTML for:', url);
          return null;
        } catch (error) {
          console.error('Error fetching Instagram thumbnail:', error);
          return null;
        }
      }
      default:
        console.error('Unsupported platform:', platform);
        return null;
    }
  } catch (error) {
    console.error('Error in getThumbnailUrl:', error);
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
        console.log(`Fetching thumbnail for video ${video.id} (${video.platform}): ${video.url}`);
        const thumbnailUrl = await getThumbnailUrl(video.url, video.platform);
        if (thumbnailUrl) {
          console.log(`Found thumbnail for video ${video.id}:`, thumbnailUrl);
          await db.update(videos)
            .set({ thumbnailUrl })
            .where(eq(videos.id, video.id));
          video.thumbnailUrl = thumbnailUrl;
        } else {
          console.log(`No thumbnail found for video ${video.id}`);
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