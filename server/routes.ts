import { createServer, type Server } from "http";
import express from 'express';
import { db } from "@db";
import { sql, eq, and, or, ne, inArray, notInArray, desc, asc } from "drizzle-orm";
import fetch from "node-fetch";
import * as fs from 'fs';
import * as path from 'path';
import { videos, categories, userPreferences, subcategories } from "@db/schema";
import { setupAuth } from "./auth";
import multer from 'multer';

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for files
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  }
});

// Error handler middleware for multer errors
const handleMulterError = (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    console.error('Multer error:', err);
    return res.status(413).json({
      message: "Error uploading file",
      error: err.message
    });
  }
  next(err);
};

export function registerRoutes(app: express.Application): Server {
  // Setup auth first
  setupAuth(app);

  // Add multer error handling middleware
  app.use(handleMulterError);

  // Add error handling for database operations
  const handleDatabaseError = (error: any, res: express.Response) => {
    console.error('Database error:', error);

    // Check for connection errors
    if (error.code === 'XX000' && error.message.includes('endpoint is disabled')) {
      return res.status(503).json({
        message: "Database connection temporarily unavailable",
        error: "Please try again in a few moments"
      });
    }

    // Generic database error
    res.status(500).json({
      message: "Database operation failed",
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  };

  // Handle file uploads first - BEFORE any JSON parsing middleware
  app.patch("/api/videos/:id/thumbnail", upload.single('thumbnail'), async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const videoId = parseInt(req.params.id);
      console.log('Processing thumbnail upload:', {
        fileSize: req.file?.size,
        contentLength: req.headers['content-length'],
        contentType: req.headers['content-type']
      });

      if (!req.file) {
        return res.status(400).json({ message: "No thumbnail file uploaded" });
      }

      // Convert the uploaded file to base64
      const base64Image = req.file.buffer.toString('base64');
      const mimeType = req.file.mimetype;
      const thumbnailUrl = `data:${mimeType};base64,${base64Image}`;

      // Update video with new thumbnail
      const [updatedVideo] = await db
        .update(videos)
        .set({ thumbnailUrl })
        .where(eq(videos.id, videoId))
        .returning();

      if (!updatedVideo) {
        return res.status(404).json({ message: "Video not found" });
      }

      res.json(updatedVideo);
    } catch (error) {
      handleDatabaseError(error, res);
    }
  });

  // NOW add JSON parsing middleware for other routes
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.post("/api/thumbnails/generate", async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      console.log('Received thumbnail generation request:', req.body);

      const { url, platform, title, description } = req.body;

      // Validate each field individually for better error messages
      const missingFields = [];
      if (!url) missingFields.push('url');
      if (!platform) missingFields.push('platform');

      if (missingFields.length > 0) {
        console.log('Missing fields:', missingFields);
        return res.status(400).json({
          message: "Missing required fields",
          details: `Missing: ${missingFields.join(', ')}`
        });
      }

      // Log the values being passed to getThumbnailUrl
      console.log('Generating thumbnail with:', { url, platform, title, description });

      const thumbnailUrl = await getThumbnailUrl(url, platform, title, description);

      if (!thumbnailUrl) {
        console.log('Failed to generate thumbnail - no URL returned');
        return res.status(400).json({
          message: "Failed to generate thumbnail",
          details: "Could not generate thumbnail for the given URL"
        });
      }

      console.log('Successfully generated thumbnail');
      res.json({ thumbnailUrl });
    } catch (error) {
      console.error('Error generating thumbnail:', error);
      res.status(500).json({
        message: "Failed to generate thumbnail",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });


  // Regular PATCH endpoint for updating other video fields
  app.patch("/api/videos/:id", async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const videoId = parseInt(req.params.id);
      const { title, description, url, categoryId, subcategoryId, platform } = req.body;

      // Validate required fields
      if (!title || !url || !categoryId || !platform) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Update video without changing thumbnail
      const [updatedVideo] = await db
        .update(videos)
        .set({
          title,
          description,
          url,
          categoryId: parseInt(categoryId),
          subcategoryId: subcategoryId ? parseInt(subcategoryId) : null,
          platform,
        })
        .where(eq(videos.id, videoId))
        .returning();

      if (!updatedVideo) {
        return res.status(404).json({ message: "Video not found" });
      }

      res.json(updatedVideo);
    } catch (error) {
      handleDatabaseError(error, res);
    }
  });

  app.get("/api/videos", async (req, res) => {
    try {
      // Get user preferences if authenticated
      const preferences = req.user ? await db.query.userPreferences.findFirst({
        where: eq(userPreferences.userId, req.user.id),
      }) : null;

      // Build query conditions
      const conditions = [];

      // Add preference-based filters if user has preferences
      if (preferences?.excludedCategories?.length) {
        conditions.push(notInArray(videos.categoryId, preferences.excludedCategories));
      }
      if (preferences?.preferredCategories?.length) {
        conditions.push(inArray(videos.categoryId, preferences.preferredCategories));
      }
      if (preferences?.preferredPlatforms?.length) {
        conditions.push(inArray(videos.platform, preferences.preferredPlatforms));
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
      handleDatabaseError(error, res);
    }
  });

  app.get("/api/videos/:id", async (req, res) => {
    try {
      const result = await db.query.videos.findFirst({
        where: eq(videos.id, parseInt(req.params.id)),
        with: {
          category: true,
          subcategory: true,
        },
      });

      if (!result) {
        return res.status(404).json({ message: "Video not found" });
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
    } catch (error) {
      handleDatabaseError(error, res);
    }
  });

  app.post("/api/videos", express.json({ limit: '10mb' }), async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      console.log('Received video data:', req.body);

      const { title, description, url, categoryId, subcategoryId, platform, thumbnailPreview } = req.body;

      // Validate required fields with specific messages
      const missingFields = [];
      if (!title) missingFields.push('title');
      if (!url) missingFields.push('url');
      if (!categoryId) missingFields.push('category');
      if (!platform) missingFields.push('platform');

      if (missingFields.length > 0) {
        console.log('Missing fields:', missingFields);
        return res.status(400).json({
          message: "Missing required fields",
          details: `Missing: ${missingFields.join(', ')}`
        });
      }

      // Get thumbnail URL if preview is not pending
      const thumbnailUrl = thumbnailPreview ? null : await getThumbnailUrl(url, platform, title, description);

      // Insert new video
      const [video] = await db.insert(videos)
        .values({
          title,
          description: description || '',
          url,
          thumbnailUrl,
          categoryId: parseInt(categoryId),
          subcategoryId: subcategoryId ? parseInt(subcategoryId) : null,
          platform,
        })
        .returning();

      res.json(video);
    } catch (error) {
      handleDatabaseError(error, res);
    }
  });


  app.get("/api/categories", async (_req, res) => {
    try {
      const result = await db.query.categories.findMany({
        with: {
          subcategories: true,
        },
      });
      res.json(result);
    } catch (error) {
      handleDatabaseError(error, res);
    }
  });

  app.get("/api/categories/:categoryId/subcategories", async (req, res) => {
    try {
      const categoryId = parseInt(req.params.categoryId);

      // Validate that the category exists
      const category = await db.query.categories.findFirst({
        where: eq(categories.id, categoryId),
        with: {
          subcategories: {
            orderBy: [asc(subcategories.displayOrder), asc(subcategories.name)],
          },
        },
      });

      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      res.json(category.subcategories);
    } catch (error) {
      handleDatabaseError(error, res);
    }
  });

  app.post("/api/categories", async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const { name, parentId } = req.body;

      if (!name || name.trim().length === 0) {
        return res.status(400).json({
          message: "Category name is required"
        });
      }

      // If parentId is provided, verify parent category exists
      if (parentId) {
        const parentCategory = await db.query.categories.findFirst({
          where: eq(categories.id, parentId)
        });

        if (!parentCategory) {
          return res.status(404).json({
            message: "Parent category not found"
          });
        }
      }

      // Insert new category/subcategory
      const [newCategory] = await db
        .insert(parentId ? subcategories : categories)
        .values({
          name: name.trim(),
          ...(parentId && { categoryId: parentId })
        })
        .returning();

      // Return with metadata about the type
      res.json({
        ...newCategory,
        isSubcategory: !!parentId
      });

    } catch (error) {
      handleDatabaseError(error, res);
    }
  });

  app.get("/api/preferences", async (req, res) => {
    try {
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
    } catch (error) {
      handleDatabaseError(error, res);
    }
  });

  app.post("/api/preferences", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { preferredCategories, preferredPlatforms, excludedCategories } = req.body;

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
            preferredCategories: preferredCategories || [],
            preferredPlatforms: preferredPlatforms || [],
            excludedCategories: excludedCategories || [],
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
            preferredCategories: preferredCategories || [],
            preferredPlatforms: preferredPlatforms || [],
            excludedCategories: excludedCategories || [],
          })
          .returning();
      }

      res.json(result);
    } catch (error) {
      handleDatabaseError(error, res);
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
        if (preferences.excludedCategories?.length) {
          conditions.push(notInArray(videos.categoryId, preferences.excludedCategories));
        }
        if (preferences.preferredCategories?.length) {
          conditions.push(inArray(videos.categoryId, preferences.preferredCategories));
        }
        if (preferences.preferredPlatforms?.length) {
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
      handleDatabaseError(error, res);
    }
  });

  app.delete("/api/videos/:id", async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const videoId = parseInt(req.params.id);
      const [deletedVideo] = await db
        .delete(videos)
        .where(eq(videos.id, videoId))
        .returning();

      if (!deletedVideo) {
        return res.status(404).json({ message: "Video not found" });
      }

      res.json(deletedVideo);
    } catch (error) {
      handleDatabaseError(error, res);
    }
  });

  app.delete("/api/categories/:id", async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const categoryId = parseInt(req.params.id);

      // Get or create the "Not specified" category
      let notSpecifiedCategory = await db.query.categories.findFirst({
        where: eq(categories.name, "Not specified"),
      });

      if (!notSpecifiedCategory) {
        const [newCategory] = await db.insert(categories)
          .values({
            name: "Not specified",
            displayOrder: 9999, // Put it at the end
          })
          .returning();
        notSpecifiedCategory = newCategory;
      }

      // Get or create the "Not specified" subcategory under "Not specified" category
      let notSpecifiedSubcategory = await db.query.subcategories.findFirst({
        where: and(
          eq(subcategories.name, "Not specified"),
          eq(subcategories.categoryId, notSpecifiedCategory.id)
        ),
      });

      if (!notSpecifiedSubcategory) {
        const [newSubcategory] = await db.insert(subcategories)
          .values({
            name: "Not specified",
            categoryId: notSpecifiedCategory.id,
            displayOrder: 9999,
          })
          .returning();
        notSpecifiedSubcategory = newSubcategory;
      }

      // Update all videos in this category to use "Not specified" category
      await db.update(videos)
        .set({ 
          categoryId: notSpecifiedCategory.id,
          subcategoryId: notSpecifiedSubcategory.id 
        })
        .where(eq(videos.categoryId, categoryId));

      // Delete all subcategories of this category
      await db.delete(subcategories)
        .where(eq(subcategories.categoryId, categoryId));

      // Delete the category
      const [deletedCategory] = await db
        .delete(categories)
        .where(eq(categories.id, categoryId))
        .returning();

      if (!deletedCategory) {
        return res.status(404).json({ message: "Category not found" });
      }

      res.json(deletedCategory);
    } catch (error) {
      console.error('Error deleting category:', error);
      handleDatabaseError(error, res);
    }
  });

  app.delete("/api/categories/:categoryId/subcategories/:id", async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const subcategoryId = parseInt(req.params.id);
      const categoryId = parseInt(req.params.categoryId);
      console.log('Attempting to delete subcategory:', subcategoryId);

      // Validate subcategory ID
      if (isNaN(subcategoryId)) {
        return res.status(400).json({
          message: "Invalid subcategory ID",
          details: "Subcategory ID must be a valid number"
        });
      }

      // First verify the subcategory exists
      const existingSubcategory = await db.query.subcategories.findFirst({
        where: and(
          eq(subcategories.id, subcategoryId),
          eq(subcategories.categoryId, categoryId)
        ),
      });

      if (!existingSubcategory) {
        console.log('Subcategory not found:', subcategoryId);
        return res.status(404).json({
          message: "Subcategory not found",
          details: "The specified subcategory does not exist"
        });
      }

      console.log('Found subcategory to delete:', existingSubcategory);

      // Get or create the "Not specified" subcategory for this category
      let notSpecifiedSubcategory = await db.query.subcategories.findFirst({
        where: and(
          eq(subcategories.name, "Not specified"),
          eq(subcategories.categoryId, categoryId)
        ),
      });

      if (!notSpecifiedSubcategory) {
        const [newSubcategory] = await db.insert(subcategories)
          .values({
            name: "Not specified",
            categoryId: categoryId,
            displayOrder: 9999, // Put it at the end
          })
          .returning();
        notSpecifiedSubcategory = newSubcategory;
      }

      // Update all videos that use this subcategory to use "Not specified"
      const updateResult = await db.update(videos)
        .set({ subcategoryId: notSpecifiedSubcategory.id })
        .where(eq(videos.subcategoryId, subcategoryId));

      console.log('Updated videos result:', updateResult);

      // Delete the subcategory
      const [deletedSubcategory] = await db
        .delete(subcategories)
        .where(eq(subcategories.id, subcategoryId))
        .returning();

      if (!deletedSubcategory) {
        console.error('Failed to delete subcategory after verification:', subcategoryId);
        return res.status(500).json({
          message: "Failed to delete subcategory",
          details: "The subcategory was found but could not be deleted"
        });
      }

      console.log('Successfully deleted subcategory:', deletedSubcategory);
      res.json(deletedSubcategory);
    } catch (error) {
      console.error('Error in subcategory deletion:', error);
      handleDatabaseError(error, res);
    }
  });

  return createServer(app);
}

