import { Request, Response } from 'express';
import { db } from "@db";
import { eq } from "drizzle-orm";
import { groupMessages, messages } from "@db/schema";

export function setupPolling(app: any) {
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
          content,
          createdAt: new Date()
        })
        .returning();

      // Get user details for the response
      const messageWithUser = {
        ...savedMessage,
        user: {
          username: req.user?.username
        }
      };

      res.status(201).json(messageWithUser);
    } catch (error) {
      console.error('Message send error:', error);
      res.status(500).json({ 
        error: 'Failed to send message',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get messages endpoint
  app.get('/api/messages', async (req: Request, res: Response) => {
    try {
      const groupId = parseInt(req.query.groupId as string);

      if (isNaN(groupId)) {
        return res.status(400).json({ error: 'Invalid group ID' });
      }

      const messages = await db.query.groupMessages.findMany({
        where: eq(groupMessages.groupId, groupId),
        orderBy: (messages, { desc }) => [desc(messages.createdAt)],
        with: {
          user: {
            columns: {
              username: true
            }
          }
        }
      });

      res.json(messages.reverse()); // Return in chronological order
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ 
        error: 'Failed to fetch messages',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}