import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@db";
import { groupMessages, users, groupMembers, discussionGroups } from "@db/schema";
import { insertGroupMessageSchema } from "@db/schema";
import { Router, type Request, type Response } from "express";
import { sendUnreadMessagesNotification } from "../lib/email";

const router = Router();

interface TypedRequestUser extends Request {
  user?: {
    id: number;
    username: string;
    email: string;
    isAdmin?: boolean;
  };
}

// Get messages for a group
router.get("/api/groups/:groupId/messages", async (req: TypedRequestUser, res: Response) => {
  try {
    const { groupId } = req.params;
    const parsedGroupId = parseInt(groupId);

    if (isNaN(parsedGroupId)) {
      return res.status(400).json({ error: "Invalid group ID" });
    }

    // Check if user is member of group
    if (req.user?.id) {
      const memberCheck = await db.query.groupMembers.findFirst({
        where: and(
          eq(groupMembers.groupId, parsedGroupId),
          eq(groupMembers.userId, req.user.id)
        )
      });

      if (!memberCheck) {
        return res.status(403).json({ error: "Not a member of this group" });
      }
    }

    const messages = await db.query.groupMessages.findMany({
      where: eq(groupMessages.groupId, parsedGroupId),
      with: {
        user: {
          columns: {
            id: true,
            username: true,
          }
        }
      },
      orderBy: [desc(groupMessages.createdAt)],
      limit: 100
    });

    // Update last read timestamp for the current user
    if (req.user?.id) {
      await db
        .update(groupMembers)
        .set({
          lastReadAt: new Date(),
          unreadCount: 0
        })
        .where(and(
          eq(groupMembers.groupId, parsedGroupId),
          eq(groupMembers.userId, req.user.id)
        ));
    }

    res.json(messages.reverse());
  } catch (error) {
    console.error('Error in group messages:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Post a new message to a group
router.post("/api/groups/:groupId/messages", async (req: TypedRequestUser, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { groupId } = req.params;
    const parsedGroupId = parseInt(groupId);

    if (isNaN(parsedGroupId)) {
      return res.status(400).json({ error: "Invalid group ID" });
    }

    const result = insertGroupMessageSchema.safeParse({
      content: req.body.content,
      groupId: parsedGroupId,
      userId: req.user.id
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error.format() });
    }

    const [message] = await db.insert(groupMessages).values({
      groupId: parsedGroupId,
      userId: req.user.id,
      content: result.data.content,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();

    // Get full message details with user info for the response
    const messageWithUser = await db.query.groupMessages.findFirst({
      where: eq(groupMessages.id, message.id),
      with: {
        user: {
          columns: {
            id: true,
            username: true,
          }
        }
      }
    });

    res.json(messageWithUser);
  } catch (error) {
    console.error('Error posting message:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
