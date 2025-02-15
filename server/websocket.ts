import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { db } from "@db";
import { eq } from "drizzle-orm";
import { groupMessages, groupMembers } from "@db/schema";
import cookie from 'cookie';

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
        cookies: request.headers.cookie,
        protocol: request.headers['sec-websocket-protocol'],
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
      if (pathname !== '/ws') {
        console.log('[WebSocket] Invalid path:', pathname);
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      // Parse cookies and extract session ID
      if (!request.headers.cookie) {
        console.log('[WebSocket] No cookies present in request');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const cookies = cookie.parse(request.headers.cookie);
      const sessionId = cookies['connect.sid'];

      if (!sessionId) {
        console.log('[WebSocket] No session ID found in cookies');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      console.log('[WebSocket] Found session ID:', sessionId);

      // Extract the raw session ID
      const rawSessionId = sessionId.split('.')[0].replace('s:', '');
      console.log('[WebSocket] Extracted raw session ID:', rawSessionId);

      try {
        // Get session from store
        const session = await new Promise<Session | null>((resolve, reject) => {
          sessionMiddleware.store.get(rawSessionId, (err: any, session: Session | null) => {
            if (err) {
              console.error('[WebSocket] Session retrieval error:', err);
              reject(err);
            } else {
              console.log('[WebSocket] Retrieved session:', {
                hasSession: !!session,
                hasPassport: !!session?.passport,
                hasUser: !!session?.passport?.user,
                timestamp: new Date().toISOString()
              });
              resolve(session);
            }
          });
        });

        if (!session?.passport?.user) {
          console.log('[WebSocket] No user ID in session');
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        const userId = session.passport.user;
        console.log('[WebSocket] Authenticated user:', userId);

        // Close existing connection if any
        const existingConnection = connectedClients.get(userId);
        if (existingConnection) {
          if (existingConnection.readyState === WebSocket.OPEN) {
            console.log('[WebSocket] Closing existing connection for user:', userId);
            existingConnection.close(1000, 'New connection received');
          }
          connectedClients.delete(userId);
        }

        // Handle the upgrade
        wss.handleUpgrade(request, socket, head, (ws) => {
          console.log('[WebSocket] Connection upgraded successfully for user:', userId);

          // Set a ping interval to keep the connection alive
          const pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.ping();
            } else {
              clearInterval(pingInterval);
            }
          }, 30000);

          // Handle pong responses
          ws.on('pong', () => {
            console.log('[WebSocket] Received pong from user:', userId);
          });

          // Send initial connection success message
          ws.send(JSON.stringify({
            type: 'connected',
            message: 'Connected to chat server',
            userId: userId,
            timestamp: new Date().toISOString()
          }));

          connectedClients.set(userId, ws);
          wss.emit('connection', ws, userId);
        });

      } catch (error) {
        console.error('[WebSocket] Session validation error:', error);
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
      }

    } catch (error) {
      console.error('[WebSocket] Upgrade error:', error);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  });

  // Handle connections
  wss.on('connection', (ws: WebSocket, userId: number) => {
    console.log('[WebSocket] New connection established for user:', userId);

    // Handle messages
    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('[WebSocket] Received message:', {
          userId,
          messageType: message.type,
          timestamp: new Date().toISOString()
        });

        if (!message.type || message.type !== 'group_message') {
          throw new Error('Invalid message type');
        }

        const { groupId, content } = message;
        if (!groupId || !content) {
          throw new Error('Invalid message format');
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

        // Get group members for broadcasting
        const members = await db.query.groupMembers.findMany({
          where: eq(groupMembers.groupId, groupId),
          with: {
            user: true
          }
        });

        // Broadcast to all members
        const broadcastMessage = {
          type: 'new_group_message',
          data: {
            ...savedMessage,
            user: members.find(m => m.userId === userId)?.user
          }
        };

        console.log('[WebSocket] Broadcasting message to members:', {
          messageId: savedMessage.id,
          groupId,
          recipientCount: members.length
        });

        members.forEach(member => {
          const client = connectedClients.get(member.userId);
          if (client?.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(broadcastMessage));
          }
        });

      } catch (error) {
        console.error('[WebSocket] Message handling error:', error);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'error',
            message: error instanceof Error ? error.message : 'Failed to process message',
            timestamp: new Date().toISOString()
          }));
        }
      }
    });

    // Handle connection close
    ws.on('close', (code: number, reason: string) => {
      console.log('[WebSocket] Connection closed for user:', {
        userId,
        code,
        reason: reason.toString(),
        timestamp: new Date().toISOString()
      });
      if (connectedClients.get(userId) === ws) {
        connectedClients.delete(userId);
      }
    });

    // Handle errors
    ws.on('error', (error: Error) => {
      console.error('[WebSocket] Connection error for user:', {
        userId,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      if (connectedClients.get(userId) === ws) {
        connectedClients.delete(userId);
      }
    });
  });

  return wss;
}