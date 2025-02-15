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
    server: httpServer,
    path: '/ws'
  });

  console.log('[WebSocket] Server created with path: /ws');

  // Handle connections
  wss.on('connection', async (ws: WebSocket, request: any) => {
    try {
      console.log('[WebSocket] New connection attempt');

      // Skip Vite HMR connections
      if (request.headers['sec-websocket-protocol']?.includes('vite-hmr')) {
        console.log('[WebSocket] Ignoring Vite HMR connection');
        return;
      }

      if (!request.headers.cookie) {
        console.error('[WebSocket] No cookie found');
        ws.close(4001, 'No session cookie');
        return;
      }

      const cookies = cookie.parse(request.headers.cookie);
      const sessionCookie = cookies['connect.sid'];
      if (!sessionCookie) {
        console.error('[WebSocket] No session cookie found');
        ws.close(4001, 'Invalid session');
        return;
      }

      // Extract session ID from cookie
      const sessionId = sessionCookie.split('.')[0].replace('s:', '');
      console.log('[WebSocket] Processing session:', { sessionId });

      const session = await new Promise<Session | null>((resolve, reject) => {
        sessionMiddleware.store.get(sessionId, (err: any, session: Session | null) => {
          if (err) {
            console.error('[WebSocket] Session error:', err);
            reject(err);
          } else {
            console.log('[WebSocket] Session retrieved:', {
              hasSession: !!session,
              hasUser: session?.passport?.user
            });
            resolve(session);
          }
        });
      });

      if (!session?.passport?.user) {
        console.error('[WebSocket] Invalid session or no user');
        ws.close(4001, 'Invalid session');
        return;
      }

      const userId = session.passport.user;
      console.log('[WebSocket] Connection established for user:', userId);

      // Store the connection
      connectedClients.set(userId, ws);

      // Setup ping/pong
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);

      ws.on('close', () => {
        console.log('[WebSocket] Connection closed for user:', userId);
        clearInterval(pingInterval);
        if (connectedClients.get(userId) === ws) {
          connectedClients.delete(userId);
        }
      });

      // Handle messages
      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('[WebSocket] Received message:', {
            type: message.type,
            userId,
            timestamp: new Date().toISOString()
          });

          if (message.type === 'group_message') {
            const { groupId, content } = message;

            const [savedMessage] = await db.insert(groupMessages)
              .values({
                groupId,
                userId,
                content,
                createdAt: new Date(),
                updatedAt: new Date()
              })
              .returning();

            const members = await db.query.groupMembers.findMany({
              where: eq(groupMembers.groupId, groupId),
              with: {
                user: true
              }
            });

            members.forEach(member => {
              const client = connectedClients.get(member.userId);
              if (client?.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'new_group_message',
                  data: {
                    ...savedMessage,
                    user: members.find(m => m.userId === userId)?.user
                  }
                }));
              }
            });
          }
        } catch (error) {
          console.error('[WebSocket] Message handling error:', error);
        }
      });

      // Send initial connection message
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to chat server',
        userId
      }));

    } catch (error) {
      console.error('[WebSocket] Connection error:', error);
      ws.close(1011, 'Internal server error');
    }
  });

  return wss;
}