import { Request, Response } from 'express';
import { db } from "@db";
import { eq, and, desc } from "drizzle-orm";
import { groupMessages, groupMembers } from "@db/schema";

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

      // Verify user is a member with proper permissions
      const memberCheck = await db.query.groupMembers.findFirst({
        where: and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId)
        )
      });

      if (!memberCheck) {
        return res.status(403).json({ error: 'Not a member of this group' });
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

  // Get messages endpoint with proper sorting and member verification
  app.get('/api/messages', async (req: TypedRequestUser, res: Response) => {
    try {
      const groupId = parseInt(req.query.groupId as string);
      const userId = req.user?.id;

      if (isNaN(groupId)) {
        return res.status(400).json({ error: 'Invalid group ID' });
      }

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Verify user is a member
      const memberCheck = await db.query.groupMembers.findFirst({
        where: and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId)
        )
      });

      if (!memberCheck) {
        return res.status(403).json({ error: 'Not a member of this group' });
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

      // Update last read timestamp for the member
      await db.update(groupMembers)
        .set({
          lastReadAt: new Date(),
          unreadCount: 0
        })
        .where(and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId)
        ));

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