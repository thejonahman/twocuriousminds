import { createServer, type Server } from "http";
import { db } from "@db";
import { videos, categories, userPreferences } from "@db/schema";
import { sql, eq, and, or, ne, inArray, notInArray, desc } from "drizzle-orm";
import { setupAuth } from "./auth";
import fetch from "node-fetch";

async function getThumbnailUrl(url: string, platform: string, title?: string): Promise<string | null> {
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
        const titleLower = title?.toLowerCase() || '';

        // RSD/ADHD themed thumbnail
        if (titleLower.includes('rsd') || titleLower.includes('adhd')) {
          return 'data:image/svg+xml;base64,' + Buffer.from(`
            <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="smallGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="white" stroke-width="0.5" opacity="0.1"/>
                </pattern>
              </defs>

              <!-- Background -->
              <rect width="100%" height="100%" fill="#4A148C"/>
              <rect width="100%" height="100%" fill="url(#smallGrid)"/>

              <!-- Content area -->
              <rect x="40" y="40" width="1200" height="640" rx="20" fill="white" opacity="0.97"/>

              <!-- Main visual element -->
              <circle cx="400" cy="360" r="200" fill="#FFB6C1" opacity="0.9"/>
              <circle cx="400" cy="360" r="180" fill="#FF69B4" opacity="0.7"/>

              <!-- Title and subtitle -->
              <text x="800" y="300" font-family="Arial" font-size="80" fill="#333" text-anchor="middle" font-weight="bold">
                ${titleLower.includes('rsd') ? 'RSD and ADHD' : 'ADHD Basics'}
              </text>
              <text x="800" y="400" font-family="Arial" font-size="48" fill="#666" text-anchor="middle">
                ${titleLower.includes('rsd') ? 'Understanding RSD' : 'Learning About ADHD'}
              </text>

              <!-- Decorative elements -->
              <circle cx="200" cy="600" r="30" fill="#4A148C" opacity="0.2"/>
              <circle cx="1080" cy="600" r="30" fill="#4A148C" opacity="0.2"/>
            </svg>
          `).toString('base64');
        }

        // Skiing themed thumbnail
        if (titleLower.includes('ski') || titleLower.includes('skiing')) {
          return 'data:image/svg+xml;base64,' + Buffer.from(`
            <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="snowPattern" width="50" height="50" patternUnits="userSpaceOnUse">
                  <circle cx="25" cy="25" r="2" fill="white" opacity="0.3"/>
                  <circle cx="0" cy="0" r="2" fill="white" opacity="0.3"/>
                  <circle cx="50" cy="50" r="2" fill="white" opacity="0.3"/>
                </pattern>
              </defs>

              <!-- Background with gradient -->
              <rect width="100%" height="100%" fill="#2C5282"/>
              <rect width="100%" height="100%" fill="url(#snowPattern)"/>

              <!-- Content area -->
              <rect x="40" y="40" width="1200" height="640" rx="20" fill="white" opacity="0.97"/>

              <!-- Mountain silhouette -->
              <path d="M40 680 L440 200 L840 680 Z" fill="#2B6CB0" opacity="0.2"/>
              <path d="M640 680 L1040 280 L1240 680 Z" fill="#2B6CB0" opacity="0.3"/>

              <!-- Title -->
              <text x="640" y="360" font-family="Arial" font-size="64" fill="#2D3748" text-anchor="middle" font-weight="bold">
                <tspan x="640" dy="0">${title?.length > 60 ? title.substring(0, 60) + '...' : title}</tspan>
              </text>
            </svg>
          `).toString('base64');
        }

        // Learning/Education themed thumbnail
        if (titleLower.includes('learn') || titleLower.includes('how to') || titleLower.includes('guide')) {
          return 'data:image/svg+xml;base64,' + Buffer.from(`
            <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="gridPattern" width="30" height="30" patternUnits="userSpaceOnUse">
                  <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#E2E8F0" stroke-width="1"/>
                </pattern>
              </defs>

              <!-- Background -->
              <rect width="100%" height="100%" fill="#EDF2F7"/>
              <rect width="100%" height="100%" fill="url(#gridPattern)"/>

              <!-- Content area -->
              <rect x="40" y="40" width="1200" height="640" rx="20" fill="white" opacity="0.97"/>

              <!-- Decorative elements -->
              <circle cx="300" cy="360" r="160" fill="#4299E1" opacity="0.1"/>
              <circle cx="300" cy="360" r="120" fill="#4299E1" opacity="0.2"/>

              <!-- Title -->
              <text x="700" y="360" font-family="Arial" font-size="64" fill="#2D3748" text-anchor="middle" font-weight="bold">
                <tspan x="700" dy="0">${title?.length > 60 ? title.substring(0, 60) + '...' : title}</tspan>
              </text>
            </svg>
          `).toString('base64');
        }

        // Default themed thumbnail for other content
        return 'data:image/svg+xml;base64,' + Buffer.from(`
          <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="dotPattern" width="30" height="30" patternUnits="userSpaceOnUse">
                <circle cx="15" cy="15" r="1" fill="#718096"/>
              </pattern>
            </defs>

            <!-- Background -->
            <rect width="100%" height="100%" fill="#F7FAFC"/>
            <rect width="100%" height="100%" fill="url(#dotPattern)"/>

            <!-- Content area -->
            <rect x="40" y="40" width="1200" height="640" rx="20" fill="white" opacity="0.97"/>

            <!-- Decorative elements -->
            <rect x="200" y="200" width="200" height="200" fill="#EDF2F7" rx="20"/>
            <rect x="880" y="400" width="160" height="160" fill="#EDF2F7" rx="15"/>

            <!-- Title -->
            <text x="640" y="360" font-family="Arial" font-size="64" fill="#2D3748" text-anchor="middle" font-weight="bold">
              <tspan x="640" dy="0">${title?.length > 60 ? title.substring(0, 60) + '...' : title}</tspan>
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
          const thumbnailUrl = await getThumbnailUrl(video.url, video.platform, video.title);
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
      const thumbnailUrl = await getThumbnailUrl(result.url, result.platform, result.title);
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
          const thumbnailUrl = await getThumbnailUrl(video.url, video.platform, video.title);
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

  return createServer(app);
}