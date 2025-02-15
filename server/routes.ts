import { createServer, type Server } from "http";
import express, { type Express, type NextFunction } from 'express';
import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from "@db";
import { sql, eq, and, desc, gt } from "drizzle-orm";
import { videos, messages, users, discussionGroups, groupMessages, groupMembers, categories, userPreferences, subcategories } from "@db/schema";
import { setupAuth, requireAuth } from "./auth";
import groupMessagesRouter from './routes/group-messages';
import { sendUnreadMessagesNotification, resend } from './lib/email';
import { type FileFilterCallback } from "multer";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
    email: string;
    isAdmin?: boolean;
  };
}

export function registerRoutes(app: Express): Server {
  // Create HTTP server first
  const httpServer = createServer(app);

  // Setup auth and get session middleware BEFORE registering routes
  const sessionMiddleware = setupAuth(app);

  // Configure multer for file uploads
  const uploadDir = path.join(process.cwd(), 'uploads');

  // Ensure uploads directory exists with proper permissions
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    // Ensure directory has proper permissions (readable/writable)
    fs.chmodSync(uploadDir, 0o755);
  }

  const storage = multer.diskStorage({
    destination: function (_req: Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) {
      cb(null, uploadDir);
    },
    filename: function (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, 'thumbnail-' + uniqueSuffix + ext);
    }
  });

  const upload = multer({
    storage: storage,
    limits: {
      fileSize: 5 * 1024 * 1024 // 5MB
    },
    fileFilter: function (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
      const filetypes = /jpeg|jpg|png|webp/;
      const mimetype = filetypes.test(file.mimetype);
      const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

      if (mimetype && extname) {
        return cb(null, true);
      }
      cb(new Error('Only JPEG, PNG and WebP images are allowed'));
    }
  });

  // Serve uploaded files statically with proper MIME types
  app.use('/uploads', express.static(uploadDir, {
    index: false,
    extensions: ['jpg', 'jpeg', 'png', 'webp'],
    setHeaders: (res, filePath) => {
      console.log('[Static] Setting headers for file:', filePath);
      // Set proper cache control and content type
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      const ext = path.extname(filePath).toLowerCase();
      switch (ext) {
        case '.jpg':
        case '.jpeg':
          res.setHeader('Content-Type', 'image/jpeg');
          break;
        case '.png':
          res.setHeader('Content-Type', 'image/png');
          break;
        case '.webp':
          res.setHeader('Content-Type', 'image/webp');
          break;
      }
    }
  }));

  // Add thumbnail upload endpoint with improved error handling
  app.post('/api/upload/thumbnail', upload.single('thumbnail'), (req: Request, res: Response) => {
    console.log('[Upload] Processing thumbnail upload request');

    if (!req.file) {
      console.error('[Upload] No file uploaded');
      return res.status(400).json({
        error: 'No file uploaded',
        success: false
      });
    }

    try {
      const filename = req.file.filename;
      // Ensure the URL starts with a forward slash
      const fileUrl = `/uploads/${filename}`;

      console.log('[Upload] Successfully uploaded thumbnail:', {
        url: fileUrl,
        filename: filename,
        path: req.file.path,
        mimetype: req.file.mimetype,
        size: req.file.size
      });

      // Test file existence
      if (!fs.existsSync(req.file.path)) {
        throw new Error('File was not saved properly');
      }

      res.json({
        url: fileUrl,
        success: true,
        filename: filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      });
    } catch (error) {
      console.error('[Upload] Error processing uploaded file:', error);
      res.status(500).json({
        error: 'Error processing uploaded file',
        success: false,
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Global middleware to ensure JSON responses for all /api routes
  app.use('/api', (req, res, next) => {
    // Set JSON content type header for all API routes
    res.setHeader('Content-Type', 'application/json');
    console.log(`[API] ${req.method} ${req.path} - Setting JSON content type`);
    next();
  });

  // Register the group messages router after auth is set up
  app.use(groupMessagesRouter);

  // Wrap all route handlers to ensure proper error handling
  const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    return Promise.resolve(fn(req, res, next)).catch(next);
  };

  // Public endpoints - no auth required
  app.get("/api/categories", asyncHandler(async (req: Request, res: Response) => {
    const allCategories = await db.query.categories.findMany({
      where: eq(categories.isDeleted, false),
      orderBy: [desc(categories.displayOrder)]
    });
    res.json(allCategories);
  }));

  // Add new endpoint for subcategories by category
  app.get("/api/categories/:categoryId/subcategories", asyncHandler(async (req: Request, res: Response) => {
    const categoryId = parseInt(req.params.categoryId);
    console.log('Fetching subcategories for categoryId:', categoryId);

    if (isNaN(categoryId)) {
      console.error('Invalid category ID provided:', req.params.categoryId);
      return res.status(400).json({ message: "Invalid category ID" });
    }

    // Verify category exists first
    const category = await db.query.categories.findFirst({
      where: eq(categories.id, categoryId)
    });

    if (!category) {
      console.error('Category not found for ID:', categoryId);
      return res.status(404).json({ message: "Category not found" });
    }

    console.log('Found category:', category.name);

    const subCategories = await db.query.subcategories.findMany({
      where: and(
        eq(subcategories.categoryId, categoryId),
        eq(subcategories.isDeleted, false)
      ),
      orderBy: [desc(subcategories.displayOrder)]
    });

    console.log('Found subcategories:', subCategories.length);

    res.json(subCategories);
  }));

  // Add new category
  app.post("/api/categories", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { name, description, displayOrder } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Category name is required" });
    }

    const [newCategory] = await db.insert(categories)
      .values({
        name,
        description: description || null,
        displayOrder: displayOrder || 0,
        isDeleted: false
      })
      .returning();

    res.json(newCategory);
  }));

  // Add new subcategory
  app.post("/api/categories/:categoryId/subcategories", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const categoryId = parseInt(req.params.categoryId);
    const { name, displayOrder } = req.body;

    if (isNaN(categoryId)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    if (!name) {
      return res.status(400).json({ message: "Subcategory name is required" });
    }

    // Verify category exists
    const category = await db.query.categories.findFirst({
      where: and(
        eq(categories.id, categoryId),
        eq(categories.isDeleted, false)
      )
    });

    if (!category) {
      return res.status(404).json({ message: "Category not found or is deleted" });
    }

    const [newSubcategory] = await db.insert(subcategories)
      .values({
        name,
        categoryId,
        displayOrder: displayOrder || 0,
        isDeleted: false
      })
      .returning();

    res.status(201).json(newSubcategory);
  }));

  // Soft delete category
  app.delete("/api/categories/:id", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const categoryId = parseInt(req.params.id);

    if (isNaN(categoryId)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    // Get category to verify it exists and isn't already deleted
    const category = await db.query.categories.findFirst({
      where: eq(categories.id, categoryId)
    });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    if (category.isDeleted) {
      return res.status(400).json({ message: "Category is already deleted" });
    }

    // Soft delete the category and all its subcategories
    await db.transaction(async (tx) => {
      await tx.update(categories)
        .set({ isDeleted: true })
        .where(eq(categories.id, categoryId));

      await tx.update(subcategories)
        .set({ isDeleted: true })
        .where(eq(subcategories.categoryId, categoryId));
    });

    res.json({ message: "Category and its subcategories deleted successfully" });
  }));

  // Soft delete subcategory
  app.delete("/api/subcategories/:id", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const subcategoryId = parseInt(req.params.id);

    if (isNaN(subcategoryId)) {
      return res.status(400).json({ message: "Invalid subcategory ID" });
    }

    // Get subcategory to verify it exists and isn't already deleted
    const subcategory = await db.query.subcategories.findFirst({
      where: eq(subcategories.id, subcategoryId)
    });

    if (!subcategory) {
      return res.status(404).json({ message: "Subcategory not found" });
    }

    if (subcategory.isDeleted) {
      return res.status(400).json({ message: "Subcategory is already deleted" });
    }

    // Soft delete the subcategory
    await db.update(subcategories)
      .set({ isDeleted: true })
      .where(eq(subcategories.id, subcategoryId));

    res.json({ message: "Subcategory deleted successfully" });
  }));


  // Update the video search endpoint to filter out deleted videos
  app.get("/api/videos", asyncHandler(async (req: Request, res: Response) => {
    const allVideos = await db.query.videos.findMany({
      where: eq(videos.isDeleted, false), // Only get non-deleted videos
      with: {
        category: true,
        subcategory: true
      }
    });
    res.json(allVideos);
  }));

  // Get individual video
  app.get("/api/videos/:id", asyncHandler(async (req: Request, res: Response) => {
    const videoId = parseInt(req.params.id);

    if (isNaN(videoId)) {
      return res.status(400).json({ message: "Invalid video ID" });
    }

    const video = await db.query.videos.findFirst({
      where: and(
        eq(videos.id, videoId),
        eq(videos.isDeleted, false)
      ),
      with: {
        category: true,
        subcategory: true
      }
    });

    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }

    res.json(video);
  }));

  // Get video recommendations
  app.get("/api/videos/:id/recommendations", asyncHandler(async (req: Request, res: Response) => {
    const videoId = parseInt(req.params.id);

    if (isNaN(videoId)) {
      return res.status(400).json({ message: "Invalid video ID" });
    }

    // Get the current video to find related content
    const currentVideo = await db.query.videos.findFirst({
      where: eq(videos.id, videoId),
      with: {
        category: true,
        subcategory: true
      }
    });

    if (!currentVideo) {
      return res.status(404).json({ message: "Video not found" });
    }

    // Find related videos in the same category or subcategory
    // Exclude the current video
    const relatedVideos = await db.query.videos.findMany({
      where: and(
        sql`${videos.id} != ${videoId}`,
        sql`${videos.categoryId} = ${currentVideo.categoryId}`
      ),
      with: {
        category: true,
        subcategory: true
      },
      limit: 6
    });

    res.json(relatedVideos);
  }));

  // Update the last active group endpoint with correct column references
  app.get("/api/videos/:videoId/last-active-group", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const videoId = parseInt(req.params.videoId);

    if (isNaN(videoId)) {
      return res.status(400).json({ message: "Invalid video ID" });
    }

    // Find the most recently active group for this video where the user is a member
    const lastActiveGroup = await db.query.discussionGroups.findFirst({
      where: and(
        eq(discussionGroups.videoId, videoId),
        sql`exists (
          select 1 from ${groupMembers}
          where ${groupMembers.groupId} = ${discussionGroups.id}
          and ${groupMembers.userId} = ${req.user!.id}
        )`
      ),
      with: {
        members: {
          with: {
            user: {
              columns: {
                id: true,
                username: true
              }
            }
          }
        }
      },
      orderBy: [desc(discussionGroups.updatedAt)]
    });

    if (!lastActiveGroup) {
      return res.json({
        data: null,
        message: "No active group found",
        statusCode: 404
      });
    }

    // Transform the response to match the expected schema
    const response = {
      data: {
        ...lastActiveGroup,
        members: lastActiveGroup.members.map(member => ({
          id: member.id,
          userId: member.userId,
          username: member.user.username
        }))
      },
      message: "Last active group retrieved successfully",
      statusCode: 200
    };

    res.json(response);
  }));

  // Add video submission endpoint
  app.post("/api/videos", asyncHandler(async (req: Request, res: Response) => {
    const { title, url, description, categoryId, subcategoryId, platform, thumbnailUrl, customThumbnail } = req.body;

    if (!title || !url || !categoryId || !platform) {
      return res.status(400).json({
        message: "Missing required fields",
        required: ["title", "url", "categoryId", "platform"]
      });
    }

    // Validate category exists
    const category = await db.query.categories.findFirst({
      where: eq(categories.id, categoryId)
    });

    if (!category) {
      return res.status(400).json({ message: "Invalid category" });
    }

    // If subcategoryId provided, validate it exists and belongs to category
    if (subcategoryId) {
      const subcategory = await db.query.subcategories.findFirst({
        where: and(
          eq(subcategories.id, subcategoryId),
          eq(subcategories.categoryId, categoryId)
        )
      });

      if (!subcategory) {
        return res.status(400).json({ message: "Invalid subcategory for the selected category" });
      }
    }

    // Insert the video with the custom thumbnail URL if provided
    const [newVideo] = await db.insert(videos)
      .values({
        title,
        url,
        description,
        categoryId,
        subcategoryId: subcategoryId || null,
        platform,
        thumbnailUrl,
        customThumbnail: customThumbnail || false,
        createdAt: new Date(),
        isDeleted: false
      })
      .returning();

    // Return the created video with related data
    const videoWithDetails = await db.query.videos.findFirst({
      where: eq(videos.id, newVideo.id),
      with: {
        category: true,
        subcategory: true
      }
    });

    res.status(201).json(videoWithDetails);
  }));

  // Update video endpoint - ensure thumbnailUrl is properly handled
  app.patch("/api/videos/:id", asyncHandler(async (req: Request, res: Response) => {
    const videoId = parseInt(req.params.id);
    const { title, url, description, categoryId, subcategoryId, platform, thumbnailUrl, customThumbnail } = req.body;

    if (isNaN(videoId)) {
      return res.status(400).json({ message: "Invalid video ID" });
    }

    // Validate video exists
    const existingVideo = await db.query.videos.findFirst({
      where: eq(videos.id, videoId)
    });

    if (!existingVideo) {
      return res.status(404).json({ message: "Video not found" });
    }

    // Update the video with thumbnail information
    const [updatedVideo] = await db.update(videos)
      .set({
        title,
        url,
        description,
        categoryId,
        subcategoryId,
        platform,
        thumbnailUrl,
        customThumbnail: customThumbnail || false,
        updatedAt: new Date()
      })
      .where(eq(videos.id, videoId))
      .returning();

    // Fetch and return updated video with related data
    const videoWithDetails = await db.query.videos.findFirst({
      where: eq(videos.id, videoId),
      with: {
        category: true,
        subcategory: true
      }
    });

    res.json(videoWithDetails);
  }));

  // Add REST endpoint for group invites
  app.get("/api/groups/invite/:code", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const inviteCode = req.params.code;
    console.log('Fetching group for invite code:', inviteCode);

    // Find group by invite code
    const group = await db.query.discussionGroups.findFirst({
      where: eq(discussionGroups.inviteCode, inviteCode),
      with: {
        members: {
          with: {
            user: {
              columns: {
                username: true
              }
            }
          }
        }
      }
    });

    if (!group) {
      console.log('Group not found for invite code:', inviteCode);
      return res.status(404).json({ message: "Invalid invite code" });
    }

    // Check if user is already a member
    const existingMember = group.members.find(member => member.userId === req.user!.id);

    if (!existingMember) {
      // Add user as member
      await db.insert(groupMembers)
        .values({
          userId: req.user!.id,
          groupId: group.id,
          role: 'member'
        });

      console.log('Added new member to group:', {
        userId: req.user!.id,
        groupId: group.id
      });
    }

    console.log('Successfully joined group:', group.id);
    res.json(group);
  }));

  // Protected endpoints - require authentication

  // Update the group creation endpoint
  app.post("/api/groups", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { name, videoId, description } = req.body;
    const userId = req.user?.id;

    console.log('Creating new group:', {
      name,
      videoId,
      userId,
      timestamp: new Date().toISOString()
    });

    if (!userId || !videoId || !name) {
      console.error('Missing required fields:', {
        hasUserId: !!userId,
        hasVideoId: !!videoId,
        hasName: !!name
      });
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Generate a random invite code
    const inviteCode = Math.random().toString(36).substring(2, 15);

    try {
      // Create the group and add creator as member in a single transaction
      const [group] = await db.transaction(async (tx) => {
        // Create the group with all required fields
        const [newGroup] = await tx
          .insert(discussionGroups)
          .values({
            name, // Changed from groupName to name to match schema
            description: description || `Discussion group for video ${videoId}`,
            videoId,
            creatorId: userId,
            createdAt: new Date(),
            updatedAt: new Date(),
            inviteCode,
            isPrivate: false
          })
          .returning();

        // Add the creator as a member and admin
        await tx
          .insert(groupMembers)
          .values({
            userId,
            groupId: newGroup.id,
            role: 'admin',
            joinedAt: new Date(),
            lastReadAt: new Date(),
            notificationsEnabled: true,
            emailNotifications: false,
            unreadCount: 0
          });

        console.log('Successfully created group:', {
          groupId: newGroup.id,
          creatorId: userId,
          timestamp: new Date().toISOString()
        });

        return [newGroup];
      });

      // Update the group response to include username
      const groupWithDetails = await db.query.discussionGroups.findFirst({
        where: eq(discussionGroups.id, group.id),
        with: {
          members: {
            with: {
              user: {
                columns: {
                  username: true,
                  id: true,
                  email: true
                }
              }
            }
          }
        }
      });

      if (!groupWithDetails) {
        throw new Error('Failed to create group');
      }

      // Transform the response to match the expected schema
      const response = {
        ...groupWithDetails,
        members: groupWithDetails.members.map(member => ({
          ...member,
          username: member.user.username,
          userId: member.user.id,
          email: member.user.email
        }))
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('Error creating group:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });
      throw error; // Let the global error handler handle it
    }
  }));


  // Add direct group access endpoint
  app.get("/api/groups/:groupId", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const groupId = parseInt(req.params.groupId);
    if (isNaN(groupId)) {
      return res.status(400).json({ message: "Invalid group ID" });
    }

    console.log('Fetching group:', groupId, 'for user:', req.user?.id);

    // Get group with members and messages
    const group = await db.query.discussionGroups.findFirst({
      where: eq(discussionGroups.id, groupId),
      with: {
        members: {
          with: {
            user: {
              columns: {
                username: true
              }
            }
          }
        }
      }
    });

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Remove messages length check since messages are queried separately
    console.log('Found group with', group.members?.length || 0, 'members');

    // Check if user is already a member
    const existingMember = group.members.find(member => member.userId === req.user!.id);

    if (!existingMember) {
      const newMember = {
        id: -1, // Temporary ID for UI purposes
        userId: req.user!.id,
        groupId: group.id,
        role: 'member',
        joinedAt: new Date(),
        lastReadAt: new Date(),
        notificationsEnabled: true,
        emailNotifications: false,
        unreadCount: 0,
        reminderCount: 0,
        user: {
          username: req.user!.username
        }
      };

      // Add user as member in database
      await db.insert(groupMembers)
        .values({
          userId: req.user!.id,
          groupId: group.id,
          role: 'member',
          joinedAt: new Date(),
          lastReadAt: new Date(),
          notificationsEnabled: true,
          emailNotifications: false,
          unreadCount: 0
        });

      group.members.push(newMember);
    }

    res.json(group);
  }));

  // Add this new endpoint after the other group-related endpoints
  app.post("/api/groups/:groupId/leave", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const groupId = parseInt(req.params.groupId);
    if (isNaN(groupId)) {
      return res.status(400).json({ message: "Invalid group ID" });
    }

    // Delete the group membership
    await db
      .delete(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, req.user!.id)
        )
      );

    res.json({ message: "Successfully left the group" });
  }));

  // Update the delete endpoint with proper error handling and response
  app.delete("/api/videos/:id", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const videoId = parseInt(req.params.id);
    console.log(`[DELETE] Attempting to delete video ${videoId}`, {
      timestamp: new Date().toISOString(),
      userId: req.user?.id
    });

    if (isNaN(videoId)) {
      console.error('Invalid video ID provided:', req.params.id);
      return res.status(400).json({
        success: false,
        message: "Invalid video ID"
      });
    }

    try {
      // Get the video first to check if it exists
      const video = await db.query.videos.findFirst({
        where: eq(videos.id, videoId)
      });

      if (!video) {
        console.error('Video not found:', videoId);
        return res.status(404).json({
          success: false,
          message: "Video not found"
        });
      }

      console.log(`Found video to delete:`, {
        videoId: video.id,
        title: video.title,
        currentlyDeleted: video.isDeleted
      });

      // Perform soft delete
      const [updated] = await db
        .update(videos)
        .set({
          isDeleted: true,
          updatedAt: new Date()
        })
        .where(eq(videos.id, videoId))
        .returning();

      console.log(`Video ${videoId} soft deleted successfully`, {
        timestamp: new Date().toISOString(),
        updatedVideo: updated
      });

      res.json({
        success: true,
        message: "Video deleted successfully",
        videoId: videoId
      });
    } catch (error) {
      console.error('Error soft deleting video:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });

      res.status(500).json({
        success: false,
        message: "Error deleting video",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }));

  // Preferences endpoints
  app.get("/api/preferences", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const preferences = await db.query.userPreferences.findFirst({
      where: sql`${userPreferences.userId} = ${req.user!.id}`
    });

    if (!preferences) {
      return res.status(404).json({
        message: "No preferences found"
      });
    }

    res.json(preferences);
  }));

  app.post("/api/preferences", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { preferredCategories, excludedCategories, preferredPlatforms } = req.body;

    if (!Array.isArray(preferredCategories) || !Array.isArray(excludedCategories) || !Array.isArray(preferredPlatforms)) {
      return res.status(400).json({
        message: "Invalid preferences format"
      });
    }

    const [savedPreferences] = await db
      .insert(userPreferences)
      .values({
        userId: req.user!.id,
        preferredCategories,
        excludedCategories,
        preferredPlatforms,
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: [userPreferences.userId],
        set: {
          preferredCategories,
          excludedCategories,
          preferredPlatforms,
          updatedAt: new Date()
        }
      })
      .returning();

    res.json(savedPreferences);
  }));

  // Get unread count for a group
  app.get("/api/groups/:groupId/unread-count", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const groupId = parseInt(req.params.groupId);
    if (isNaN(groupId)) {
      return res.status(400).json({ message: "Invalid group ID" });
    }

    // Get the member record to get lastReadAt
    const member = await db.query.groupMembers.findFirst({
      where: and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, req.user!.id)
      )
    });

    if (!member) {
      return res.status(404).json({ message: "Not a member of this group" });
    }

    // Count messages after lastReadAt
    const unreadCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(groupMessages)
      .where(
        and(
          eq(groupMessages.groupId, groupId),
          gt(groupMessages.createdAt, member.lastReadAt!)
        )
      )
      .then(result => Number(result[0].count));

    res.json({ unreadCount });
  }));

  // Mark messages as read
  app.post("/api/groups/:groupId/mark-read", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const groupId = parseInt(req.params.groupId);
    if (isNaN(groupId)) {
      return res.status(400).json({ message: "Invalid group ID" });
    }

    // Update lastReadAt for the member
    await db
      .update(groupMembers)
      .set({
        lastReadAt: new Date(),
        unreadCount: 0
      })
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, req.user!.id)
        )
      );

    res.json({ message: "Messages marked as read" });
  }));

  // Domain verification endpoint
  app.get("/api/verify-domain", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      if (!resend) {
        throw new Error('Email service not configured');
      }

      const emailClient = resend;
      const domains = await emailClient.domains.list();
      console.log('Current domains:', domains);

      // Send verification email if needed
      if (!domains.data || domains.data.length === 0) {
        console.log('No domains found, attempting to add domain');
        const domain = process.env.EMAIL_DOMAIN || 'yourdomain.com';
        await emailClient.domains.create({ name: domain });
        console.log('Domain created:', domain);
      }

      res.json({ 
        success: true, 
        domains: domains.data || [] 
      });
    } catch (error) {
      console.error('Domain verification failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }));

  // Test email endpoint
  app.post("/api/send-test-email", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!resend) {
        throw new Error('Email service not configured');
      }

      const emailClient = resend;
      const result = await emailClient.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'noreply@yourdomain.com',
        to: req.user?.email || '',
        subject: 'Test Email',
        html: '<p>This is a test email from your video learning platform.</p>'
      });

      res.json({ success: true, result });
    } catch (error) {
      console.error('Failed to send test email:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }));

  // Update the test email endpoint to include better error handling and logging
  if (process.env.NODE_ENV !== 'production') {
    app.post("/api/test/email-notification", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      console.log('=== Test Email Endpoint Start ===');
      if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
        console.error('Email configuration missing:', {
          hasApiKey: !!process.env.RESEND_API_KEY,
          hasFromEmail: !!process.env.RESEND_FROM_EMAIL
        });
        return res.status(500).json({ message: "Email configuration missing" });
      }

      if (!resend) {
        console.error('Resend client not initialized in test endpoint');
        return res.status(500).json({ message: "Email service not initialized" });
      }

      try {
        if (!req.user?.email) {
          console.error('No email address available for testing');
          return res.status(400).json({ message: "No email address available for testing" });
        }

        // Get the specific group
        const groupId = parseInt(req.query.groupId as string);
        if (!groupId) {
          console.error('Group ID is required for test email');
          return res.status(400).json({ message: "Group ID is required" });
        }

        console.log('Fetching test group:', groupId);
        const testGroup = await db.query.discussionGroups.findFirst({
          where: eq(discussionGroups.id, groupId),
          with: {
            messages: {
              limit: 5,
              orderBy: [desc(groupMessages.createdAt)],
              with: {
                user: {
                  columns: {
                    username: true
                  }
                }
              }
            }
          }
        });

        if (!testGroup) {
          console.error('No discussion group found:', groupId);
          return res.status(404).json({ message: "No discussion group found for testing" });
        }

        console.log('Found test group:', {
          id: testGroup.id,
          name: testGroup.name,
          messageCount: testGroup.messages?.length || 0
        });

        try {
          await sendUnreadMessagesNotification({
            userEmail: req.user.email,
            userName: req.user.username,
            groupName: testGroup.name,
            videoTitle: "Test Video",
            unreadCount: testGroup.messages?.length || 0,
            unreadMessages: testGroup.messages || [],
            groupUrl: `${process.env.APP_URL || 'http://localhost:3000'}/video/1/group/${testGroup.id}`
          });
          console.log('Test notification sent successfully');
        } catch (error) {
          console.error('Error in sendUnreadMessagesNotification:', error);
          throw error;
        }

        res.json({
          message: "Test email notification sent. Check your inbox.",
          details: {
            sentTo: req.user.email,
            groupName: testGroup.name,
            messageCount: testGroup.messages?.length || 0
          }
        });
      } catch (error) {
        console.error('Error sending test email:', error);
        res.status(500).json({
          message: "Error sending test email",
          error: error instanceof Error ? error.message : "Unknown error",
          details: error instanceof Error ? error.stack : undefined
        });
      }
    }));
  }

  // Return the HTTP server at the end of registerRoutes
  return httpServer;
}