import { createServer, type Server } from "http";
import express, { type Express } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { db } from "@db";
import { sql, eq, and, desc } from "drizzle-orm";
import multer from 'multer';
import { videos, messages, users, discussionGroups, groupMessages, groupMembers } from "@db/schema";
import { setupAuth } from "./auth";
import { nanoid } from 'nanoid';

// Store active WebSocket connections
const connectedClients = new Map<number, WebSocket>();

export function registerRoutes(app: Express): Server {
  const httpServer = createServer(app);

  // Setup auth and get session middleware
  const sessionMiddleware = setupAuth(app);

  // Setup WebSocket server
  const wss = new WebSocketServer({ 
    server: httpServer,
    path: '/ws'
  });

  // Upgrade session handling for WebSocket
  httpServer.on('upgrade', function (request, socket, head) {
    const res = {} as any;
    res.end = () => {};

    // Apply session middleware
    sessionMiddleware(request as any, res, () => {
      if (!request.session?.passport?.user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      // Only handle WebSocket upgrades for our path
      if (request.url?.startsWith('/ws')) {
        wss.handleUpgrade(request, socket, head, function (ws) {
          wss.emit('connection', ws, request);
        });
      }
    });
  });

  // Handle WebSocket connections
  wss.on('connection', (ws, req: any) => {
    console.log('WebSocket connection attempt');

    // Get user ID from session
    if (!req.session?.passport?.user) {
      console.log('WebSocket - No authenticated user');
      ws.close(1008, 'Unauthorized');
      return;
    }

    const userId = req.session.passport.user;
    console.log('WebSocket connected for user:', userId);

    connectedClients.set(userId, ws);

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('Received message:', message);

        switch (message.type) {
          case 'message':
            const { videoId, content } = message;
            // Save message
            const [savedMessage] = await db.insert(messages)
              .values({
                videoId,
                userId,
                content
              })
              .returning();

            // Get username
            const user = await db.query.users.findFirst({
              where: eq(users.id, userId),
              columns: {
                username: true
              }
            });

            // Broadcast
            const broadcastMessage = {
              type: 'new_message',
              data: {
                ...savedMessage,
                user: { username: user?.username }
              }
            };

            connectedClients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(broadcastMessage));
              }
            });
            break;

          case 'create_group':
            const { name, description = '', videoId: groupVideoId } = message;
            // Generate unique invite code
            const inviteCode = nanoid(10);

            // Create group
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

          case 'join_group':
            const { inviteCode: joinCode } = message;

            // Find group
            const groupToJoin = await db.query.discussionGroups.findFirst({
              where: eq(discussionGroups.inviteCode, joinCode)
            });

            if (!groupToJoin) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid invite code'
              }));
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

            ws.send(JSON.stringify({
              type: 'group_joined',
              data: groupToJoin
            }));
            break;

          case 'group_message':
            const { groupId, content: groupContent } = message;

            // Save group message
            const [savedGroupMessage] = await db.insert(groupMessages)
              .values({
                groupId,
                userId,
                content: groupContent
              })
              .returning();

            // Get sender info
            const sender = await db.query.users.findFirst({
              where: eq(users.id, userId),
              columns: {
                username: true
              }
            });

            // Get group members
            const members = await db.query.groupMembers.findMany({
              where: eq(groupMembers.groupId, groupId),
              columns: {
                userId: true
              }
            });

            // Broadcast to group members
            const groupBroadcastMessage = {
              type: 'new_group_message',
              data: {
                ...savedGroupMessage,
                user: { username: sender?.username }
              }
            };

            members.forEach(member => {
              const client = connectedClients.get(member.userId);
              if (client?.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(groupBroadcastMessage));
              }
            });
            break;
        }
      } catch (error) {
        console.error('Message handling error:', error);
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

  // Protected endpoints - require authentication
  const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ message: "Not authenticated" });
  };

  // Messages endpoint
  app.get("/api/messages", requireAuth, async (req, res) => {
    try {
      const videoId = parseInt(req.query.videoId as string);
      if (!videoId) {
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

      res.json(messagesList);
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ 
        message: "Database error occurred",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  return httpServer;
}