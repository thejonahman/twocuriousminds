import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { db } from "@db";
import { eq, desc, and, gt, sql } from "drizzle-orm";
import { groupMessages, groupMembers, discussionGroups, users } from "@db/schema";
import cookie from 'cookie';
import { sendUnreadMessagesNotification } from './lib/email';

// Define session type to include passport
interface Session {
  passport?: {
    user?: number;
  };
}

// Store active WebSocket connections
const connectedClients = new Map<number, WebSocket>();

export function setupWebSocketServer(httpServer: Server, sessionMiddleware: any) {
  console.log('[WebSocket] Setting up WebSocket server');

  const wss = new WebSocketServer({ 
    noServer: true,
    path: '/ws'
  });

  // Handle upgrade requests
  httpServer.on('upgrade', async (request: any, socket, head) => {
    try {
      console.log('[WebSocket] Received upgrade request:', {
        path: request.url,
        headers: request.headers,
        timestamp: new Date().toISOString()
      });

      // Ignore vite-hmr websocket connections
      if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
        console.log('[WebSocket] Ignoring vite-hmr connection');
        socket.destroy();
        return;
      }

      // Verify path is /ws
      const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
      console.log('[WebSocket] Processing upgrade for path:', pathname);

      if (pathname !== '/ws') {
        console.log('[WebSocket] Invalid path:', pathname);
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      // Parse cookies and extract session ID
      if (!request.headers.cookie) {
        console.log('[WebSocket] No cookies present');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const cookies = cookie.parse(request.headers.cookie);
      const sessionId = cookies['connect.sid'];

      console.log('[WebSocket] Session details:', {
        hasCookies: !!request.headers.cookie,
        hasSessionId: !!sessionId,
        timestamp: new Date().toISOString()
      });

      if (!sessionId) {
        console.log('[WebSocket] No session ID found');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      // Extract the raw session ID
      const rawSessionId = sessionId.split('.')[0].replace('s:', '');

      try {
        // Get session from store with proper typing and error handling
        const session = await new Promise<Session | null>((resolve, reject) => {
          sessionMiddleware.store.get(rawSessionId, (err: any, session: Session | null) => {
            if (err) {
              console.error('[WebSocket] Session store error:', err);
              reject(err);
            } else {
              resolve(session);
            }
          });
        });

        console.log('[WebSocket] Session retrieved:', {
          hasSession: !!session,
          hasUser: !!session?.passport?.user,
          timestamp: new Date().toISOString()
        });

        if (!session?.passport?.user) {
          console.log('[WebSocket] No user ID in session');
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        const userId = session.passport.user;
        console.log('[WebSocket] Upgrading connection for user:', userId);

        // Clean up any existing connection for this user
        const existingConnection = connectedClients.get(userId);
        if (existingConnection?.readyState === WebSocket.OPEN) {
          console.log('[WebSocket] Closing existing connection for user:', userId);
          existingConnection.close();
        }

        // Handle the upgrade
        wss.handleUpgrade(request, socket, head, (ws) => {
          console.log('[WebSocket] Connection upgraded successfully for user:', userId);
          connectedClients.set(userId, ws);
          wss.emit('connection', ws, userId);
        });

      } catch (error) {
        console.error('[WebSocket] Session validation error:', error);
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
        return;
      }

    } catch (error) {
      console.error('[WebSocket] Upgrade error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  });

  // Handle connections
  wss.on('connection', (ws: WebSocket, userId: number) => {
    console.log('[WebSocket] New connection established for user:', userId);

    // Send connected message
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to chat server'
      }));
    }

    // Handle messages
    ws.on('message', async (data: Buffer) => {
      let parsedMessage;

      try {
        parsedMessage = JSON.parse(data.toString());
        console.log('[WebSocket] Received message:', parsedMessage);

        if (!parsedMessage.type) {
          throw new Error('Message type is required');
        }

        if (parsedMessage.type === 'group_message') {
          const { groupId, content } = parsedMessage;

          if (!groupId || !content) {
            throw new Error('Group message must include groupId and content');
          }

          // Save message to database
          const [savedMessage] = await db.insert(groupMessages)
            .values({
              groupId,
              userId,
              content,
              createdAt: new Date(),
              updatedAt: new Date()
            })
            .returning();

          console.log('[WebSocket] Saved message:', savedMessage);

          // Get members and update unread counts
          const members = await db.query.groupMembers.findMany({
            where: eq(groupMembers.groupId, groupId),
            with: {
              user: true
            }
          });

          // Broadcast message to all members
          const broadcastMessage = {
            type: 'new_group_message',
            data: {
              ...savedMessage,
              user: members.find(m => m.userId === userId)?.user
            }
          };

          console.log('[WebSocket] Broadcasting to members:', members.length);
          for (const member of members) {
            const client = connectedClients.get(member.userId);
            if (client?.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(broadcastMessage));
            }
          }
        }
      } catch (error) {
        console.error('[WebSocket] Message handling error:', error);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'error',
            message: error instanceof Error ? error.message : 'Failed to process message'
          }));
        }
      }
    });

    ws.on('close', () => {
      console.log('[WebSocket] Connection closed for user:', userId);
      if (connectedClients.get(userId) === ws) {
        connectedClients.delete(userId);
      }
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] Connection error for user:', userId, error);
      if (connectedClients.get(userId) === ws) {
        connectedClients.delete(userId);
      }
    });
  });

  console.log('[WebSocket] Server setup complete');
  return wss;
}