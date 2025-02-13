import { createServer, type Server } from "http";
import express, { type Express } from 'express';
import { db } from "@db";
import { sql, eq, and, desc } from "drizzle-orm";
import { videos, categories } from "@db/schema";
import { setupAuth, requireAuth } from "./auth";
import groupMessagesRouter from './routes/group-messages';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
    email: string;
    is_admin?: boolean;
  };
}

export function registerRoutes(app: Express): Server {
  const httpServer = createServer(app);
  const sessionMiddleware = setupAuth(app);
  app.use(groupMessagesRouter);

  // Get all categories (only top-level)
  app.get("/api/categories", async (req, res) => {
    try {
      const allCategories = await db.query.categories.findMany({
        where: and(
          eq(categories.isDeleted, false),
          sql`${categories.parentId} IS NULL`
        ),
        orderBy: [desc(categories.displayOrder)]
      });
      res.json(allCategories);
    } catch (error) {
      console.error('Error fetching categories:', error);
      res.status(500).json({
        message: "Error fetching categories",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get subcategories for a category
  app.get("/api/categories/:categoryId/subcategories", async (req, res) => {
    try {
      const categoryId = parseInt(req.params.categoryId);
      if (isNaN(categoryId)) {
        return res.status(400).json({ message: "Invalid category ID" });
      }

      const subcategories = await db.query.categories.findMany({
        where: and(
          eq(categories.parentId, categoryId),
          eq(categories.isDeleted, false)
        ),
        orderBy: [desc(categories.displayOrder)]
      });

      res.json(subcategories);
    } catch (error) {
      console.error('Error fetching subcategories:', error);
      res.status(500).json({
        message: "Error fetching subcategories",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get all videos
  app.get("/api/videos", async (req, res) => {
    try {
      const allVideos = await db.query.videos.findMany({
        where: eq(videos.isDeleted, false),
        with: {
          category: true
        }
      });
      res.json(allVideos);
    } catch (error) {
      console.error('Error fetching videos:', error);
      res.status(500).json({
        message: "Error fetching videos",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get individual video
  app.get("/api/videos/:id", async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);

      if (isNaN(videoId)) {
        return res.status(400).json({ message: "Invalid video ID" });
      }

      const video = await db.query.videos.findFirst({
        where: eq(videos.id, videoId),
        with: {
          category: true
        }
      });

      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }

      res.json(video);
    } catch (error) {
      console.error('Error fetching video:', error);
      res.status(500).json({
        message: "Error fetching video",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get video recommendations
  app.get("/api/videos/:id/recommendations", async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);

      if (isNaN(videoId)) {
        return res.status(400).json({ message: "Invalid video ID" });
      }

      // Get the current video to find related content
      const currentVideo = await db.query.videos.findFirst({
        where: eq(videos.id, videoId),
        with: {
          category: true
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
          category: true
        },
        limit: 6
      });

      res.json(relatedVideos);
    } catch (error) {
      console.error('Error fetching video recommendations:', error);
      res.status(500).json({
        message: "Error fetching recommendations",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });


  // Add video
  app.post("/api/videos", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { title, description, url, categoryId, platform, thumbnailUrl } = req.body;

      if (!title || !url || !categoryId || !platform) {
        return res.status(400).json({
          message: "Missing required fields",
          details: "Title, URL, category, and platform are required"
        });
      }

      const [video] = await db
        .insert(videos)
        .values({
          title,
          description,
          url,
          categoryId: parseInt(categoryId),
          platform,
          thumbnailUrl,
          watched: false,
          isDeleted: false
        })
        .returning();

      // Return the created video with category info
      const videoWithDetails = await db.query.videos.findFirst({
        where: eq(videos.id, video.id),
        with: {
          category: true
        }
      });

      res.status(201).json(videoWithDetails);
    } catch (error) {
      console.error('Error creating video:', error);
      res.status(500).json({
        message: "Failed to create video",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Domain verification endpoint. Moved this before the httpServer creation.
  app.get("/api/verify-domain", requireAuth, async (req: AuthenticatedRequest, res) => {
    if (!req.user?.is_admin) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const domain = process.env.RESEND_FROM_EMAIL?.split('@')[1];
      if (!domain) {
        return res.status(400).json({ message: "No domain found in RESEND_FROM_EMAIL" });
      }

      // Get domain status first
      const domains = await resend.domains.list();
      console.log('Current domains:', domains);

      const domainDetails = await resend.domains.get(domain);
      console.log('Domain details:', domainDetails);

      if (!domainDetails) {
        // If domain doesn't exist, create it
        await resend.domains.create({ name: domain });
      }

      const result = await resend.domains.verify(domain);
      return res.json(result);
    } catch (error) {
      console.error('Domain verification error:', error);
      return res.status(500).json({ message: "Error verifying domain", error });
    }
  });

  // Update the test email endpoint to include better error handling and logging
  if (process.env.NODE_ENV !== 'production') {
    app.post("/api/test/email-notification", requireAuth, async (req: AuthenticatedRequest, res) => {
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
    });
  }

  return httpServer;
}