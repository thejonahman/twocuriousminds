import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { db } from "@db";
import { eq } from "drizzle-orm";
import { groupMessages, groupMembers, users } from "@db/schema";
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
    path: '/ws'
  });

  // Handle upgrade requests
  httpServer.on('upgrade', async (request: any, socket, head) => {
    try {
      // Ignore vite-hmr websocket connections
      if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
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

      // Get session ID from cookie
      const cookies = cookie.parse(request.headers.cookie || '');
      const sessionId = cookies['connect.sid'];

      if (!sessionId) {
        console.log('[WebSocket] No session ID found');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      // Get session from store
      const session = await new Promise<Session | null>((resolve, reject) => {
        sessionMiddleware.store.get(sessionId.slice(2), (err: any, session: Session | null) => {
          if (err) {
            console.error('[WebSocket] Session store error:', err);
            reject(err);
          } else {
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
      console.log('[WebSocket] Upgrading connection for user:', userId);

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, userId);
      });
    } catch (error) {
      console.error('[WebSocket] Upgrade error:', error);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  });

  // Handle connections
  wss.on('connection', (ws: WebSocket, userId: number) => {
    console.log('[WebSocket] New connection established for user:', userId);

    // Clean up any existing connection for this user
    const existingConnection = connectedClients.get(userId);
    if (existingConnection) {
      console.log('[WebSocket] Closing existing connection for user:', userId);
      existingConnection.close();
    }

    connectedClients.set(userId, ws);

    // Send connected message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to chat server'
    }));

    // Handle messages
    ws.on('message', async (data: Buffer) => {
      try {
        const parsedMessage = JSON.parse(data.toString());
        console.log('[WebSocket] Received message:', parsedMessage);

        if (parsedMessage.type === 'group_message') {
          const { groupId, content } = parsedMessage;

          if (!groupId || !content) {
            throw new Error('Group message must include groupId and content');
          }

          // Verify user is member of group
          const [membership] = await db
            .select()
            .from(groupMembers)
            .where(eq(groupMembers.groupId, groupId))
            .where(eq(groupMembers.userId, userId))
            .limit(1);

          if (!membership) {
            throw new Error('User is not a member of this group');
          }

          // Save message to database
          const [savedMessage] = await db
            .insert(groupMessages)
            .values({
              groupId,
              userId,
              content,
              createdAt: new Date(),
              updatedAt: new Date(),
              isDeleted: false
            })
            .returning();

          // Get user info
          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

          // Get all group members
          const groupMemberIds = await db
            .select()
            .from(groupMembers)
            .where(eq(groupMembers.groupId, groupId));

          // Broadcast to all group members
          const messageToSend = {
            type: 'new_group_message',
            data: {
              ...savedMessage,
              user: user ? { username: user.username } : { username: 'Unknown User' }
            }
          };

          for (const member of groupMemberIds) {
            const client = connectedClients.get(member.userId);
            if (client?.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(messageToSend));
            }
          }
        }
      } catch (error) {
        console.error('[WebSocket] Message handling error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to process message'
        }));
      }
    });

    // Handle connection close
    ws.on('close', () => {
      console.log('[WebSocket] Connection closed for user:', userId);
      connectedClients.delete(userId);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('[WebSocket] Connection error for user:', userId, error);
      connectedClients.delete(userId);
    });
  });

  return wss;
}