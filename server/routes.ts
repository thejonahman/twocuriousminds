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

export function registerRoutes(app: express.Application): Server {
  const httpServer = createServer(app);

  // Setup auth
  setupAuth(app);

  // Setup session store
  const sessionStore = new (pgSession(session))({
    conObject: {
      connectionString: process.env.DATABASE_URL,
    },
    createTableIfMissing: true,
  });

  // Session middleware
  const sessionMiddleware = session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000
    },
  });

  app.use(sessionMiddleware);
  app.use(express.json());

  // Basic WebSocket setup
  const wss = new WebSocketServer({ 
    server: httpServer,
    path: '/ws'
  });

  // Simple connection handler
  wss.on('connection', (ws, req: any) => {
    const userId = req.session?.passport?.user?.id;

    if (!userId) {
      ws.close(1008, 'Unauthorized');
      return;
    }

    connectedClients.set(userId, ws);
    console.log('WebSocket connected for user:', userId);

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'message') {
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
        }
      } catch (error) {
        console.error('Message handling error:', error);
      }
    });

    ws.on('close', () => {
      connectedClients.delete(userId);
    });

    ws.on('error', () => {
      connectedClients.delete(userId);
    });
  });

  // Messages endpoint
  app.get("/api/messages", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

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