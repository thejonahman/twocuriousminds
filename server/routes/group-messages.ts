import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@db";
import { groupMessages, users, groupMembers, discussionGroups, videos } from "@db/schema";
import { insertGroupMessageSchema } from "@db/schema";
import { Router } from "express";
import { AuthenticatedRequest } from "../routes";
import { sendUnreadMessagesNotification } from "../lib/email";

const router = Router();

// Get messages for a group
router.get("/api/groups/:groupId/messages", async (req: AuthenticatedRequest, res) => {
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
          }
        }
      },
      orderBy: [desc(groupMessages.createdAt)],
      limit: 100
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

    res.json(messages.reverse());
  } catch (error) {
    console.error('Error in group messages:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Post a new message to a group
router.post("/api/groups/:groupId/messages", async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
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
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();

    // Update the group's updatedAt timestamp
    await db
      .update(discussionGroups)
      .set({ 
        updatedAt: new Date()
      })
      .where(eq(discussionGroups.id, parsedGroupId));

    // Get the video details for the notification
    const video = await db.query.videos.findFirst({
      where: eq(videos.id, result.data.videoId),
    });

    // Get group details
    const group = await db.query.discussionGroups.findFirst({
      where: eq(discussionGroups.id, parsedGroupId),
    });

    // Get other group members who haven't read messages in the last hour
    const inactiveMembers = await db.query.groupMembers.findMany({
      where: and(
        eq(groupMembers.groupId, parsedGroupId),
        sql`${groupMembers.userId} != ${req.user.id}`,
        sql`${groupMembers.lastReadAt} < NOW() - INTERVAL '1 hour'`
      ),
      with: {
        user: true
      }
    });

    // Send email notifications to inactive members
    for (const member of inactiveMembers) {
      if (member.emailNotifications && member.user.email) {
        try {
          await sendUnreadMessagesNotification({
            userEmail: member.user.email,
            userName: member.user.username,
            groupName: group?.name || 'Discussion Group',
            videoTitle: video?.title || 'Video Discussion',
            unreadCount: (member.unreadCount || 0) + 1,
            groupUrl: `${process.env.APP_URL}/video/${video?.id}/group/${parsedGroupId}`
          });
        } catch (error) {
          console.error('Failed to send notification email:', error);
        }
      }
    }

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

    res.json(messageWithUser);
  } catch (error) {
    console.error('Error posting group message:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;