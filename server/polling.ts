import { Request, Response } from 'express';
import { db } from "@db";
import { eq } from "drizzle-orm";
import { groupMessages, messages } from "@db/schema";

// Store pending requests for each group
const pendingRequests = new Map<number, Response[]>();
// Store last message timestamps for each user
const lastMessageTimestamps = new Map<number, Date>();

export function setupPolling(app: any) {
  // Long polling endpoint for group messages
  app.get('/api/poll/messages', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const groupId = parseInt(req.query.groupId as string);
      const timeout = parseInt(req.query.timeout as string) || 30000; // Default 30s timeout

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (isNaN(groupId)) {
        return res.status(400).json({ error: 'Invalid group ID' });
      }

      // Get last seen timestamp for this user
      const lastSeen = lastMessageTimestamps.get(userId) || new Date(0);

      // Check for new messages immediately
      const newMessages = await db.query.groupMessages.findMany({
        where: eq(groupMessages.groupId, groupId),
        with: {
          user: {
            columns: {
              username: true
            }
          }
        },
        orderBy: (messages, { desc }) => [desc(messages.createdAt)]
      });

      // If there are new messages, send them immediately
      if (newMessages.length > 0) {
        lastMessageTimestamps.set(userId, new Date());
        return res.json(newMessages);
      }

      // If no new messages, wait for updates
      const requests = pendingRequests.get(groupId) || [];
      requests.push(res);
      pendingRequests.set(groupId, requests);

      // Set timeout to prevent hanging connections
      setTimeout(() => {
        const index = requests.indexOf(res);
        if (index !== -1) {
          requests.splice(index, 1);
          if (!res.headersSent) {
            res.json([]); // Return empty array on timeout
          }
        }
      }, timeout);

      // Clean up on client disconnect
      req.on('close', () => {
        const index = requests.indexOf(res);
        if (index !== -1) {
          requests.splice(index, 1);
        }
      });
    } catch (error) {
      console.error('Polling error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // Endpoint to send new messages
  app.post('/api/messages', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const { groupId, content } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Save message to database
      const [savedMessage] = await db.insert(groupMessages)
        .values({
          groupId,
          userId,
          content
        })
        .returning();

      // Get user details for the response
      const messageWithUser = {
        ...savedMessage,
        user: {
          username: req.user.username
        }
      };

      // Notify all pending requests for this group
      const requests = pendingRequests.get(groupId) || [];
      requests.forEach(pendingRes => {
        if (!pendingRes.headersSent) {
          pendingRes.json([messageWithUser]);
        }
      });
      pendingRequests.set(groupId, []);

      res.status(201).json(messageWithUser);
    } catch (error) {
      console.error('Message send error:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });
}
