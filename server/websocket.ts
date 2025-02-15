import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { db } from "@db";
import { eq } from "drizzle-orm";
import { groupMessages, groupMembers } from "@db/schema";
import cookie from 'cookie';

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
    path: '/ws/chat'
  });

  // Handle upgrade requests
  httpServer.on('upgrade', async (request: any, socket, head) => {
    try {
      // Special handling for Vite HMR connections
      if (request.headers['sec-websocket-protocol']?.includes('vite-hmr')) {
        return; // Let Vite handle its own upgrade
      }

      const url = new URL(request.url, `http://${request.headers.host}`);
      if (url.pathname !== '/ws/chat') {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      // Authorization check
      if (!request.headers.cookie) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const cookies = cookie.parse(request.headers.cookie);
      const sessionId = cookies['connect.sid'];

      if (!sessionId) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const rawSessionId = sessionId.split('.')[0].replace('s:', '');

      try {
        const session = await new Promise<Session | null>((resolve, reject) => {
          sessionMiddleware.store.get(rawSessionId, (err: any, session: Session | null) => {
            if (err) reject(err);
            else resolve(session);
          });
        });

        if (!session?.passport?.user) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        const userId = session.passport.user;

        // Close existing connection if any
        const existingConnection = connectedClients.get(userId);
        if (existingConnection?.readyState === WebSocket.OPEN) {
          existingConnection.close(1000, 'New connection received');
          connectedClients.delete(userId);
        }

        // Handle the upgrade
        wss.handleUpgrade(request, socket, head, (ws) => {
          console.log('[WebSocket] Connection upgraded for user:', userId);

          // Ping interval for keep-alive
          const pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.ping();
            } else {
              clearInterval(pingInterval);
            }
          }, 30000);

          ws.on('pong', () => {
            // Keep-alive response received
          });

          ws.on('close', () => {
            clearInterval(pingInterval);
            if (connectedClients.get(userId) === ws) {
              connectedClients.delete(userId);
            }
          });

          // Send connection confirmation
          ws.send(JSON.stringify({
            type: 'connected',
            message: 'Connected to chat server',
            userId,
            timestamp: new Date().toISOString()
          }));

          // Store the connection
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

  // Handle messages
  wss.on('connection', (ws: WebSocket, userId: number) => {
    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        if (!message.type || message.type !== 'group_message') {
          throw new Error('Invalid message type');
        }

        const { groupId, content } = message;
        if (!groupId || !content) {
          throw new Error('Invalid message format');
        }

        // Save and broadcast message
        const [savedMessage] = await db.insert(groupMessages)
          .values({
            groupId,
            userId,
            content,
            createdAt: new Date(),
            updatedAt: new Date()
          })
          .returning();

        // Get group members
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
            message: error instanceof Error ? error.message : 'Failed to process message'
          }));
        }
      }
    });

    ws.on('error', (error: Error) => {
      console.error('[WebSocket] Connection error:', {
        userId,
        error: error.message,
        stack: error.stack
      });
    });
  });

  return wss;
}