import { and, desc, eq } from "drizzle-orm";
import { db } from "@db";
import { groupMessages, groupMembers, discussionGroups } from "@db/schema";
import { insertGroupMessageSchema } from "@db/schema";
import { Router, Request, Response, RequestHandler } from "express";
import type {Request as TypedRequest, Response as TypedResponse} from "express";

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
router.get("/api/groups/:groupId/messages", (async (req: TypedRequestUser, res: TypedResponse) => {
  try {
    const { groupId } = req.params;
    const parsedGroupId = parseInt(groupId);

    if (isNaN(parsedGroupId)) {
      return res.status(400).json({ error: "Invalid group ID" });
    }

    console.log('[GroupMessages] Processing request:', {
      groupId: parsedGroupId,
      userId: req.user?.id,
      timestamp: new Date().toISOString()
    });

    // First, ensure user is a member or add them if they're not
    if (req.user?.id) {
      const groupData = await db.query.discussionGroups.findFirst({
        where: and(
          eq(discussionGroups.id, parsedGroupId),
          eq(discussionGroups.isDeleted, false)
        ),
        columns: {
          id: true,
          name: true,
          videoId: true,
          updatedAt: true
        }
      });

      if (!groupData) {
        console.log('[GroupMessages] Group not found or deleted:', parsedGroupId);
        return res.status(404).json({ error: "Group not found" });
      }

      const memberCheck = await db.query.groupMembers.findFirst({
        where: and(
          eq(groupMembers.groupId, parsedGroupId),
          eq(groupMembers.userId, req.user.id),
          eq(groupMembers.isDeleted, false)
        )
      });

      console.log('[GroupMessages] Member check result:', {
        groupId: parsedGroupId,
        userId: req.user.id,
        isMember: !!memberCheck,
        timestamp: new Date().toISOString()
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
            unreadCount: 0,
            isDeleted: false
          });

        console.log('[GroupMessages] Added new member:', {
          groupId: parsedGroupId,
          userId: req.user.id,
          timestamp: new Date().toISOString()
        });

        // Always include group data in response headers
        res.setHeader('X-Group-Data', JSON.stringify(groupData));
      }

      // Always update last read timestamp and unread count
      await db.update(groupMembers)
        .set({
          lastReadAt: new Date(),
          unreadCount: 0
        })
        .where(and(
          eq(groupMembers.groupId, parsedGroupId),
          eq(groupMembers.userId, req.user.id),
          eq(groupMembers.isDeleted, false)
        ));

      console.log('[GroupMessages] Updated member timestamps:', {
        groupId: parsedGroupId,
        userId: req.user.id,
        timestamp: new Date().toISOString()
      });
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

    console.log('[GroupMessages] Retrieved messages:', {
      groupId: parsedGroupId,
      messageCount: messages.length,
      timestamp: new Date().toISOString()
    });

    res.json(messages.reverse());
  } catch (error) {
    console.error('[GroupMessages] Error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ 
      error: "Failed to fetch messages",
      details: error instanceof Error ? error.message : "Unknown error" 
    });
  }
}) as RequestHandler);

// Post a new message to a group
router.post("/api/groups/:groupId/messages", (async (req: TypedRequestUser, res: TypedResponse) => {
  if (!req.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { groupId } = req.params;
    const parsedGroupId = parseInt(groupId);

    if (isNaN(parsedGroupId)) {
      return res.status(400).json({ error: "Invalid group ID" });
    }

    console.log('[GroupMessages] Processing new message:', {
      groupId: parsedGroupId,
      userId: req.user.id,
      timestamp: new Date().toISOString()
    });

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
        eq(groupMembers.userId, req.user.id),
        eq(groupMembers.isDeleted, false)
      )
    });

    if (!memberCheck) {
      console.log('[GroupMessages] Member not found:', {
        groupId: parsedGroupId,
        userId: req.user.id,
        timestamp: new Date().toISOString()
      });
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

    console.log('[GroupMessages] Created new message:', {
      messageId: message.id,
      groupId: parsedGroupId,
      timestamp: new Date().toISOString()
    });

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
    console.error('[GroupMessages] Error posting message:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ 
      error: "Failed to send message",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
}) as RequestHandler);

// Add this new endpoint after the other routes
router.post("/api/groups/:groupId/touch", (async (req: TypedRequestUser, res: TypedResponse) => {
  if (!req.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { groupId } = req.params;
    const parsedGroupId = parseInt(groupId);

    if (isNaN(parsedGroupId)) {
      return res.status(400).json({ error: "Invalid group ID" });
    }

    console.log('[GroupTouch] Processing request:', {
      groupId: parsedGroupId,
      userId: req.user.id,
      timestamp: new Date().toISOString()
    });

    await db.transaction(async (tx) => {
      // Update member's lastReadAt
      const updateResult = await tx.update(groupMembers)
        .set({
          lastReadAt: new Date(),
          unreadCount: 0
        })
        .where(and(
          eq(groupMembers.groupId, parsedGroupId),
          eq(groupMembers.userId, req.user!.id),
          eq(groupMembers.isDeleted, false)
        ))
        .returning();

      if (!updateResult.length) {
        throw new Error('Member not found or deleted');
      }

      // Update group's activity timestamp
      await tx.update(discussionGroups)
        .set({ updatedAt: new Date() })
        .where(and(
          eq(discussionGroups.id, parsedGroupId),
          eq(discussionGroups.isDeleted, false)
        ));

      console.log('[GroupTouch] Successfully updated timestamps:', {
        groupId: parsedGroupId,
        userId: req.user.id,
        timestamp: new Date().toISOString()
      });
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[GroupTouch] Error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ 
      error: "Failed to update group activity",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
}) as RequestHandler);

export default router;