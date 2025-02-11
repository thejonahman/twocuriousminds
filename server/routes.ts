import { createServer, type Server } from "http";
import express, { type Express } from 'express';
import { db } from "@db";
import { sql, eq, and, desc } from "drizzle-orm";
import { messages, users, videos, categories } from "@db/schema";

// Define requireAuth middleware
const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.session?.user) {
    return next();
  }
  res.status(401).json({ message: "Not authenticated" });
};

export function registerRoutes(app: Express): Server {
  // Create HTTP server
  const server = createServer(app);

  // Public endpoints - no auth required
  app.get("/api/categories", async (req, res) => {
    try {
      console.log("Fetching categories from database...");
      const allCategories = await db.query.categories.findMany({
        where: eq(categories.isDeleted, false),
        orderBy: [desc(categories.displayOrder)]
      });
      console.log("Retrieved categories:", allCategories);
      res.json(allCategories);
    } catch (error) {
      console.error('Error fetching categories:', error);
      res.status(500).json({
        message: "Error fetching categories",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get("/api/videos", async (req, res) => {
    try {
      console.log('Fetching videos from database...');
      const allVideos = await db.query.videos.findMany({
        with: {
          category: true,
          subcategory: true
        }
      });
      console.log('Successfully fetched videos:', allVideos.length);
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
          category: true,
          subcategory: true
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

  // Protected endpoints - require authentication
  app.get("/api/messages", requireAuth, async (req, res) => {
    try {
      const videoId = parseInt(req.query.videoId as string);
      if (isNaN(videoId)) {
        return res.status(400).json({ message: "Video ID is required" });
      }

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

      res.json(messagesList.reverse());
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({
        message: "Database error occurred",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add REST endpoint for group invites
  app.get("/api/groups/invite/:code", requireAuth, async (req, res) => {
    try {
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
    } catch (error) {
      console.error('Error processing group invite:', error);
      res.status(500).json({
        message: "Error processing invite",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });


  // Add direct group access endpoint
  app.get("/api/groups/:groupId", requireAuth, async (req, res) => {
    try {
      const groupId = parseInt(req.params.groupId);
      if (isNaN(groupId)) {
        return res.status(400).json({ message: "Invalid group ID" });
      }

      // Get group with members
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

      // Check if user is already a member
      const existingMember = group.members.find(member => member.userId === req.user!.id);

      if (!existingMember) {
        // Add user as member
        await db.insert(groupMembers)
          .values({
            groupId: group.id,
            userId: req.user!.id,
            role: 'member'
          });

        // Add the new member to the response
        group.members.push({
          userId: req.user!.id,
          groupId: group.id,
          role: 'member',
          user: {
            username: req.user!.username
          }
        });
      }

      res.json(group);
    } catch (error) {
      console.error('Error accessing group:', error);
      res.status(500).json({
        message: "Error accessing group",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });


  // Preferences endpoints
  app.get("/api/preferences", requireAuth, async (req: Request, res: Response) => {
    try {
      const preferences = await db.query.userPreferences.findFirst({
        where: sql`${userPreferences.userId} = ${req.user!.id}`
      });

      if (!preferences) {
        return res.status(404).json({
          message: "No preferences found"
        });
      }

      res.json(preferences);
    } catch (error) {
      console.error('Error fetching preferences:', error);
      res.status(500).json({
        message: "Error fetching preferences",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.post("/api/preferences", requireAuth, async (req: Request, res: Response) => {
    try {
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
    } catch (error) {
      console.error('Error saving preferences:', error);
      res.status(500).json({
        message: "Error saving preferences",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get unread count for a group
  app.get("/api/groups/:groupId/unread-count", requireAuth, async (req, res) => {
    try {
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
            sql`${groupMessages.createdAt} > ${member.lastReadAt}`
          )
        )
        .then(result => Number(result[0].count));

      res.json({ unreadCount });
    } catch (error) {
      console.error('Error fetching unread count:', error);
      res.status(500).json({
        message: "Error fetching unread count",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Mark messages as read
  app.post("/api/groups/:groupId/mark-read", requireAuth, async (req, res) => {
    try {
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
    } catch (error) {
      console.error('Error marking messages as read:', error);
      res.status(500).json({
        message: "Error marking messages as read",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  return server;
}