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

// Wrap all route handlers to ensure proper error handling
const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};

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

  // Add logging middleware for group-related endpoints
  app.use('/api/groups*', (req: Request, _res: Response, next: NextFunction) => {
    console.log('[Group API]', {
      path: req.path,
      method: req.method,
      userId: (req as AuthenticatedRequest).user?.id,
      timestamp: new Date().toISOString()
    });
    next();
  });

  // Add logging middleware for membership checks
  app.use('/api/videos/:videoId/last-active-group', (req: Request, _res: Response, next: NextFunction) => {
    console.log('[LastActiveGroup] Request:', {
      videoId: req.params.videoId,
      userId: (req as AuthenticatedRequest).user?.id,
      timestamp: new Date().toISOString(),
      headers: req.headers,
      query: req.query
    });
    next();
  });


  // Update the last-active-group endpoint with enhanced debugging and persistence
  app.get("/api/videos/:videoId/last-active-group", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const videoId = parseInt(req.params.videoId);
    const userId = req.user?.id;

    console.log('[LastActiveGroup] Starting request:', {
      videoId,
      userId,
      path: req.path,
      timestamp: new Date().toISOString()
    });

    if (isNaN(videoId)) {
      console.error('[LastActiveGroup] Invalid videoId:', videoId);
      return res.status(400).json({ message: "Invalid video ID" });
    }

    try {
      const result = await db.transaction(async (tx) => {
        // Find all active groups for this video that the user is a member of
        // Modified query to ensure we get the most recently active group
        const groupsQuery = await tx.query.discussionGroups.findMany({
          where: and(
            eq(discussionGroups.videoId, videoId),
            eq(discussionGroups.isDeleted, false),
            sql`exists (
              select 1 from ${groupMembers}
              where ${groupMembers.groupId} = ${discussionGroups.id}
              and ${groupMembers.userId} = ${userId}
              and ${groupMembers.isDeleted} = false
              and ${groupMembers.lastReadAt} > current_timestamp - interval '7 days'
            )`
          ),
          with: {
            members: {
              where: eq(groupMembers.isDeleted, false),
              with: {
                user: {
                  columns: {
                    id: true,
                    username: true,
                    email: true
                  }
                }
              }
            },
            video: {
              columns: {
                id: true,
                title: true
              }
            }
          },
          orderBy: [desc(discussionGroups.updatedAt)]
        });

        console.log('[LastActiveGroup] Found groups:', {
          count: groupsQuery.length,
          groups: groupsQuery.map(g => ({
            id: g.id,
            name: g.name,
            memberCount: g.members?.length || 0,
            updatedAt: g.updatedAt,
            isDeleted: g.isDeleted
          })),
          timestamp: new Date().toISOString()
        });

        if (!groupsQuery.length) {
          console.log('[LastActiveGroup] No active groups found');
          return null;
        }

        const mostRecentGroup = groupsQuery[0];
        const now = new Date();

        // Update member's lastReadAt and reset unread count
        const [updatedMember] = await tx.update(groupMembers)
          .set({
            lastReadAt: now,
            unreadCount: 0
          })
          .where(and(
            eq(groupMembers.groupId, mostRecentGroup.id),
            eq(groupMembers.userId, userId),
            eq(groupMembers.isDeleted, false)
          ))
          .returning();

        console.log('[LastActiveGroup] Updated member status:', {
          groupId: mostRecentGroup.id,
          userId,
          member: updatedMember,
          timestamp: now.toISOString()
        });

        // Update group's activity timestamp
        const [updatedGroup] = await tx.update(discussionGroups)
          .set({ updatedAt: now })
          .where(and(
            eq(discussionGroups.id, mostRecentGroup.id),
            eq(discussionGroups.isDeleted, false)
          ))
          .returning();

        console.log('[LastActiveGroup] Updated group:', {
          groupId: updatedGroup.id,
          updatedAt: updatedGroup.updatedAt,
          timestamp: now.toISOString()
        });

        return mostRecentGroup;
      });

      console.log('[LastActiveGroup] Final response:', {
        hasGroup: !!result,
        groupId: result?.id,
        memberCount: result?.members?.length || 0,
        timestamp: new Date().toISOString()
      });

      res.json(result);
    } catch (error) {
      console.error('[LastActiveGroup] Error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        query: { videoId, userId },
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }));

  // Register the group messages router after auth is set up
  app.use(groupMessagesRouter);


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

  // Add logging middleware for membership checks
  app.use('/api/videos/:videoId/last-active-group', (req: Request, _res: Response, next: NextFunction) => {
    console.log('[LastActiveGroup] Request:', {
      videoId: req.params.videoId,
      userId: (req as AuthenticatedRequest).user?.id,
      timestamp: new Date().toISOString(),
      headers: req.headers,
      query: req.query
    });
    next();
  });

  // Add REST endpoint for group invites
  app.get("/api/groups/invite/:code", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const inviteCode = req.params.code;
    console.log('[Invite] Fetching group for invite code:', inviteCode);

    // Find group by invite code
    const group = await db.query.discussionGroups.findFirst({
      where: eq(discussionGroups.inviteCode, inviteCode),
      with: {
        members: {
          with: {
            user: {
              columns: {
                username: true,
                id: true
              }
            }
          }
        }
      }
    });

    if (!group) {
      console.log('[Invite] Group not found for invite code:', inviteCode);
      return res.status(404).json({ message: "Invalid invite code" });
    }

    // Check if user is already a member
    const existingMember = group.members.find(member => member.userId === req.user!.id);

    if (!existingMember) {
      // Add user as member with immediate persistence
      await db.insert(groupMembers)
        .values({
          userId: req.user!.id,
          groupId: group.id,
          role: 'member',
          joinedAt: new Date(), // Set immediately for persistence
          lastReadAt: new Date(), // Set immediately for persistence
          notificationsEnabled: true,
          emailNotifications: false,
          unreadCount: 0,
          isDeleted: false
        });

      console.log('[Invite] Added new member to group:', {
        userId: req.user!.id,
        groupId: group.id,
        timestamp: new Date().toISOString()
      });
    } else {
      // Update lastReadAt to ensure continued persistence
      await db.update(groupMembers)
        .set({ lastReadAt: new Date() })
        .where(and(
          eq(groupMembers.groupId, group.id),
          eq(groupMembers.userId, req.user!.id)
        ));

      console.log('[Invite] Updated existing member:', {
        userId: req.user!.id,
        groupId: group.id,
        timestamp: new Date().toISOString()
      });
    }

    // Get fresh group data with updated membership
    const updatedGroup = await db.query.discussionGroups.findFirst({
      where: eq(discussionGroups.id, group.id),
      with: {
        members: {
          with: {
            user: {
              columns: {
                username: true,
                id: true
              }
            }
          }
        }
      }
    });

    console.log('[Invite] Successfully joined group:', {
      groupId: group.id,
      memberCount: updatedGroup?.members.length || 0,
      timestamp: new Date().toISOString()
    });

    res.json(updatedGroup);
  }));

  // Update the join endpoint to prevent duplicates
  app.post("/api/groups/invite/:inviteCode/join", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { inviteCode } = req.params;
    const { videoId } = req.body;

    console.log('[Join] Processing join request:', {
      inviteCode,
      videoId,
      userId: req.user?.id,
      timestamp: new Date().toISOString()
    });

    if (!inviteCode || !videoId) {
      return res.status(400).json({ message: "Missing required parameters" });
    }

    try {
      const result = await db.transaction(async (tx) => {
        // First, clean up any existing duplicate entries
        await tx.execute(
          sql`WITH ranked_members AS (
            SELECT id,
              ROW_NUMBER() OVER (
                PARTITION BY group_id, user_id
                ORDER BY last_read_at DESC
              ) as rn
            FROM ${groupMembers}
            WHERE user_id = ${req.user!.id}
          )
          UPDATE ${groupMembers}
          SET is_deleted = true
          WHERE id IN (
            SELECT id FROM ranked_members WHERE rn > 1
          )`
        );

        // Find group by invite code
        const group = await tx.query.discussionGroups.findFirst({
          where: eq(discussionGroups.inviteCode, inviteCode),
          with: {
            members: {
              where: and(
                eq(groupMembers.isDeleted, false),
                eq(groupMembers.userId, req.user!.id)
              ),
              with: {
                user: {
                  columns: {
                    id: true,
                    username: true
                  }
                }
              }
            }
          }
        });

        if (!group) {
          throw new Error("Invalid invite code");
        }

        // Check for existing active membership
        const existingMember = group.members[0];

        if (existingMember) {
          // Update lastReadAt to extend persistence
          const [updatedMember] = await tx.update(groupMembers)
            .set({
              lastReadAt: new Date(),
              notificationsEnabled: true
            })
            .where(eq(groupMembers.id, existingMember.id))
            .returning();

          console.log('[Join] Updated existing member:', {
            memberId: updatedMember.id,
            groupId: group.id,
            userId: req.user?.id,
            timestamp: new Date().toISOString()
          });

          return { group };
        }

        // Add new member with proper persistence
        const [newMember] = await tx.insert(groupMembers)
          .values({
            groupId: group.id,
            userId: req.user!.id,
            role: 'member',
            joinedAt: new Date(),
            lastReadAt: new Date(),
            notificationsEnabled: true,
            emailNotifications: false,
            unreadCount: 0,
            isDeleted: false
          })
          .returning();

        // Update group's activity timestamp
        await tx.update(discussionGroups)
          .set({ updatedAt: new Date() })
          .where(eq(discussionGroups.id, group.id));

        console.log('[Join] Added new member:', {
          memberId: newMember.id,
          groupId: group.id,
          userId: req.user?.id,
          timestamp: new Date().toISOString()
        });

        return { group };
      });

      res.json(result);
    } catch (error) {
      console.error('[Join] Error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        inviteCode,
        userId: req.user?.id,
        timestamp: new Date().toISOString()
      });

      if (error instanceof Error && error.message === "Invalid invite code") {
        return res.status(404).json({ message: "Invalid invite code" });
      }

      throw error;
    }
  }));

  // Update the group creation endpoint to ensure proper membership persistence
  app.post("/api/groups", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { name, videoId, description } = req.body;
    const userId = req.user?.id;

    console.log('[CreateGroup] Request received:', {
      name,
      videoId,
      userId,
      timestamp: new Date().toISOString()
    });

    if (!userId || !videoId || !name) {
      console.error('[CreateGroup] Missing required fields:', {
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
            name,
            description: description || `Discussion group for video ${videoId}`,
            videoId,
            creatorId: userId,
            createdAt: new Date(),
            updatedAt: new Date(),
            inviteCode,
            isPrivate: false,
            isDeleted: false
          })
          .returning();

        // Add the creator as a member with enhanced persistence
        const [member] = await tx
          .insert(groupMembers)
          .values({
            userId,
            groupId: newGroup.id,
            role: 'admin',
            joinedAt: new Date(),
            lastReadAt: new Date(),
            notificationsEnabled: true,
            emailNotifications: true,
            unreadCount: 0,
            isDeleted: false
          })
          .returning();

        console.log('[CreateGroup] Created group and member:', {
          groupId: newGroup.id,
          memberId: member.id,
          timestamp: new Date().toISOString()
        });

        return [newGroup];
      });

      // Get group with full details including membership info
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
          },
          video: {
            columns: {
              id: true,
              title: true
            }
          }
        }
      });

      if (!groupWithDetails) {
        throw new Error('Failed to create group with details');
      }

      console.log('[CreateGroup] Successfully created group:', {
        groupId: groupWithDetails.id,
        memberCount: groupWithDetails.members.length,
        timestamp: new Date().toISOString()
      });

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
      console.error('[CreateGroup] Error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });
      throw error;
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
            user: true
          }
        }
      }
    });

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

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
        isDeleted: false,
        user: {
          id: req.user!.id,
          createdAt: new Date(),
          username: req.user!.username,
          email: req.user!.email,
          password: '', // Empty string for security
          isAdmin: false
        }
      };

      // Add user as member in database with proper persistence
      await db.insert(groupMembers)
        .values({
          userId: req.user!.id,
          groupId: group.id,
          role: 'member',
          joinedAt: new Date(),
          lastReadAt: new Date(),
          notificationsEnabled: true,
          emailNotifications: false,
          unreadCount: 0,
          isDeleted: false
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

    try {
      // First mark the member as deleted
      await db.update(groupMembers)
        .set({
          isDeleted: true,
          lastReadAt: new Date() // Update timestamp for tracking
        })
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.userId, req.user!.id)
          )
        );

      // Update group's last activity
      await db.update(discussionGroups)
        .set({ updatedAt: new Date() })
        .where(eq(discussionGroups.id, groupId));

      console.log('[LeaveGroup] Member left group:', {
        groupId,
        userId: req.user!.id,
        timestamp: new Date().toISOString()
      });

      res.json({ message: "Successfully left group" });
    } catch (error) {
      console.error('[LeaveGroup] Error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        groupId,
        userId: req.user!.id,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
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

      if (!updated) {
        console.error('Failed to update video:', videoId);
        return res.status(500).json({
          success: false,
          message: "Failed to delete video"
        });
      }

      console.log('Successfully deleted video:', {
        videoId: updated.id,
        title: updated.title,
        timestamp: new Date().toISOString()
      });

      res.json({
        success: true,
        message: "Video deleted successfully"
      });
    } catch (error) {
      console.error('Error deleting video:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });
      res.status(500).json({
        success: false,
        message: "Failed to delete video",
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

  // Domain verification endpoint. Moved this before the httpServer creation.
  app.get("/api/verify-domain", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const domain = process.env.RESEND_FROM_EMAIL?.split('@')[1];
      if (!domain) {
        return res.status(400).json({ message: "No domain foundin RESEND_FROM_EMAIL" });
      }

      // Get domain status first
      if (!resend) {
        throw new Error('Email service not configured');
      }
      const emailClient = resend;
      const domains = await emailClient.domains.list();
      console.log('Current domains:', domains);

      const domainDetails = await emailClient.domains.get(domain);
      console.log('Domain details:', domainDetails);

      if (!domainDetails) {
        // If domain doesn't exist, create it
        await emailClient.domains.create({ name: domain });
      }

      const result = await emailClient.domains.verify(domain);
      return res.json(result);
    } catch (error) {
      console.error('Domain verification error:', error);
      return res.status(500).json({ message: "Error verifying domain", error });
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

  // Add new endpoint for managing group members
  app.post("/api/groups/:groupId/members", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const groupId = parseInt(req.params.groupId);

    console.log('[Group Membership] Adding/updating member:', {
      groupId,
      userId: req.user?.id,
      timestamp: new Date().toISOString()
    });

    if (!req.user?.id || isNaN(groupId)) {
      console.error('[Group Membership] Invalid request:', {
        hasUserId: !!req.user?.id,
        groupId,
        timestamp: new Date().toISOString()
      });
      return res.status(400).json({ message: "Invalid request parameters" });
    }

    try {
      // Check if user is already a member
      const existingMember = await db.query.groupMembers.findFirst({
        where: and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, req.user.id)
        )
      });

      if (existingMember) {
        // Update existing member's lastReadAt
        await db.update(groupMembers)
          .set({
            lastReadAt: new Date(),
            notificationsEnabled: true
          })
          .where(and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.userId, req.user.id)
          ));

        console.log('[Group Membership] Updated existing member:', {
          memberId: existingMember.id,
          groupId,
          userId: req.user.id,
          timestamp: new Date().toISOString()
        });
      } else {
        // Add new member with proper persistence
        const [newMember] = await db.insert(groupMembers)
          .values({
            userId: req.user.id,
            groupId,
            role: 'member',
            joinedAt: new Date(), // Fixed typo
            lastReadAt: new Date(),
            notificationsEnabled: true,
            emailNotifications: false,
            unreadCount: 0,
            isDeleted: false
          })
          .returning();

        console.log('[Group Membership] Added new member:', {
          memberId: newMember.id,
          groupId,
          userId: req.user.id,
          timestamp: new Date().toISOString()
        });
      }

      // Get updated group data
      const group = await db.query.discussionGroups.findFirst({
        where: eq(discussionGroups.id, groupId),
        with: {
          members: {
            with: {
              user: {
                columns: {
                  username: true,
                  id: true
                }
              }
            }
          }
        }
      });

      if (!group) {
        throw new Error('Failed to fetch updated group data');
      }

      console.log('[Group Membership] Successfully processed membership:', {
        groupId,
        memberCount: group.members.length,
        timestamp: new Date().toISOString()
      });

      res.json(group);
    } catch (error) {
      console.error('[Group Membership] Error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }));

  // Add membership validation endpoint
  app.get("/api/groups/:groupId/members/:userId", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { groupId, userId } = req.params;
    console.log('Checking membership:', {
      groupId,
      userId,
      timestamp: new Date().toISOString()
    });

    if (!groupId || !userId) {
      return res.status(400).json({ message: "Missing required parameters" });
    }

    const member = await db.query.groupMembers.findFirst({
      where: and(
        eq(groupMembers.groupId, parseInt(groupId)),
        eq(groupMembers.userId, parseInt(userId))
      )
    });

    if (!member) {
      console.log('No membership found:', {
        groupId,
        userId,
        timestamp: new Date().toISOString()
      });
      return res.status(404).json({ message: "Membership not found" });
    }

    console.log('Found membership:', {
      memberId: member.id,
      lastReadAt: member.lastReadAt,
      timestamp: new Date().toISOString()
    });

    res.json(member);
  }));

  // Add membership touch endpoint for persistence
  app.post("/api/groups/:groupId/members/:userId/touch", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { groupId, userId } = req.params;
    console.log('[MembershipTouch] Request received:', {
      groupId,
      userId,
      authenticatedUserId: req.user?.id,
      timestamp: new Date().toISOString()
    });

    // Validate user is touching their own membership
    if (parseInt(userId) !== req.user?.id) {
      console.error('[MembershipTouch] User ID mismatch:', {
        requestedUserId: userId,
        authenticatedUserId: req.user?.id
      });
      return res.status(403).json({ message: "Not authorized to update this membership" });
    }

    try {
      // First check if membership exists
      const currentMember = await db.query.groupMembers.findFirst({
        where: and(
          eq(groupMembers.groupId, parseInt(groupId)),
          eq(groupMembers.userId, parseInt(userId))
        )
      });

      if (!currentMember) {
        console.log('[MembershipTouch] No membership found:', {
          groupId,
          userId,
          timestamp: new Date().toISOString()
        });

        // Try to create the membership if it doesn't exist
        const [newMember] = await db.insert(groupMembers)
          .values({
            groupId: parseInt(groupId),
            userId: parseInt(userId),
            role: 'member',
            joinedAt: new Date(),
            lastReadAt: new Date(),
            notificationsEnabled: true,
            emailNotifications: false,
            unreadCount: 0,
            active: true,
            isDeleted: false
          })
          .returning();

        console.log('[MembershipTouch] Created new membership:', {
          memberId: newMember.id,
          groupId: newMember.groupId,
          userId: newMember.userId,
          timestamp: new Date().toISOString()
        });

        return res.json(newMember);
      }

      // Update existing membership's lastReadAt timestamp
      const [updatedMember] = await db.update(groupMembers)
        .set({
          lastReadAt: new Date(),
          unreadCount: 0 // Reset unread count when user touches the group
        })
        .where(and(
          eq(groupMembers.groupId, parseInt(groupId)),
          eq(groupMembers.userId, parseInt(userId))
        ))
        .returning();

      console.log('[MembershipTouch] Updated existing membership:', {
        memberId: updatedMember.id,
        groupId: updatedMember.groupId,
        userId: updatedMember.userId,
        lastReadAt: updatedMember.lastReadAt,
        timestamp: new Date().toISOString()
      });

      res.json(updatedMember);
    } catch (error) {
      console.error('[MembershipTouch] Error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        groupId,
        userId,
        timestamp: new Date().toISOString()
      });
      res.status(500).json({
        message: "Failed to update membership",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }));

  // Add dedicated touch endpoint with improved logging and error handling
  app.post("/api/groups/:groupId/members/:userId/touch", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const groupId = parseInt(req.params.groupId);
    const userId = parseInt(req.params.userId);

    console.log('[MembershipTouch] Received request:', {
      groupId,
      userId,
      requestingUserId: req.user?.id,
      timestamp: new Date().toISOString()
    });

    if (isNaN(groupId) || isNaN(userId)) {
      console.error('[MembershipTouch] Invalid parameters:', { groupId, userId });
      return res.status(400).json({ message: "Invalid group ID or user ID" });
    }

    // Verify the requesting user matches the membership being touched
    if (userId !== req.user!.id) {
      console.error('[MembershipTouch] Unauthorized access:', {
        requestingUserId: req.user?.id,
        targetUserId: userId
      });
      return res.status(403).json({ message: "Unauthorized to update this membership" });
    }

    try {
      // Use a transaction to ensure both updates succeed or fail together
      await db.transaction(async (tx) => {
        // Get current membership state for logging
        const beforeUpdate = await tx.query.groupMembers.findFirst({
          where: and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.userId, userId)
          )
        });

        console.log('[MembershipTouch] Current state:', {
          groupId,
          userId,
          lastReadAt: beforeUpdate?.lastReadAt,
          unreadCount: beforeUpdate?.unreadCount,
          exists: !!beforeUpdate
        });

        if (!beforeUpdate) {
          throw new Error('Membership not found');
        }

        // Update member's lastReadAt and reset unread count
        await tx.update(groupMembers)
          .set({
            lastReadAt: new Date(),
            unreadCount: 0
          })
          .where(and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.userId, userId)
          ));

        // Update group's updatedAt to maintain persistence
        await tx.update(discussionGroups)
          .set({ updatedAt: new Date() })
          .where(eq(discussionGroups.id, groupId));

        // Get updated state for logging
        const afterUpdate = await tx.query.groupMembers.findFirst({
          where: and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.userId, userId)
          )
        });

        console.log('[MembershipTouch] Updated state:', {
          groupId,
          userId,
          lastReadAt: afterUpdate?.lastReadAt,
          unreadCount: afterUpdate?.unreadCount,
          success: true
        });
      });

      res.json({
        success: true,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[MembershipTouch] Error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });

      if (error instanceof Error && error.message === 'Membership not found') {
        return res.status(404).json({ message: "Group membership not found" });
      }

      throw error;
    }
  }));

  return httpServer;
}