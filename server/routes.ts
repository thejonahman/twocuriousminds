import { createServer, type Server } from "http";
import express, { type Express } from 'express';
import { db } from "@db";
import { sql, eq, and, desc, gt } from "drizzle-orm";
import { videos, messages, users, discussionGroups, groupMessages, groupMembers, categories, userPreferences } from "@db/schema";
import { setupAuth, requireAuth } from "./auth";
import { setupPolling } from "./polling";
import {Request, Response} from 'express';

export function registerRoutes(app: Express): Server {
  const httpServer = createServer(app);

  // Setup auth and get session middleware
  const sessionMiddleware = setupAuth(app);

  // Setup polling instead of WebSocket
  setupPolling(app);

  // Public endpoints - no auth required
  app.get("/api/categories", async (req, res) => {
    try {
      const allCategories = await db.query.categories.findMany({
        where: eq(categories.isDeleted, false),
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

  app.get("/api/videos", async (req, res) => {
    try {
      const allVideos = await db.query.videos.findMany({
        with: {
          category: true,
          subcategory: true
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
    } catch (error) {
      console.error('Error fetching video recommendations:', error);
      res.status(500).json({
        message: "Error fetching recommendations",
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

  // Protected endpoints - require authentication

  // Update the group creation endpoint
  app.post("/api/groups", requireAuth, async (req: Request, res: Response) => {
    try {
      const { name, videoId } = req.body;
      const userId = req.user?.id;

      if (!userId || !videoId || !name) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Generate a random invite code
      const inviteCode = Math.random().toString(36).substring(2, 15);

      // Create the group and add creator as member in a single transaction
      const [group] = await db.transaction(async (tx) => {
        // Create the group with all required fields
        const [newGroup] = await tx
          .insert(discussionGroups)
          .values({
            name,
            videoId,
            creatorId: userId,
            createdAt: new Date(),
            inviteCode,
            isPrivate: false,
            isDeleted: false
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
            notificationsEnabled: true,
            emailNotifications: false,
            unreadCount: 0,
            lastReadAt: new Date()
          });

        return [newGroup];
      });

      // Return the created group with member details
      const groupWithDetails = await db.query.discussionGroups.findFirst({
        where: eq(discussionGroups.id, group.id),
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

      res.status(201).json(groupWithDetails);
    } catch (error) {
      console.error('Error creating group:', error);
      res.status(500).json({ 
        message: "Failed to create group",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Consolidated message handling endpoint
  app.post("/api/messages", requireAuth, async (req: Request, res: Response) => {
    try {
      const { groupId, content } = req.body;
      const userId = req.user?.id;

      if (!userId || !groupId || !content) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Add message to database
      const [message] = await db.insert(groupMessages)
        .values({
          groupId,
          userId,
          content,
          createdAt: new Date()
        })
        .returning();

      // Get complete message with user details
      const messageWithDetails = await db.query.groupMessages.findFirst({
        where: eq(groupMessages.id, message.id),
        with: {
          user: {
            columns: {
              username: true
            }
          }
        }
      });

      res.status(201).json(messageWithDetails);
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({
        message: "Failed to send message",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get messages endpoint
  app.get("/api/messages", requireAuth, async (req: Request, res: Response) => {
    try {
      const groupId = parseInt(req.query.groupId as string);

      if (isNaN(groupId)) {
        return res.status(400).json({ message: "Invalid group ID" });
      }

    const messages = await db.query.groupMessages.findMany({
      where: eq(groupMessages.groupId, groupId),
      orderBy: [desc(groupMessages.createdAt)],
      with: {
        user: {
          columns: {
            username: true
          }
        }
      }
    });

    // Return messages in chronological order
    res.json(messages.reverse());
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      message: "Error fetching messages",
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
          },
          messages: {
            with: {
              user: {
                columns: {
                  username: true
                }
              }
            },
            orderBy: [desc(groupMessages.createdAt)]
          }
        }
      });

      if (!group) {
        return res.status(404).json({ message: "Group not found" });
      }

      console.log('Found group with', group.messages?.length || 0, 'messages');

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

      // Sort messages in chronological order
      if (group.messages) {
        group.messages = group.messages.reverse();
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
  app.get("/api/preferences", requireAuth, async (req: any, res: any) => {
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

  app.post("/api/preferences", requireAuth, async (req: any, res: any) => {
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
            gt(groupMessages.createdAt, member.lastReadAt!)
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

  return httpServer;
}