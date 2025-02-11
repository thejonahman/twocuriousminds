import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@db";
import { groupMessages, users, groupMembers, discussionGroups } from "@db/schema";
import { insertGroupMessageSchema } from "@db/schema";
import { Router } from "express";

const router = Router();

router.get("/api/groups/:groupId/messages", async (req, res) => {
  const { groupId } = req.params;

  try {
    const messages = await db.query.groupMessages.findMany({
      where: eq(groupMessages.groupId, parseInt(groupId)),
      with: {
        user: {
          columns: {
            id: true,
            username: true,
          }
        }
      },
      orderBy: [groupMessages.createdAt],  // Ascending order (oldest first)
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
          eq(groupMembers.groupId, parseInt(groupId)),
          eq(groupMembers.userId, req.user.id)
        ));
    }

    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

router.post("/api/groups/:groupId/messages", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { groupId } = req.params;
  const result = insertGroupMessageSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  // Create the message
  const [message] = await db.insert(groupMessages)
    .values({
      groupId: parseInt(groupId),
      userId: req.user.id,
      content: result.data.content,
    })
    .returning();

  // Update unread count for other group members who haven't read in last hour
  await db
    .update(groupMembers)
    .set({ 
      unreadCount: sql`${groupMembers.unreadCount} + 1`
    })
    .where(and(
      eq(groupMembers.groupId, parseInt(groupId)),
      sql`${groupMembers.userId} != ${req.user.id}`,
      sql`${groupMembers.lastReadAt} < NOW() - INTERVAL '1 hour'`
    ));

  res.json(message);
});

// New endpoint to mark messages as read
router.post("/api/groups/:groupId/mark-read", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { groupId } = req.params;

  await db
    .update(groupMembers)
    .set({ 
      lastReadAt: new Date(),
      unreadCount: 0
    })
    .where(and(
      eq(groupMembers.groupId, parseInt(groupId)),
      eq(groupMembers.userId, req.user.id)
    ));

  res.json({ success: true });
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