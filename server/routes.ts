import { createServer, type Server } from "http";
import express, { type Express } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { db } from "@db";
import { sql, eq, and, desc } from "drizzle-orm";
import { messages, users, discussionGroups, groupMessages, groupMembers, videos, categories } from "@db/schema";
import { setupAuth } from "./auth";
import { nanoid } from 'nanoid';
import type { Session } from 'express-session';

// Store active socket connections
const connectedClients = new Map<number, WebSocket>();

// Define requireAuth middleware
const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.session?.passport?.user) {
    return next();
  }
  res.status(401).json({ message: "Not authenticated" });
};

export function registerRoutes(app: Express): Server {
  // Create HTTP server first
  const server = createServer(app);

  // Initialize WebSocket server with specific path
  const wss = new WebSocketServer({ 
    server,
    path: '/ws', // Different from Vite's HMR path
    verifyClient: ({ req }) => {
      const protocol = req.headers['sec-websocket-protocol'];
      return protocol !== 'vite-hmr';
    }
  });

  // WebSocket connection handler
  wss.on('connection', async (ws, req) => {
    console.log('WebSocket connection attempt');

    // Get user ID from session
    const session = (req as any).session;
    const userId = session?.passport?.user;

    if (!userId) {
      console.log('WebSocket - No authenticated user');
      ws.close(1008, 'Authentication required');
      return;
    }

    console.log('WebSocket connected for user:', userId);
    connectedClients.set(userId, ws);

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'system',
      message: 'Connected to chat server'
    }));

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('Received message:', message);

        switch (message.type) {
          case 'message':
            const { videoId, content } = message;
            console.log('Processing video message:', { videoId, content });

            try {
              // Save message with optimized query
              const [savedMessage] = await db.insert(messages)
                .values({
                  videoId,
                  userId,
                  content
                })
                .returning();

              // Get username efficiently
              const user = await db.query.users.findFirst({
                where: eq(users.id, userId),
                columns: {
                  username: true
                }
              });

              const broadcastMessage = {
                type: 'new_message',
                data: {
                  ...savedMessage,
                  user: { username: user?.username }
                }
              };

              // Broadcast to all connected clients
              wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify(broadcastMessage));
                }
              });
            } catch (error) {
              console.error('Error saving message:', error);
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to save message'
              }));
            }
            break;
          case 'create_group':
            const { name, description = '', videoId: groupVideoId } = message;
            const inviteCode = nanoid(10);
            console.log('Creating group:', { name, description, groupVideoId });

            // Create group with optimized query
            const [group] = await db.insert(discussionGroups)
              .values({
                name,
                description,
                videoId: groupVideoId,
                creatorId: userId,
                isPrivate: true,
                inviteCode
              })
              .returning();

            // Add creator as member
            await db.insert(groupMembers)
              .values({
                groupId: group.id,
                userId,
                role: 'admin'
              });

            ws.send(JSON.stringify({
              type: 'group_created',
              data: {
                ...group,
                inviteCode
              }
            }));
            break;
          case 'group_message':
            const { groupId, content: groupContent } = message;
            console.log('Processing group message:', { groupId, content: groupContent });

            // Save group message with optimized query
            const [savedGroupMessage] = await db.insert(groupMessages)
              .values({
                groupId,
                userId,
                content: groupContent
              })
              .returning();

            // Get sender info efficiently
            const sender = await db.query.users.findFirst({
              where: eq(users.id, userId),
              columns: {
                username: true
              }
            });

            // Get group members efficiently and update unread counts
            const members = await db.query.groupMembers.findMany({
              where: eq(groupMembers.groupId, groupId)
            });

            // Update unread count for other members
            await Promise.all(
              members
                .filter(member => member.userId !== userId)
                .map(member =>
                  db
                    .update(groupMembers)
                    .set({
                      unreadCount: sql`${groupMembers.unreadCount} + 1`
                    })
                    .where(
                      and(
                        eq(groupMembers.groupId, groupId),
                        eq(groupMembers.userId, member.userId)
                      )
                    )
                )
            );

            const groupMessage = {
              type: 'new_group_message',
              data: {
                ...savedGroupMessage,
                user: {
                  username: sender?.username
                }
              }
            };

            // Broadcast to all members of the group
            members.forEach(member => {
              const memberSocket = connectedClients.get(member.userId);
              if (memberSocket && memberSocket.readyState === WebSocket.OPEN) {
                memberSocket.send(JSON.stringify(groupMessage));
              }
            });
            break;
          case 'join_group':
            const { inviteCode: joinCode, videoId: joinVideoId } = message;
            console.log('Join group request received:', { joinCode, joinVideoId });

            // Find group
            const groupToJoin = await db.query.discussionGroups.findFirst({
              where: eq(discussionGroups.inviteCode, joinCode)
            });

            if (!groupToJoin) {
              console.log('Group not found for invite code:', joinCode);
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid invite code' }));
              return;
            }

            // Verify videoId matches if provided
            if (joinVideoId && groupToJoin.videoId !== joinVideoId) {
              console.log('Video ID mismatch:', { expected: groupToJoin.videoId, received: joinVideoId });
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid video for this group' }));
              return;
            }

            // Check if already a member
            const existingMember = await db.query.groupMembers.findFirst({
              where: and(
                eq(groupMembers.groupId, groupToJoin.id),
                eq(groupMembers.userId, userId)
              )
            });

            if (!existingMember) {
              // Add as member
              await db.insert(groupMembers)
                .values({
                  groupId: groupToJoin.id,
                  userId,
                  role: 'member'
                });
            }

            // Get full group details to send back
            const fullGroupDetails = {
              ...groupToJoin,
              members: await db.query.groupMembers.findMany({
                where: eq(groupMembers.groupId, groupToJoin.id),
                with: {
                  user: {
                    columns: {
                      username: true
                    }
                  }
                }
              })
            };

            console.log('User joined group successfully:', groupToJoin.id);
            ws.send(JSON.stringify({ type: 'group_joined', data: fullGroupDetails }));
            break;
        }
      } catch (error) {
        console.error('Message handling error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Failed to process message'
        }));
      }
    });

    ws.on('close', () => {
      console.log('WebSocket disconnected for user:', userId);
      connectedClients.delete(userId);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      connectedClients.delete(userId);
    });
  });

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
      if (error instanceof Error) {
        res.status(500).json({
          message: "Error fetching videos",
          error: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      } else {
        res.status(500).json({
          message: "Unknown error occurred while fetching videos"
        });
      }
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

  // Messages endpoint
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

  // Add group messages endpoint
  app.get("/api/group-messages", requireAuth, async (req, res) => {
    try {
      const groupId = parseInt(req.query.groupId as string);
      if (isNaN(groupId)) {
        return res.status(400).json({ message: "Group ID is required" });
      }

      console.log('Fetching messages for group:', groupId);

      // First verify user is a member of the group
      const member = await db.query.groupMembers.findFirst({
        where: and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, req.user!.id)
        )
      });

      if (!member) {
        return res.status(403).json({ message: "Not a member of this group" });
      }

      // Fetch messages with user details, ordered by creation time
      const messagesList = await db.query.groupMessages.findMany({
        where: eq(groupMessages.groupId, groupId),
        orderBy: [desc(groupMessages.createdAt)],
        with: {
          user: {
            columns: {
              username: true
            }
          },
          group: true
        }
      });

      console.log(`Retrieved ${messagesList.length} messages for group ${groupId}`);

      // Return messages in chronological order (oldest first)
      res.json(messagesList.reverse());
    } catch (error) {
      console.error('Error fetching group messages:', error);
      res.status(500).json({
        message: "Database error occurred",
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