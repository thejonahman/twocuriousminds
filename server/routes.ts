import { createServer, type Server, IncomingMessage } from "http";
import express from 'express';
import session from 'express-session';
import { WebSocketServer, WebSocket } from 'ws';
import { db } from "@db";
import { sql, eq, and, or, ne, inArray, notInArray, desc, asc } from "drizzle-orm";
import fetch from "node-fetch";
import { videos, categories, userPreferences, subcategories, discussionGroups, groupMembers, groupMessages, userNotifications } from "@db/schema";
import { setupAuth } from "./auth";
import multer from 'multer';
import crypto from 'crypto';
import pgSession from 'connect-pg-simple';
import { ParsedQs } from 'qs';
import { ParamsDictionary } from 'express-serve-static-core';

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

// Declare types for session
declare module 'express-session' {
  interface Session {
    passport?: {
      user?: {
        id: number;
        username: string;
      };
    };
  }
}

interface SessionRequest extends IncomingMessage {
  session?: session.Session & Partial<session.SessionData>;
}

// Store active WebSocket connections
const connectedClients = new Map<number, WebSocket>();

// Handle database errors
function handleDatabaseError(error: unknown, res: express.Response) {
  console.error('Database error:', error);

  // Check for connection errors
  if (error instanceof Error && error.message.includes('endpoint is disabled')) {
    return res.status(503).json({
      message: "Database connection temporarily unavailable",
      error: "Please try again in a few moments"
    });
  }

  // Handle other database errors
  return res.status(500).json({
    message: "Database error occurred",
    error: error instanceof Error ? error.message : "Unknown error"
  });
}

