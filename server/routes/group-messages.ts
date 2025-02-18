import { and, desc, eq } from "drizzle-orm";
import { db } from "@db";
import { groupMessages, groupMembers, discussionGroups } from "@db/schema";
import { insertGroupMessageSchema } from "@db/schema";
import { Router } from "express";
import type { Request, Response } from "express";

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

    // First, ensure user is a member or add them if they're not
    if (req.user?.id) {
      const groupData = await db.query.discussionGroups.findFirst({
        where: eq(discussionGroups.id, parsedGroupId),
        columns: {
          id: true,
          name: true,
          videoId: true,
          updatedAt: true
        }
      });

      if (!groupData) {
        return res.status(404).json({ error: "Group not found" });
      }

      const memberCheck = await db.query.groupMembers.findFirst({
        where: and(
          eq(groupMembers.groupId, parsedGroupId),
          eq(groupMembers.userId, req.user.id)
        )
      });

      if (!memberCheck) {
        // Add user as a member if they're not already
        await db.insert(groupMembers)
          .values({
            groupId: parsedGroupId,
            userId: req.user.id,
            role: 'member',
            joinedAt: new Date(),
            lastReadAt: new Date(),
            notificationsEnabled: true,
            emailNotifications: false,
            unreadCount: 0
          });

        // Always include group data in response headers
        res.setHeader('X-Group-Data', JSON.stringify({
          id: groupData.id,
          name: groupData.name,
          videoId: groupData.videoId,
          updatedAt: groupData.updatedAt
        }));
      }

      // Always update last read timestamp and unread count
      await db.update(groupMembers)
        .set({
          lastReadAt: new Date(),
          unreadCount: 0
        })
        .where(and(
          eq(groupMembers.groupId, parsedGroupId),
          eq(groupMembers.userId, req.user.id)
        ));
    }

    // Get messages with user details
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

    res.json(messages.reverse());
  } catch (error) {
    console.error('Error fetching group messages:', error);
    res.status(500).json({ 
      error: "Failed to fetch messages",
      details: error instanceof Error ? error.message : "Unknown error" 
    });
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

    // First verify user is a member of the group
    const memberCheck = await db.query.groupMembers.findFirst({
      where: and(
        eq(groupMembers.groupId, parsedGroupId),
        eq(groupMembers.userId, req.user.id)
      )
    });

    if (!memberCheck) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    const [message] = await db.insert(groupMessages)
      .values({
        groupId: parsedGroupId,
        userId: req.user.id,
        content: result.data.content,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

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

    // Update group's last activity timestamp
    await db.update(discussionGroups)
      .set({ updatedAt: new Date() })
      .where(eq(discussionGroups.id, parsedGroupId));

    res.json(messageWithUser);
  } catch (error) {
    console.error('Error posting message:', error);
    res.status(500).json({ 
      error: "Failed to send message",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

export default router;