async function getThumbnailUrl(url: string, platform: string, title?: string, description?: string): Promise<string | null> {
  try {
    switch (platform.toLowerCase()) {
      case 'youtube': {
        const videoId = url.split('v=')[1]?.split('&')[0];
        if (!videoId) {
          console.error('Could not extract YouTube video ID from:', url);
          return null;
        }
        // Try multiple resolutions in order of preference
        const resolutions = ['maxresdefault', 'sddefault', 'hqdefault', 'default'];
        for (const resolution of resolutions) {
          const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/${resolution}.jpg`;
          try {
            const response = await fetch(thumbnailUrl);
            if (response.ok) {
              return thumbnailUrl;
            }
          } catch (error) {
            console.warn(`Failed to fetch ${resolution} thumbnail for YouTube video ${videoId}`);
          }
        }
        return null;
      }
      case 'tiktok':
      case 'instagram': {
        console.log('Analyzing content:', { title, description });
        const contentText = `${title || ''} ${description || ''}`.toLowerCase();

        // Enhanced categories with more specific keywords and context
        const categories = {
          beginner_technique: {
            keywords: ['beginner', 'start', 'learn', 'first time', 'basic', 'fundamental', 'introduction', 'getting started'],
            weight: 1.2,
            color: '#4F46E5'
          },
          advanced_technique: {
            keywords: ['advanced', 'expert', 'professional', 'racing', 'competition', 'performance', 'skill'],
            weight: 1.1,
            color: '#7C3AED'
          },
          powder_skiing: {
            keywords: ['powder', 'deep snow', 'backcountry', 'off-piste', 'fresh snow', 'powder day'],
            weight: 1.0,
            color: '#2563EB'
          },
          safety_instruction: {
            keywords: ['safety', 'protection', 'avalanche', 'rescue', 'emergency', 'precaution', 'risk'],
            weight: 1.3,
            color: '#DC2626'
          },
          equipment_guide: {
            keywords: ['gear', 'equipment', 'ski', 'boot', 'binding', 'pole', 'setup', 'maintenance'],
            weight: 0.9,
            color: '#059669'
          }
        };

        // Calculate match scores with context awareness
        const scores = Object.entries(categories).map(([category, { keywords, weight, color }]) => {
          const titleMatches = keywords.filter(keyword =>
            title?.toLowerCase().includes(keyword)
          ).length * 2; // Title matches count double

          const descriptionMatches = keywords.filter(keyword =>
            description?.toLowerCase().includes(keyword)
          ).length;

          const score = ((titleMatches + descriptionMatches) / (keywords.length * 3)) * weight;
          console.log(`Category "${category}" score:`, { titleMatches, descriptionMatches, weight, score });

          return { category, score, color };
        });

        // Find best matching category
        const bestMatch = scores.reduce((prev, current) =>
          current.score > prev.score ? current : prev
        );
        console.log('Best matching category:', bestMatch);

        // Try to find a matching image
        const imagesFolder = path.join(process.cwd(), 'attached_assets');
        const files = fs.readdirSync(imagesFolder);

        // Enhanced image matching with multiple strategies
        const matchStrategies = [
          // Strategy 1: Direct keyword match from title
          () => files.find(file => {
            const fileNameLower = file.toLowerCase();
            return title?.toLowerCase().split(' ').some(word =>
              word.length > 3 && fileNameLower.includes(word)
            );
          }),
          // Strategy 2: Category-based match
          () => files.find(file => {
            const pattern = bestMatch.score > 0.3 ?
              new RegExp(bestMatch.category.replace('_', ''), 'i') :
              null;
            return pattern?.test(file);
          }),
          // Strategy 3: Generic ski-related match
          () => files.find(file => /ski|snow|winter/i.test(file))
        ];

        let matchedFile = null;
        for (const strategy of matchStrategies) {
          matchedFile = strategy();
          if (matchedFile) break;
        }

        if (matchedFile) {
          const imagePath = path.join(imagesFolder, matchedFile);
          const imageBuffer = fs.readFileSync(imagePath);
          const extension = path.extname(matchedFile).substring(1);
          return `data:image/${extension};base64,${imageBuffer.toString('base64')}`;
        }

        // Generate an enhanced SVG thumbnail
        const gradientColor = bestMatch.color || '#4F46E5';
        const secondaryColor = bestMatch.color === '#DC2626' ? '#991B1B' : '#7C3AED';

        return 'data:image/svg+xml;base64,' + Buffer.from(`
          <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:${gradientColor};stop-opacity:1" />
                <stop offset="100%" style="stop-color:${secondaryColor};stop-opacity:1" />
              </linearGradient>
              <filter id="shadow">
                <feDropShadow dx="0" dy="4" stdDeviation="4" flood-opacity="0.25"/>
              </filter>
            </defs>
            <rect width="100%" height="100%" fill="url(#bg)"/>
            <rect x="40" y="40" width="1200" height="640" fill="rgba(255,255,255,0.1)" rx="20"/>
            <text x="640" y="280" font-family="Arial" font-size="56" fill="white" text-anchor="middle" dominant-baseline="middle" filter="url(#shadow)">
              ${title || 'Video Content'}
            </text>
            <text x="640" y="380" font-family="Arial" font-size="36" fill="rgba(255,255,255,0.9)" text-anchor="middle" dominant-baseline="middle">
              ${bestMatch.category.split('_').map(word =>
                word.charAt(0).toUpperCase() + word.slice(1)
              ).join(' ')}
            </text>
            <text x="640" y="440" font-family="Arial" font-size="32" fill="rgba(255,255,255,0.8)" text-anchor="middle" dominant-baseline="middle">
              ${platform.charAt(0).toUpperCase() + platform.slice(1)}
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