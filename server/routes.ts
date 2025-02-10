import { createServer, type Server } from "http";
import express, { type Express, type Request, type Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { db, pool } from "@db"; // Assuming db now exports pool
import { sql, eq, and, desc } from "drizzle-orm";
import multer from 'multer';
import { videos, messages, users, discussionGroups, groupMessages, groupMembers, categories, userPreferences } from "@db/schema";
import { setupAuth } from "./auth";
import { nanoid } from 'nanoid';
import type { Session } from 'express-session';

// Fix type declaration for session in request
declare module 'http' {
  interface IncomingMessage {
    session?: Session & {
      passport?: {
        user?: number;
      };
    };
  }
}

// Store active WebSocket connections
const connectedClients = new Map<number, WebSocket>();

// Store prepared statements
const preparedStatements = {
  insertMessage: 'INSERT INTO messages (video_id, user_id, content) VALUES ($1, $2, $3) RETURNING *',
  insertGroupMessage: 'INSERT INTO group_messages (group_id, user_id, content) VALUES ($1, $2, $3) RETURNING *',
  createGroup: `
    INSERT INTO discussion_groups (name, description, video_id, creator_id, is_private, invite_code)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `,
  addGroupMember: 'INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3)'
};

// Initialize prepared statements
pool.on('connect', (client) => {
  Object.entries(preparedStatements).forEach(([name, text]) => {
    client.query({
      name,
      text
    }).catch(err => console.error(`Failed to prepare statement ${name}:`, err));
  });
});

export function registerRoutes(app: Express): Server {
  const httpServer = createServer(app);

  // Setup auth and get session middleware
  const sessionMiddleware = setupAuth(app);

  // Setup WebSocket server
  const wss = new WebSocketServer({ 
    server: httpServer,
    path: '/ws',
    verifyClient: (info, callback) => {
      // Create a fake res object since session middleware expects it
      const res: any = {
        writeHead: () => {},
        setHeader: () => {},
        end: () => {}
      };

      // Apply session middleware
      sessionMiddleware(info.req as Request, res as Response, () => {
        // Check if user is authenticated through session
        const isAuthenticated = info.req.session?.passport?.user != null;
        if (isAuthenticated) {
          callback(true);
        } else {
          callback(false, 401, 'Unauthorized');
        }
      });
    }
  });

  // Handle WebSocket connections
  wss.on('connection', (ws, req: any) => {
    console.log('WebSocket connection attempt');

    // Get user ID from session
    const userId = req.session?.passport?.user;
    if (!userId) {
      console.log('WebSocket - No authenticated user');
      ws.close(1008, 'Unauthorized');
      return;
    }

    console.log('WebSocket connected for user:', userId);
    connectedClients.set(userId, ws);

    ws.onmessage = async (event) => {
      try {
        const rawData = event.data.toString();
        console.log('Raw WebSocket data received:', rawData);
        const message = JSON.parse(rawData);
        console.log('Received message:', message);

        switch (message.type) {
          case 'message':
            const { videoId, content } = message;
            console.log('Processing video message:', { videoId, content });

            // Use prepared statement for better performance
            const [savedMessage] = await db.execute(
              sql.raw(preparedStatements.insertMessage),
              [videoId, userId, content]
            );

            // Get username efficiently with a prepared statement
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

            console.log('Broadcasting message:', broadcastMessage);

            // Efficient broadcasting using Set for active connections
            const activeClients = new Set(Array.from(connectedClients.values())
              .filter(client => client.readyState === WebSocket.OPEN));

            activeClients.forEach(client => {
              client.send(JSON.stringify(broadcastMessage));
            });
            break;

          case 'create_group':
            const { name, description = '', videoId: groupVideoId } = message;
            const inviteCode = nanoid(10);
            console.log('Creating group:', { name, description, groupVideoId });

            // Use transaction for atomic group creation
            const client = await pool.connect();
            try {
              await client.query('BEGIN');

              // Create group using prepared statement
              const [group] = await db.execute(
                sql.raw(preparedStatements.createGroup),
                [name, description, groupVideoId, userId, true, inviteCode]
              );

              // Add creator as member using prepared statement
              await db.execute(
                sql.raw(preparedStatements.addGroupMember),
                [group.id, userId, 'admin']
              );

              await client.query('COMMIT');

              const groupResponse = {
                ...group,
                inviteCode
              };

              ws.send(JSON.stringify({
                type: 'group_created',
                data: groupResponse
              }));
            } catch (error) {
              await client.query('ROLLBACK');
              throw error;
            } finally {
              client.release();
            }
            break;

          case 'group_message':
            const { groupId, content: groupContent } = message;
            console.log('Processing group message:', { groupId, content: groupContent });

            // Use prepared statement for group message
            const [savedGroupMessage] = await db.execute(
              sql.raw(preparedStatements.insertGroupMessage),
              [groupId, userId, groupContent]
            );

            console.log('Saved group message:', savedGroupMessage);

            // Get sender info efficiently
            const sender = await db.query.users.findFirst({
              where: eq(users.id, userId),
              columns: {
                username: true
              }
            });

            // Get group members efficiently with a single query
            const members = await db.query.groupMembers.findMany({
              where: eq(groupMembers.groupId, groupId),
              columns: {
                userId: true
              }
            });

            const groupBroadcastMessage = {
              type: 'new_group_message',
              data: {
                ...savedGroupMessage,
                user: {
                  username: sender?.username
                }
              }
            };

            // Efficient broadcasting to group members
            const memberIds = new Set(members.map(m => m.userId));
            for (const [clientUserId, client] of connectedClients.entries()) {
              if (memberIds.has(clientUserId) && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(groupBroadcastMessage));
              }
            }
            break;
          case 'join_group':
            const { inviteCode: joinCode } = message;
            console.log('Join group request received:', joinCode);

            // Find group
            const groupToJoin = await db.query.discussionGroups.findFirst({
              where: eq(discussionGroups.inviteCode, joinCode)
            });

            if (!groupToJoin) {
              console.log('Group not found for invite code:', joinCode);
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

            console.log('User joined group successfully:', groupToJoin.id);
            ws.send(JSON.stringify({
              type: 'group_joined',
              data: groupToJoin
            }));
            break;
        }
      } catch (error) {
        console.error('Message handling error:', error);
        if (error instanceof Error) {
          console.error('Error details:', error.message);
        }
      }
    };

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

      res.json(messagesList.reverse());
    } catch (error) {
      console.error('Error fetching group messages:', error);
      res.status(500).json({ 
        message: "Database error occurred",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Preferences endpoints
  app.get("/api/preferences", requireAuth, async (req: Request, res: Response) => {
    try {
      const preferences = await db.query.userPreferences.findFirst({
        where: eq(userPreferences.userId, req.user!.id)
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
          target: userPreferences.userId,
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

  return httpServer;
}