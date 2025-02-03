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
                <linearGradient id="purpleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style="stop-color:#4A148C;stop-opacity:1" />
                  <stop offset="100%" style="stop-color:#7B1FA2;stop-opacity:1" />
                </linearGradient>
              </defs>

              <!-- Background -->
              <rect width="100%" height="100%" fill="url(#purpleGrad)"/>
              <rect width="100%" height="100%" fill="url(#smallGrid)"/>

              <!-- Content area with outline -->
              <rect x="40" y="40" width="1200" height="640" rx="20" 
                    fill="white" opacity="0.97"
                    stroke="#4A148C" stroke-width="4"/>

              <!-- Main visual element -->
              <circle cx="400" cy="360" r="200" fill="#FFB6C1" opacity="0.9"/>
              <circle cx="400" cy="360" r="180" fill="#FF69B4" opacity="0.7"/>

              <!-- Brain visualization for ADHD/RSD -->
              <path d="M350,260 C450,200 500,300 450,360 S380,420 350,460" 
                    fill="none" stroke="#4A148C" stroke-width="8" opacity="0.6"/>
              <path d="M450,260 C350,200 300,300 350,360 S420,420 450,460" 
                    fill="none" stroke="#4A148C" stroke-width="8" opacity="0.6"/>

              <!-- Title and subtitle -->
              <text x="800" y="300" font-family="Arial" font-size="80" fill="#333" text-anchor="middle" font-weight="bold">
                ${titleLower.includes('rsd') ? 'RSD and ADHD' : 'ADHD Basics'}
              </text>
              <text x="800" y="400" font-family="Arial" font-size="48" fill="#666" text-anchor="middle">
                ${titleLower.includes('rsd') ? 'Understanding RSD' : 'Learning About ADHD'}
              </text>
            </svg>
          `).toString('base64');
        }

        // Skiing themed thumbnail
        if (titleLower.includes('ski') || titleLower.includes('skiing')) {
          return 'data:image/svg+xml;base64,' + Buffer.from(`
            <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="snowPattern" width="50" height="50" patternUnits="userSpaceOnUse">
                  <path d="M25,25 L35,25 M25,25 L15,25 M25,25 L25,35 M25,25 L25,15" 
                        stroke="white" stroke-width="2" opacity="0.3"/>
                  <path d="M25,25 L32,32 M25,25 L18,18 M25,25 L32,18 M25,25 L18,32" 
                        stroke="white" stroke-width="2" opacity="0.3"/>
                </pattern>
                <linearGradient id="skyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" style="stop-color:#2B6CB0;stop-opacity:1" />
                  <stop offset="100%" style="stop-color:#4299E1;stop-opacity:1" />
                </linearGradient>
              </defs>

              <!-- Background with gradient -->
              <rect width="100%" height="100%" fill="url(#skyGrad)"/>
              <rect width="100%" height="100%" fill="url(#snowPattern)"/>

              <!-- Content area with outline -->
              <rect x="40" y="40" width="1200" height="640" rx="20" 
                    fill="white" opacity="0.97"
                    stroke="#2B6CB0" stroke-width="4"/>

              <!-- Mountain silhouettes -->
              <path d="M40 680 L440 200 L840 680 Z" fill="#2B6CB0" opacity="0.2"/>
              <path d="M640 680 L1040 280 L1240 680 Z" fill="#2B6CB0" opacity="0.3"/>

              <!-- Skier silhouette -->
              <path d="M600,400 L650,450 L700,400 M650,350 L650,450" 
                    stroke="#2B6CB0" stroke-width="8" stroke-linecap="round"/>

              <!-- Title -->
              <text x="640" y="280" font-family="Arial" font-size="64" fill="#2D3748" text-anchor="middle" font-weight="bold">
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
                  <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#CBD5E0" stroke-width="1"/>
                </pattern>
                <linearGradient id="learnGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style="stop-color:#3182CE;stop-opacity:1" />
                  <stop offset="100%" style="stop-color:#63B3ED;stop-opacity:1" />
                </linearGradient>
              </defs>

              <!-- Background -->
              <rect width="100%" height="100%" fill="url(#learnGrad)"/>
              <rect width="100%" height="100%" fill="url(#gridPattern)"/>

              <!-- Content area with outline -->
              <rect x="40" y="40" width="1200" height="640" rx="20" 
                    fill="white" opacity="0.97"
                    stroke="#3182CE" stroke-width="4"/>

              <!-- Book or learning icon -->
              <path d="M300,260 L300,460 L500,460 L500,260 C400,240 400,240 300,260" 
                    fill="#3182CE" opacity="0.2"/>
              <path d="M320,280 L480,280 M320,320 L480,320 M320,360 L480,360" 
                    stroke="#3182CE" stroke-width="4" opacity="0.4"/>

              <!-- Title -->
              <text x="700" y="360" font-family="Arial" font-size="64" fill="#2D3748" text-anchor="middle" font-weight="bold">
                <tspan x="700" dy="0">${title?.length > 60 ? title.substring(0, 60) + '...' : title}</tspan>
              </text>
            </svg>
          `).toString('base64');
        }

        // Default themed thumbnail with more dynamic elements
        return 'data:image/svg+xml;base64,' + Buffer.from(`
          <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="dotPattern" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="20" cy="20" r="1" fill="#718096"/>
                <circle cx="40" cy="40" r="1" fill="#718096"/>
                <circle cx="0" cy="0" r="1" fill="#718096"/>
              </pattern>
              <linearGradient id="defaultGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#E2E8F0;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#F7FAFC;stop-opacity:1" />
              </linearGradient>
            </defs>

            <!-- Background -->
            <rect width="100%" height="100%" fill="url(#defaultGrad)"/>
            <rect width="100%" height="100%" fill="url(#dotPattern)"/>

            <!-- Content area with outline -->
            <rect x="40" y="40" width="1200" height="640" rx="20" 
                  fill="white" opacity="0.97"
                  stroke="#718096" stroke-width="4"/>

            <!-- Dynamic decorative elements based on title -->
            ${titleLower.includes('tips') ? `
              <path d="M200,200 L300,300 M250,200 L250,300" stroke="#718096" stroke-width="4"/>
              <circle cx="250" cy="350" r="30" fill="#718096" opacity="0.2"/>
            ` : titleLower.includes('review') ? `
              <rect x="200" y="200" width="100" height="100" rx="10" fill="#718096" opacity="0.1"/>
              <path d="M220,250 L280,250 M220,270 L260,270" stroke="#718096" stroke-width="4"/>
            ` : `
              <circle cx="250" cy="250" r="50" fill="#718096" opacity="0.1"/>
              <rect x="220" y="220" width="60" height="60" rx="10" fill="#718096" opacity="0.1"/>
            `}

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