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
    path: '/ws'
  });

  // Handle upgrade requests
  httpServer.on('upgrade', async (request: RequestWithSession, socket, head) => {
    console.log('[WebSocket] Upgrade request received');

    // Ignore vite-hmr websocket connections
    if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
      console.log('[WebSocket] Ignoring vite-hmr connection');
      socket.destroy();
      return;
    }

    try {
      // Apply session middleware
      await new Promise<void>((resolve, reject) => {
        sessionMiddleware(request, {}, (err?: any) => {
          if (err) {
            console.error('[WebSocket] Session middleware error:', err);
            reject(err);
          } else {
            resolve();
          }
        });
      });

      // Check authentication
      const userId = request.session?.passport?.user;
      if (!userId) {
        console.log('[WebSocket] No authenticated user found');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      // Complete upgrade
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, userId);
      });

    } catch (error) {
      console.error('[WebSocket] Upgrade error:', error);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  });

  // Handle connections
  wss.on('connection', (ws: WebSocket, request: Request, userId: number) => {
    console.log('[WebSocket] New connection established for user:', userId);

    connectedClients.set(userId, ws);

    // Send initial success message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to chat server'
    }));

    // Handle incoming messages
    ws.on('message', async (data: Buffer) => {
      try {
        const message = validateApiResponse(wsMessageSchema, JSON.parse(data.toString()));

        switch (message.type) {
          case 'group_message': {
            const { groupId, content } = message;

            // Save message to database
            const [savedMessage] = await db.insert(groupMessages)
              .values({
                groupId,
                userId,
                content
              })
              .returning();

            // Get user info for the message
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

            // Update unread counts
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

            // Broadcast to all group members
            const messageToSend = {
              type: 'new_group_message',
              data: {
                ...savedMessage,
                user: members.find(m => m.userId === userId)?.user
              }
            };

            members.forEach(member => {
              const client = connectedClients.get(member.userId);
              if (client?.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(messageToSend));
              }
            });
            break;
          }

          default:
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Unknown message type'
            }));
        }
      } catch (error) {
        console.error('[WebSocket] Message handling error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: error instanceof Error ? error.message : 'Internal server error'
        }));
      }
    });

    // Handle disconnection
    ws.on('close', () => {
      console.log('[WebSocket] Connection closed for user:', userId);
      connectedClients.delete(userId);
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] Connection error for user:', userId, error);
      connectedClients.delete(userId);
    });
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