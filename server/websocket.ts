import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { Request } from 'express';
import type { SessionData } from 'express-session';
import { db } from "@db";
import { sql, eq, and } from "drizzle-orm";
import { groupMessages, groupMembers } from "@db/schema";
import { validateApiResponse, wsMessageSchema } from "@/lib/api-types";

// Store active WebSocket connections
const connectedClients = new Map<number, WebSocket>();

interface SessionWithPassport extends SessionData {
  passport?: {
    user?: number;
  };
}

interface RequestWithSession extends Request {
  session: SessionWithPassport;
}

export function setupWebSocketServer(httpServer: Server, sessionMiddleware: any) {
  const wss = new WebSocketServer({ 
    noServer: true,
    clientTracking: true,
    perMessageDeflate: false
  });

  // Handle upgrade requests
  httpServer.on('upgrade', async (request: RequestWithSession, socket: any, head: Buffer) => {
    console.log('[WebSocket] Upgrade request received:', request.url);
    console.log('[WebSocket] Request headers:', request.headers);
    console.log('[WebSocket] Cookie header:', request.headers.cookie);

    // Ignore vite-hmr websocket connections
    if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
      console.log('[WebSocket] Ignoring vite-hmr connection');
      socket.destroy();
      return;
    }

    try {
      // Apply session middleware with Promise wrapper
      await new Promise((resolve, reject) => {
        sessionMiddleware(request, {} as any, (err?: any) => {
          if (err) {
            console.error('[WebSocket] Session middleware error:', err);
            reject(err);
          } else {
            console.log('[WebSocket] Session middleware success. Session:', request.session);
            resolve(true);
          }
        });
      });

      // Get user ID from session after middleware processes request
      const userId = request.session?.passport?.user;
      console.log('[WebSocket] Session user ID:', userId);
      console.log('[WebSocket] Full session data:', request.session);

      if (!userId) {
        console.log('[WebSocket] No authenticated user found in session');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      // Handle the upgrade
      wss.handleUpgrade(request, socket, head, (ws) => {
        console.log('[WebSocket] Upgrade successful, establishing connection for user:', userId);
        wss.emit('connection', ws, request, userId);
      });

    } catch (error) {
      console.error('[WebSocket] Upgrade error:', error);
      console.error('[WebSocket] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  });

  // Handle connections
  wss.on('connection', (ws: WebSocket, request: Request, userId: number) => {
    console.log('[WebSocket] New connection established for user:', userId);
    console.log('[WebSocket] Connected clients before add:', connectedClients.size);

    // Store the connection
    connectedClients.set(userId, ws);
    console.log('[WebSocket] Connected clients after add:', connectedClients.size);

    // Handle messages
    ws.on('message', async (rawData: Buffer) => {
      try {
        const messageStr = rawData.toString();
        console.log('[WebSocket] Raw message received:', messageStr);

        const message = validateApiResponse(wsMessageSchema, JSON.parse(messageStr));
        console.log('[WebSocket] Validated message:', message);

        switch (message.type) {
          case 'group_message':
            await handleGroupMessage(userId, message);
            break;
          case 'create_group':
            await handleCreateGroup(userId, message);
            break;
          default:
            console.warn('[WebSocket] Unknown message type:', message.type);
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Unknown message type'
            }));
        }
      } catch (error) {
        console.error('[WebSocket] Message handling error:', error);
        console.error('[WebSocket] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        ws.send(JSON.stringify({
          type: 'error',
          message: error instanceof Error ? error.message : 'Internal server error'
        }));
      }
    });

    // Handle connection close
    ws.on('close', (code: number, reason: Buffer) => {
      console.log('[WebSocket] Connection closed for user:', userId);
      console.log('[WebSocket] Close code:', code);
      console.log('[WebSocket] Close reason:', reason.toString());
      connectedClients.delete(userId);
      console.log('[WebSocket] Connected clients after remove:', connectedClients.size);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('[WebSocket] Connection error for user:', userId, error);
      console.error('[WebSocket] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      connectedClients.delete(userId);
    });

    // Send initial connection success message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Successfully connected to WebSocket server'
    }));
  });

  // Handle server errors
  wss.on('error', (error) => {
    console.error('[WebSocket] Server error:', error);
    console.error('[WebSocket] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
  });

  return wss;
}

// Message handlers
async function handleGroupMessage(userId: number, message: any) {
  console.log('[WebSocket] Handling group message:', message);

  const { groupId, content } = message;

  try {
    // Save message
    const [savedMessage] = await db.insert(groupMessages)
      .values({
        groupId,
        userId,
        content
      })
      .returning();

    console.log('[WebSocket] Saved message:', savedMessage);

    // Get group members
    const members = await db.query.groupMembers.findMany({
      where: eq(groupMembers.groupId, groupId),
      with: {
        user: {
          columns: {
            username: true
          }
        }
      }
    });

    console.log('[WebSocket] Group members:', members);

    // Update unread count for other members
    await Promise.all(
      members
        .filter(member => member.userId !== userId)
        .map(member =>
          db.update(groupMembers)
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

    // Broadcast to group members
    const memberIds = new Set(members.map(m => m.userId));
    const broadcastMessage = {
      type: 'new_group_message',
      data: {
        ...savedMessage,
        user: members.find(m => m.userId === userId)?.user
      }
    };

    console.log('[WebSocket] Broadcasting message to members:', memberIds);

    for (const [clientId, client] of connectedClients.entries()) {
      if (memberIds.has(clientId) && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(broadcastMessage));
      }
    }
  } catch (error) {
    console.error('[WebSocket] Error handling group message:', error);
    console.error('[WebSocket] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    throw error;
  }
}

async function handleCreateGroup(userId: number, message: any) {
  // Implementation will be added in a separate update
  console.log('[WebSocket] Create group not yet implemented');
  throw new Error('Create group not implemented');
}