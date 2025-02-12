import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@db";
import { groupMessages, users, groupMembers, discussionGroups } from "@db/schema";
import { insertGroupMessageSchema } from "@db/schema";
import { Router } from "express";

const router = Router();

router.get("/api/groups/:groupId/messages", async (req, res) => {
  try {
    const { groupId } = req.params;
    const parsedGroupId = parseInt(groupId);

    if (isNaN(parsedGroupId)) {
      return res.status(400).json({ error: "Invalid group ID" });
    }

    // Check if user is member of group
    if (req.user) {
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
            email: true,
          }
        }
      },
      orderBy: desc(groupMessages.createdAt),
    });

    // Update last read timestamp for the current user
    if (req.user) {
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

    res.json(messages);
  } catch (error) {
    console.error('Error in group messages:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/api/groups/:groupId/messages", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { groupId } = req.params;
    const parsedGroupId = parseInt(groupId);

    if (isNaN(parsedGroupId)) {
      return res.status(400).json({ error: "Invalid group ID" });
    }

    const result = insertGroupMessageSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Verify user is member of group
    const memberCheck = await db.query.groupMembers.findFirst({
      where: and(
        eq(groupMembers.groupId, parsedGroupId),
        eq(groupMembers.userId, req.user.id)
      )
    });

    if (!memberCheck) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    // Create the message
    const [message] = await db.insert(groupMessages).values({
      groupId: parsedGroupId,
      userId: req.user.id,
      content: result.data.content,
    }).returning();

    // Get full message details with user info
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

    // Update unread count for other group members
    await db
      .update(groupMembers)
      .set({ 
        unreadCount: sql`${groupMembers.unreadCount} + 1`
      })
      .where(and(
        eq(groupMembers.groupId, parsedGroupId),
        sql`${groupMembers.userId} != ${req.user.id}`,
        sql`${groupMembers.lastReadAt} < NOW() - INTERVAL '1 hour'`
      ));

    res.json(messageWithUser);
  } catch (error) {
    console.error('Error posting group message:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/api/groups/:groupId/mark-read", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { groupId } = req.params;
    const parsedGroupId = parseInt(groupId);

    if (isNaN(parsedGroupId)) {
      return res.status(400).json({ error: "Invalid group ID" });
    }

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

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// New endpoint to get user's last active group in a video
router.get("/api/videos/:videoId/last-active-group", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { videoId } = req.params;

  // Find the user's most recently active group for this video
  const lastActiveGroup = await db.query.discussionGroups.findFirst({
    where: and(
      eq(discussionGroups.videoId, parseInt(videoId)),
      sql`exists (
        select 1 from groupMembers 
        where groupMembers.groupId = discussionGroups.id 
        and groupMembers.userId = ${req.user.id}
      )`
    ),
    with: {
      messages: {
        orderBy: desc(groupMessages.createdAt),
        limit: 50,
        with: {
          user: {
            columns: {
              id: true,
              username: true,
            }
          }
        }
      }
    },
    orderBy: desc(discussionGroups.updatedAt),
  });

  if (!lastActiveGroup) {
    return res.status(404).json({ error: "No active group found" });
  }

  res.json(lastActiveGroup);
});

export default router;