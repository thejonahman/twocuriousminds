import { Request, Response } from 'express';
import { db } from "@db";
import { eq, desc } from "drizzle-orm";
import { groupMessages } from "@db/schema";

interface TypedRequestUser extends Request {
  user?: {
    id: number;
    username: string;
    email: string;
    isAdmin?: boolean;
  };
}

export function setupPolling(app: any) {
  // Endpoint to send new messages
  app.post('/api/messages', async (req: TypedRequestUser, res: Response) => {
    try {
      const { groupId, content } = req.body;
      const userId = req.user?.id;

      if (!userId || !groupId || !content) {
        return res.status(400).json({ error: 'Missing required fields' });
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

      // Fetch the complete message with user details for the response
      const messageWithUser = await db.query.groupMessages.findFirst({
        where: eq(groupMessages.id, savedMessage.id),
        with: {
          user: {
            columns: {
              username: true
            }
          }
        }
      });

      res.status(201).json(messageWithUser);
    } catch (error) {
      console.error('Message send error:', error);
      res.status(500).json({ 
        error: 'Failed to send message',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get messages endpoint with proper sorting
  app.get('/api/messages', async (req: TypedRequestUser, res: Response) => {
    try {
      const groupId = parseInt(req.query.groupId as string);

      if (isNaN(groupId)) {
        return res.status(400).json({ error: 'Invalid group ID' });
      }

      const messages = await db.query.groupMessages.findMany({
        where: eq(groupMessages.groupId, groupId),
        orderBy: [desc(groupMessages.createdAt)],
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