// Make sure we return the HTTP server
export function registerRoutes(app: express.Application): Server {
  // Create HTTP server first
  const httpServer = createServer(app);

  // Setup auth
  setupAuth(app);

  // Create session store
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
    verifyClient: async (info, cb) => {
      // Skip verification for Vite HMR
      if (info.req.headers['sec-websocket-protocol'] === 'vite-hmr') {
        cb(true);
        return;
      }

      try {
        // Apply session middleware to parse cookies
        await new Promise<void>((resolve, reject) => {
          sessionMiddleware(info.req as express.Request, {} as express.Response, (err) => {
            if (err) {
              console.error('Session middleware error:', err);
              reject(err);
            } else {
              resolve();
            }
          });
        });

        const req = info.req as SessionRequest;

        // Debug log session state
        console.log('WebSocket connection attempt:', {
          hasSession: !!req.session,
          hasPassport: !!req.session?.passport,
          hasUser: !!req.session?.passport?.user,
          cookies: info.req.headers.cookie,
        });

        if (!req.session?.passport?.user) {
          console.log('WebSocket auth failed: Missing user session data');
          cb(false, 401, 'Unauthorized');
          return;
        }

        console.log('WebSocket auth successful for user:', req.session.passport.user.id);
        cb(true);
      } catch (error) {
        console.error('WebSocket authentication error:', error);
        cb(false, 500, 'Internal Server Error');
      }
    }
  });

  wss.on('connection', async (ws, req: SessionRequest) => {
    const userId = req.session?.passport?.user?.id;
    if (!userId) {
      console.log('WebSocket connection rejected: No user ID');
      ws.close(1008, 'Unauthorized');
      return;
    }

    console.log('WebSocket client connected, user:', userId);
    connectedClients.set(userId, ws);

    ws.on('close', () => {
      console.log('WebSocket client disconnected, user:', userId);
      connectedClients.delete(userId);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error for user:', userId, error);
      connectedClients.delete(userId);
    });

    // Handle incoming messages
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('Received message:', { type: message.type, userId });

        // Handle ping messages to keep connection alive
        if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        if (message.type === 'group_message') {
          const { groupId, content } = message;

          // Verify user is a member of the group
          const member = await db.query.groupMembers.findFirst({
            where: and(
              eq(groupMembers.groupId, groupId),
              eq(groupMembers.userId, userId)
            ),
          });

          if (!member) {
            console.log('Message rejected: User not in group:', { userId, groupId });
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Not a member of this group'
            }));
            return;
          }

          // Save message to database
          const [savedMessage] = await db.insert(groupMessages)
            .values({
              groupId,
              userId,
              content,
            })
            .returning();

          console.log('Message saved:', { messageId: savedMessage.id, groupId });

          // Get user info for the message
          const user = await db.execute(sql`
            SELECT username FROM users WHERE id = ${userId}
          `);

          const messageWithUser = {
            ...savedMessage,
            user: {
              username: user.rows[0]?.username
            }
          };

          // Get all group members to broadcast message
          const members = await db.query.groupMembers.findMany({
            where: eq(groupMembers.groupId, groupId),
          });

          console.log('Broadcasting to members:', members.length);

          // Broadcast to all connected members
          for (const member of members) {
            const clientWs = connectedClients.get(member.userId);
            if (clientWs?.readyState === WebSocket.OPEN) {
              try {
                clientWs.send(JSON.stringify({
                  type: 'new_message',
                  data: messageWithUser
                }));
              } catch (error) {
                console.error('Error sending message to client:', error);
                connectedClients.delete(member.userId);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error processing message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Error processing message'
        }));
      }
    });

    // Send initial connection confirmation
    ws.send(JSON.stringify({
      type: 'connected',
      userId
    }));
  });

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
        res.status(500).json({
          message: "Failed to save thumbnail",
          error: dbError instanceof Error ? dbError.message : 'Unknown database error'
        });
      }
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

  // NEW GET /api/groups route
  app.get("/api/groups", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const videoId = req.query.videoId ? parseInt(req.query.videoId as string) : undefined;

      // Get groups the user is a member of
      const memberGroups = await db.select({
        id: discussionGroups.id,
        name: discussionGroups.name,
        description: discussionGroups.description,
        videoId: discussionGroups.videoId,
        creatorId: discussionGroups.creatorId,
        isPrivate: discussionGroups.isPrivate,
        inviteCode: discussionGroups.inviteCode,
        createdAt: discussionGroups.createdAt,
      })
        .from(groupMembers)
        .where(eq(groupMembers.userId, req.user.id))
        .innerJoin(discussionGroups, eq(groupMembers.groupId, discussionGroups.id));

      // Filter groups for this video if videoId is provided
      const groups = videoId
        ? memberGroups.filter(group => group.videoId === videoId)
        : memberGroups;

      res.json(groups);
    } catch (error) {
      handleDatabaseError(error, res);
    }
  });


  // Discussion group routes
  app.post("/api/groups", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { name, description, videoId, isPrivate = true } = req.body;

      // Validate input
      if (!name || !videoId) {
        return res.status(400).json({ message: "Name and video ID are required" });
      }

      // Generate unique invite code
      const inviteCode = crypto.randomBytes(6).toString('hex');

      // Create discussion group
      const [group] = await db.insert(discussionGroups)
        .values({
          name,
          description,
          videoId,
          creatorId: req.user.id,
          isPrivate,
          inviteCode,
        })
        .returning();

      // Add creator as admin member
      await db.insert(groupMembers)
        .values({
          groupId: group.id,
          userId: req.user.id,
          role: 'admin',
        });

      res.json(group);
    } catch (error) {
      handleDatabaseError(error, res);
    }
  });

  app.post("/api/groups/:inviteCode/join", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { inviteCode } = req.params;

      // Find group by invite code
      const group = await db.query.discussionGroups.findFirst({
        where: eq(discussionGroups.inviteCode, inviteCode),
      });

      if (!group) {
        return res.status(404).json({ message: "Group not found" });
      }

      // Check if user is already a member
      const existingMember = await db.query.groupMembers.findFirst({
        where: and(
          eq(groupMembers.groupId, group.id),
          eq(groupMembers.userId, req.user.id)
        ),
      });

      if (existingMember) {
        return res.status(400).json({ message: "Already a member" });
      }

      // Add user to group
      const [member] = await db.insert(groupMembers)
        .values({
          groupId: group.id,
          userId: req.user.id,
          role: 'member',
        })
        .returning();

      // Notify group creator
      await db.insert(userNotifications)
        .values({
          userId: group.creatorId,
          groupId: group.id,
          type: 'new_member',
        });

      res.json({ group, member });
    } catch (error) {      handleDatabaseError(error, res);
    }
  });

  // Fix the messages endpoint URL and improve session handling
  app.get("/api/groups/:groupId/messages", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const groupId = parseInt(req.params.groupId);

      // Verify user is member of the group
      const member = await db.query.groupMembers.findFirst({
        where: and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, req.user.id)
        ),
      });

      if (!member) {
        return res.status(403).json({ message: "Not a member of this group" });
      }

      // Get messages with user info
      const messages = await db.execute(sql`
        SELECT 
          m.*,
          json_build_object('username', u.username) as user
        FROM group_messages m
        JOIN users u ON m.user_id = u.id
        WHERE m.group_id = ${groupId}
        ORDER BY m.created_at ASC
      `);

      res.json(messages.rows);
    } catch (error) {
      handleDatabaseError(error, res);
    }
  });

  function handleDatabaseError(error: any, res: express.Response) {
    console.error('Database error:', error);

    // Check for connection errors    if (error.code === 'XX000' && error.message.includes('endpoint is disabled')) {
    if (error instanceof Error && error.message.includes('endpoint is disabled')) {
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

          const categories = {
            beginner_technique: {
              keywords: ['beginner', 'start', 'learn', 'first time', 'basic'],
              color: '#4F46E5'
            },
            advanced_technique: {
              keywords: ['advanced', 'expert', 'professional', 'racing'],
              color: '#7C3AED'
            },
            safety_instruction: {
              keywords: ['safety', 'protection', 'avalanche', 'rescue'],
              color: '#DC2626'
            }
          };

          // Find best matching category
          const bestMatch = Object.entries(categories).reduce((prev, [category, data]) => {
            const matchCount = data.keywords.filter(keyword => contentText.includes(keyword)).length;
            return matchCount > prev.matchCount ? { category, matchCount, color: data.color } : prev;
          }, { category: 'beginner_technique', matchCount: 0, color: '#4F46E5' });

          // Generate an SVG thumbnail with proper escaping
          const svgContent = `
            <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="bg" x1="0%" y1="0%" x2="100%">
                  <stop offset="0%" style="stop-color:${bestMatch.color};stop-opacity:1" />
                  <stop offset="100%" style="stop-color:#1F2937;stop-opacity:1" />
                </linearGradient>
              </defs>
              <rect width="100%" height="100%" fill="url(#bg)"/>
              <rect x="40" y="40" width="1200" height="640" fill="rgba(255,255,255,0.1)" rx="20"/>
              <text x="640" y="320" font-family="Arial" font-size="48" fill="white" text-anchor="middle" dominant-baseline="middle">
                ${title ? title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : 'Video Content'}
              </text>
              <text x="640" y="400" font-family="Arial" font-size="32" fill="rgba(255,255,255,0.8)" text-anchor="middle" dominant-baseline="middle">
                ${platform.charAt(0).toUpperCase() + platform.slice(1)}
              </text>
            </svg>
          `.trim().replace(/\n\s+/g, ' ');

          return `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`;
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
  // Return the HTTP server
  return httpServer;
}

function handleMulterError(err: Error, req: express.Request, res: express.Response, next: express.NextFunction) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        message: "File too large",
        details: "Maximum file size is 5MB"
      });
    }
    return res.status(400).json({
      message: "File upload error",
      details: err.message
    });
  }

  if (err.message === 'Only image files are allowed') {
    return res.status(400).json({
      message: "Invalid file type",
      details: "Only image files are allowed"
    });
  }

  next(err);
}