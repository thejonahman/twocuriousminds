import { createServer, type Server } from "http";
import express from 'express';
import session from 'express-session';
import { WebSocketServer, WebSocket } from 'ws';
import { db } from "@db";
import { sql, eq, and, desc } from "drizzle-orm";
import multer from 'multer';
import { videos, messages, users } from "@db/schema";
import { setupAuth } from "./auth";
import pgSession from 'connect-pg-simple';

// Store active WebSocket connections
const connectedClients = new Map<number, WebSocket>();

// Helper to handle database errors
function handleDatabaseError(error: unknown, res: express.Response) {
  console.error('Database error:', error);
  return res.status(500).json({
    message: "Database error occurred",
    error: error instanceof Error ? error.message : "Unknown error"
  });
}

export function registerRoutes(app: express.Application): Server {
  const httpServer = createServer(app);

  // Setup auth
  setupAuth(app);

  const sessionStore = new (pgSession(session))({
    conObject: {
      connectionString: process.env.DATABASE_URL,
    },
    createTableIfMissing: true,
  });

  // Create session middleware
  const sessionMiddleware = session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    },
  });

  // Add session middleware
  app.use(sessionMiddleware);

  // Configure WebSocket server
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    verifyClient: (info, cb) => {
      // Skip verification for Vite HMR
      if (info.req.headers['sec-websocket-protocol'] === 'vite-hmr') {
        cb(true);
        return;
      }

      // Apply session middleware
      sessionMiddleware(info.req as express.Request, {} as express.Response, (err) => {
        if (err) {
          console.error('Session middleware error:', err);
          cb(false, 500, 'Internal Server Error');
          return;
        }

        const req = info.req as express.Request & { session?: any };
        const userId = req.session?.passport?.user?.id;

        if (!userId) {
          console.error('WebSocket auth failed: No user ID in session');
          cb(false, 401, 'Unauthorized');
          return;
        }

        console.log('WebSocket auth successful for user:', userId);
        cb(true);
      });
    }
  });

  // Handle WebSocket connections
  wss.on('connection', async (ws, req: express.Request & { session?: any }) => {
    const userId = req.session?.passport?.user?.id;
    if (!userId) {
      console.error('WebSocket connection rejected: Missing user ID');
      ws.close(1008, 'Unauthorized');
      return;
    }

    console.log('WebSocket connected for user:', userId);
    connectedClients.set(userId, ws);

    // Send immediate connection confirmation
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Successfully connected to chat server'
    }));

    // Keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000);

    ws.on('close', () => {
      console.log('WebSocket disconnected for user:', userId);
      connectedClients.delete(userId);
      clearInterval(pingInterval);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error for user:', userId, error);
      connectedClients.delete(userId);
      clearInterval(pingInterval);
    });

    // Handle messages
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('Received message:', message);

        if (message.type === 'message') {
          const { videoId, content } = message;

          // Insert message into database
          const [savedMessage] = await db.insert(messages)
            .values({
              videoId,
              userId,
              content
            })
            .returning();

          // Get username for the message
          const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
            columns: {
              username: true
            }
          });

          const messageData = {
            type: 'new_message',
            data: {
              ...savedMessage,
              user: {
                username: user?.username
              }
            }
          };

          // Broadcast to all connected clients
          connectedClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(messageData));
            }
          });
        }
      } catch (error) {
        console.error('Message handling error:', error);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to process message'
          }));
        }
      }
    });
  });

  // API route for getting messages
  app.get("/api/messages", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const videoId = parseInt(req.query.videoId as string);

      // Get messages with user info
      const messagesList = await db.query.messages.findMany({
        where: eq(messages.videoId, videoId),
        orderBy: [desc(messages.createdAt)],
        with: {
          user: {
            columns: {
              username: true
            }
          }
        }
      });

      res.json(messagesList);
    } catch (error) {
      console.error('Error fetching messages:', error);
      handleDatabaseError(error, res);
    }
  });

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  // Configure multer for file uploads
  const storage = multer.memoryStorage();
  const upload = multer({
    storage,
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) {
        cb(new Error('Only image files are allowed'));
        return;
      }
      cb(null, true);
    },
  });


  // Handle file uploads first - BEFORE any JSON parsing middleware
  app.patch("/api/videos/:id/thumbnail", upload.single('thumbnail'), async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const videoId = parseInt(req.params.id);
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: "No thumbnail file uploaded" });
      }

      // Convert the uploaded file to base64
      const base64Image = file.buffer.toString('base64');
      const mimeType = file.mimetype;
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



  app.post("/api/thumbnails/generate", async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      console.log('Received thumbnail generation request:', req.body);

      const { url, platform, title, description, videoId } = req.body;

      // Validate each field individually for better error messages
      const missingFields = [];
      if (!url) missingFields.push('url');
      if (!platform) missingFields.push('platform');
      if (!videoId) missingFields.push('videoId');

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

      // Update the video's thumbnailUrl in the database
      try {
        const [updatedVideo] = await db
          .update(videos)
          .set({ thumbnailUrl })
          .where(eq(videos.id, videoId))
          .returning();

        if (!updatedVideo) {
          console.error('Video not found for thumbnail update:', videoId);
          return res.status(404).json({ message: "Video not found" });
        }

        console.log('Successfully updated video thumbnail:', {
          videoId,
          thumbnailUrl: thumbnailUrl.substring(0, 100) + '...' // Log truncated URL for brevity
        });

        res.json({ thumbnailUrl });
      } catch (dbError) {
        console.error('Error updating video thumbnail in database:', dbError);
        handleDatabaseError(dbError, res);
      }
    } catch (error) {
      console.error('Error generating thumbnail:', error);
      handleDatabaseError(error, res);
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
      const conditions = [eq(videos.isDeleted, false)];

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
        where: and(eq(videos.id, parseInt(req.params.id)), eq(videos.isDeleted, false)),
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
          isDeleted: false, // Add isDeleted field
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
        where: eq(categories.isDeleted, false),
        with: {
          subcategories: {
            where: eq(subcategories.isDeleted, false),
          },
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

      const category = await db.query.categories.findFirst({
        where: and(
          eq(categories.id, categoryId),
          eq(categories.isDeleted, false)
        ),
        with: {
          subcategories: {
            where: eq(subcategories.isDeleted, false),
            orderBy: [asc(subcategories.name)],
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
          where: and(eq(categories.id, parentId), eq(categories.isDeleted, false))
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
          isDeleted: false, // Add isDeleted field
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
        where: and(eq(videos.id, videoId), eq(videos.isDeleted, false)),
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
      const conditions = [ne(videos.id, videoId), eq(videos.isDeleted, false)];

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

  app.patch("/api/categories/:id/visibility", async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const categoryId = parseInt(req.params.id);
      const { isHidden } = req.body;

      console.log('Updating category visibility:', { categoryId, isHidden });

      // Update category visibility
      const [updatedCategory] = await db
        .update(categories)
        .set({ isDeleted: isHidden })
        .where(eq(categories.id, categoryId))
        .returning();

      if (!updatedCategory) {
        return res.status(404).json({ message: "Category not found" });
      }

      // Also hide all subcategories if category is hidden
      if (isHidden) {
        await db
          .update(subcategories)
          .set({ isDeleted: true })
          .where(eq(subcategories.categoryId, categoryId));
      }

      res.json(updatedCategory);
    } catch (error) {
      console.error('Error updating category visibility:', error);
      handleDatabaseError(error, res);
    }
  });

  app.patch("/api/subcategories/:id/visibility", async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const subcategoryId = parseInt(req.params.id);
      const { isHidden } = req.body;

      console.log('Updating subcategory visibility:', { subcategoryId, isHidden });

      // First check if subcategory exists
      const existingSubcategory = await db.query.subcategories.findFirst({
        where: eq(subcategories.id, subcategoryId)
      });

      if (!existingSubcategory) {
        console.log('Subcategory not found:', subcategoryId);
        return res.status(404).json({
          message: "Subcategory not found",
          details: "The specified subcategory does not exist"
        });
      }

      // Update subcategory visibility
      const [updatedSubcategory] = await db
        .update(subcategories)
        .set({ isDeleted: isHidden })
        .where(eq(subcategories.id, subcategoryId))
        .returning();

      console.log('Successfully updated subcategory visibility:', updatedSubcategory);
      res.json(updatedSubcategory);
    } catch (error) {
      console.error('Error updating subcategory visibility:', error);
      handleDatabaseError(error, res);
    }
  });

  app.delete("/api/videos/:id", async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        console.log('Unauthorized delete attempt');
        return res.status(403).json({ message: "Unauthorized" });
      }

      const videoId = parseInt(req.params.id);
      console.log('Processing delete request for video:', videoId);

      if (isNaN(videoId)) {
        console.error('Invalid video ID:', req.params.id);
        return res.status(400).json({ message: "Invalid video ID" });
      }

      // Soft delete the video by setting isDeleted to true
      const [deletedVideo] = await db
        .update(videos)
        .set({ isDeleted: true })
        .where(eq(videos.id, videoId))
        .returning();

      if (!deletedVideo) {
        console.log('Video not found for deletion:', videoId);
        return res.status(404).json({ message: "Video not found" });
      }

      console.log('Successfully deleted video:', videoId);
      res.status(200).json({ message: "Video deleted successfully", id: videoId });
    } catch (error) {
      console.error('Error deleting video:', error);
      handleDatabaseError(error, res);
    }
  });

  async function getThumbnailUrl(url: string, platform: string, title: string, description: string): Promise<string | null> {
    //Implementation for generating thumbnail URL
    //This is a placeholder, replace with actual implementation
    return `https://example.com/thumbnail?url=${encodeURIComponent(url)}&platform=${platform}&title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`;
  }

  return httpServer;
}