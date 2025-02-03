import { createServer, type Server } from "http";
import { db } from "@db";
import { videos, categories, recommendationPreferences } from "@db/schema";
import { sql, eq, and, or, ne, inArray, notInArray } from "drizzle-orm";
import fetch from "node-fetch";

async function getThumbnailUrl(url: string, platform: string): Promise<string | null> {
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
        // Placeholder image for TikTok videos
        return 'https://placehold.co/600x800/1F1F1F/FFFFFF?text=TikTok+Video';
      }
      case 'instagram': {
        // Placeholder image for Instagram content
        return 'https://placehold.co/600x600/1F1F1F/FFFFFF?text=Instagram+Content';
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

export function registerRoutes(app: any): Server {
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

  // Add preferences endpoints
  app.get("/api/preferences", async (req, res) => {
    const sessionId = req.session?.id;
    if (!sessionId) {
      res.status(401).json({ message: "No session found" });
      return;
    }

    const result = await db.query.recommendationPreferences.findFirst({
      where: eq(recommendationPreferences.sessionId, sessionId),
    });

    if (!result) {
      // Create default preferences
      const defaults = await db.insert(recommendationPreferences)
        .values({
          sessionId,
          preferredCategories: [],
          preferredPlatforms: [],
          excludedCategories: [],
        })
        .returning();
      res.json(defaults[0]);
      return;
    }

    res.json(result);
  });

  app.post("/api/preferences", async (req, res) => {
    const sessionId = req.session?.id;
    if (!sessionId) {
      res.status(401).json({ message: "No session found" });
      return;
    }

    const { preferredCategories, preferredPlatforms, excludedCategories } = req.body;

    try {
      const result = await db
        .insert(recommendationPreferences)
        .values({
          sessionId,
          preferredCategories,
          preferredPlatforms,
          excludedCategories,
        })
        .onConflictDoUpdate({
          target: recommendationPreferences.sessionId,
          set: {
            preferredCategories,
            preferredPlatforms,
            excludedCategories,
            updatedAt: new Date(),
          },
        })
        .returning();

      res.json(result[0]);
    } catch (error) {
      console.error('Error saving preferences:', error);
      res.status(500).json({ message: "Failed to save preferences" });
    }
  });

  app.get("/api/videos/:id/recommendations", async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);

      // Get current video
      const currentVideo = await db.query.videos.findFirst({
        where: eq(videos.id, videoId),
      });

      if (!currentVideo) {
        res.status(404).json({ message: "Video not found" });
        return;
      }

      // Get recommendations based on current video
      const recommendations = await db.query.videos.findMany({
        where: and(
          ne(videos.id, videoId),
          or(
            eq(videos.categoryId, currentVideo.categoryId),
            eq(videos.platform, currentVideo.platform)
          )
        ),
        with: {
          category: true,
          subcategory: true,
        },
        limit: 5,
      });

      res.json(recommendations);
    } catch (error) {
      console.error('Error in recommendations:', error);
      res.status(500).json({ 
        message: "Failed to get recommendations",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return createServer(app);
}