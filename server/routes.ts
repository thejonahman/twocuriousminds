import { createServer, type Server } from "http";
import { db } from "@db";
import { videos, categories, userPreferences } from "@db/schema";
import { sql, eq, and, or, ne, inArray, notInArray, desc } from "drizzle-orm";
import { setupAuth } from "./auth";
import fetch from "node-fetch";
import * as fs from 'fs';
import * as path from 'path';
import { analyzeImage, findBestImageForVideo } from './lib/imageAnalysis';
import { suggestThumbnails } from './lib/thumbnailAI';

async function getThumbnailUrl(url: string, platform: string, title?: string, description?: string): Promise<string | null> {
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
      case 'tiktok':
      case 'instagram': {
        // Try to find the best matching image based on the content
        const imagesFolder = path.join(process.cwd(), 'attached_assets');
        const bestMatch = await findBestImageForVideo(
          title || '',
          description || '',
          imagesFolder
        );

        if (bestMatch) {
          const imagePath = path.join(imagesFolder, bestMatch);
          const imageBuffer = fs.readFileSync(imagePath);
          const extension = path.extname(bestMatch).substring(1);
          return `data:image/${extension};base64,${imageBuffer.toString('base64')}`;
        }

        // Fallback to text-based thumbnail if no match found
        return 'data:image/svg+xml;base64,' + Buffer.from(`
          <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#718096"/>
            <text x="640" y="360" font-family="Arial" font-size="64" fill="white" text-anchor="middle">
              ${title || 'Video Content'}
            </text>
          </svg>
        `).toString('base64');
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
  setupAuth(app);

  app.get("/api/videos", async (req, res) => {
    try {
      // Get user preferences if authenticated
      const preferences = req.user ? await db.query.userPreferences.findFirst({
        where: eq(userPreferences.userId, req.user.id),
      }) : null;

      // Build query conditions
      const conditions = [];

      // Add preference-based filters if user has preferences
      if (preferences) {
        if (preferences.excludedCategories?.length > 0) {
          conditions.push(notInArray(videos.categoryId, preferences.excludedCategories));
        }
        if (preferences.preferredCategories?.length > 0) {
          conditions.push(inArray(videos.categoryId, preferences.preferredCategories));
        }
        if (preferences.preferredPlatforms?.length > 0) {
          conditions.push(inArray(videos.platform, preferences.preferredPlatforms));
        }
      }

      const result = await db.query.videos.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: {
          category: true,
          subcategory: true,
        },
        orderBy: (videos) => [desc(videos.createdAt)],
      });

      // Update missing thumbnails
      for (const video of result) {
        if (!video.thumbnailUrl) {
          const thumbnailUrl = await getThumbnailUrl(video.url, video.platform, video.title, video.description);
          if (thumbnailUrl) {
            await db.update(videos)
              .set({ thumbnailUrl })
              .where(eq(videos.id, video.id));
            video.thumbnailUrl = thumbnailUrl;
          }
        }
      }

      res.json(result);
    } catch (error) {
      console.error('Error fetching videos:', error);
      res.status(500).json({ 
        message: "Failed to fetch videos",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
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

    if (!result.thumbnailUrl) {
      const thumbnailUrl = await getThumbnailUrl(result.url, result.platform, result.title, result.description);
      if (thumbnailUrl) {
        await db.update(videos)
          .set({ thumbnailUrl })
          .where(eq(videos.id, result.id));
        result.thumbnailUrl = thumbnailUrl;
      }
    }

    res.json(result);
  });

  app.get("/api/categories", async (_req, res) => {
    const result = await db.query.categories.findMany({
      with: {
        subcategories: true,
      },
    });
    res.json(result);
  });

  app.get("/api/preferences", async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const result = await db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, req.user.id),
    });

    if (!result) {
      const defaults = await db.insert(userPreferences)
        .values({
          userId: req.user.id,
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
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const { preferredCategories, preferredPlatforms, excludedCategories } = req.body;

    try {
      // First try to find existing preferences
      const existingPreferences = await db.query.userPreferences.findFirst({
        where: eq(userPreferences.userId, req.user.id),
      });

      let result;
      if (existingPreferences) {
        // Update existing preferences
        [result] = await db
          .update(userPreferences)
          .set({
            preferredCategories,
            preferredPlatforms,
            excludedCategories,
            updatedAt: new Date(),
          })
          .where(eq(userPreferences.userId, req.user.id))
          .returning();
      } else {
        // Insert new preferences
        [result] = await db
          .insert(userPreferences)
          .values({
            userId: req.user.id,
            preferredCategories,
            preferredPlatforms,
            excludedCategories,
          })
          .returning();
      }

      res.json(result);
    } catch (error) {
      console.error('Error saving preferences:', error);
      res.status(500).json({ message: "Failed to save preferences" });
    }
  });

  app.get("/api/videos/:id/recommendations", async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      const userId = req.user?.id;

      // Get current video
      const currentVideo = await db.query.videos.findFirst({
        where: eq(videos.id, videoId),
      });

      if (!currentVideo) {
        res.status(404).json({ message: "Video not found" });
        return;
      }

      // Get user preferences if authenticated
      const preferences = userId ? await db.query.userPreferences.findFirst({
        where: eq(userPreferences.userId, userId),
      }) : null;

      // Build recommendation query conditions
      const conditions = [ne(videos.id, videoId)];

      // Add preference-based filters if user has preferences
      if (preferences) {
        if (preferences.excludedCategories?.length > 0) {
          conditions.push(notInArray(videos.categoryId, preferences.excludedCategories));
        }
        if (preferences.preferredCategories?.length > 0) {
          conditions.push(inArray(videos.categoryId, preferences.preferredCategories));
        }
        if (preferences.preferredPlatforms?.length > 0) {
          conditions.push(inArray(videos.platform, preferences.preferredPlatforms));
        }
      } else {
        // If no preferences, use similarity-based recommendations
        conditions.push(
          or(
            eq(videos.categoryId, currentVideo.categoryId),
            eq(videos.platform, currentVideo.platform)
          )
        );
      }

      const recommendations = await db.query.videos.findMany({
        where: and(...conditions),
        with: {
          category: true,
          subcategory: true,
        },
        limit: 5,
      });

      // Update missing thumbnails for recommendations
      for (const video of recommendations) {
        if (!video.thumbnailUrl) {
          const thumbnailUrl = await getThumbnailUrl(video.url, video.platform, video.title, video.description);
          if (thumbnailUrl) {
            await db.update(videos)
              .set({ thumbnailUrl })
              .where(eq(videos.id, video.id));
            video.thumbnailUrl = thumbnailUrl;
          }
        }
      }

      res.json(recommendations);
    } catch (error) {
      console.error('Error in recommendations:', error);
      res.status(500).json({ 
        message: "Failed to get recommendations",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post("/api/videos/:id/suggest-thumbnails", async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);

      // Get video details
      const video = await db.query.videos.findFirst({
        where: eq(videos.id, videoId),
      });

      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }

      // Get AI-powered thumbnail suggestions
      const suggestions = await suggestThumbnails(
        video.title,
        video.description || ''
      );

      res.json(suggestions);
    } catch (error) {
      console.error('Error suggesting thumbnails:', error);
      res.status(500).json({ 
        message: "Failed to generate thumbnail suggestions",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return createServer(app);
}