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
        console.log('[WebSocket] No cookies present');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const cookies = cookie.parse(request.headers.cookie);
      const sessionId = cookies['connect.sid'];

      if (!sessionId) {
        console.log('[WebSocket] No session ID found');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      // Extract the raw session ID
      const rawSessionId = sessionId.split('.')[0].replace('s:', '');

      try {
        // Get session from store
        const session = await new Promise<Session | null>((resolve, reject) => {
          sessionMiddleware.store.get(rawSessionId, (err: any, session: Session | null) => {
            if (err) reject(err);
            else resolve(session);
          });
        });

        if (!session?.passport?.user) {
          console.log('[WebSocket] No user ID in session');
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        const userId = session.passport.user;

        // Close existing connection if any
        const existingConnection = connectedClients.get(userId);
        if (existingConnection?.readyState === WebSocket.OPEN) {
          existingConnection.close();
          connectedClients.delete(userId);
        }

        // Handle the upgrade
        wss.handleUpgrade(request, socket, head, (ws) => {
          console.log('[WebSocket] Connection upgraded for user:', userId);
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

    // Send connected message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to chat server'
    }));

    // Handle messages
    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('[WebSocket] Received message:', message);

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

        for (const member of members) {
          const client = connectedClients.get(member.userId);
          if (client?.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(broadcastMessage));
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

    // Handle connection close
    ws.on('close', () => {
      console.log('[WebSocket] Connection closed for user:', userId);
      if (connectedClients.get(userId) === ws) {
        connectedClients.delete(userId);
      }
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('[WebSocket] Connection error for user:', userId, error);
      if (connectedClients.get(userId) === ws) {
        connectedClients.delete(userId);
      }
    });
  });

  return wss;
}