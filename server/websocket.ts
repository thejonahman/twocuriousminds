import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { Request } from 'express';
import { db } from "@db";
import { sql, eq, and } from "drizzle-orm";
import { groupMessages, groupMembers } from "@db/schema";
import cookie from 'cookie';

// Store active WebSocket connections
const connectedClients = new Map<number, WebSocket>();

export function setupWebSocketServer(httpServer: Server, sessionMiddleware: any) {
  const wss = new WebSocketServer({ 
    noServer: true 
  });

  // Handle upgrade requests
  httpServer.on('upgrade', (request: any, socket, head) => {
    // Ignore vite-hmr websocket connections
    if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
      console.log('[WebSocket] Ignoring vite-hmr connection');
      socket.destroy();
      return;
    }

    try {
      // Parse cookies from the request
      const cookies = cookie.parse(request.headers.cookie || '');
      request.sessionStore = sessionMiddleware.store;
      request.sessionID = cookies['connect.sid'];

      // Apply session middleware
      sessionMiddleware(request, {}, async (err: any) => {
        if (err) {
          console.error('[WebSocket] Session middleware error:', err);
          socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
          socket.destroy();
          return;
        }

        const userId = request.session?.passport?.user;
        if (!userId) {
          console.log('[WebSocket] No authenticated user found');
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request, userId);
        });
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

    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to chat server'
    }));

    // Handle messages
    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('[WebSocket] Received message:', message);

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

            // Broadcast to members
            const messageToSend = {
              type: 'new_group_message',
              data: {
                ...savedMessage,
                user: members.find(m => m.userId === userId)?.user
              }
            };

            for (const member of members) {
              const client = connectedClients.get(member.userId);
              if (client?.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(messageToSend));
              }
            }
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