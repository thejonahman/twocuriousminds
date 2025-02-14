import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@db";
import { groupMessages, users, groupMembers, discussionGroups, videos } from "@db/schema";
import { insertGroupMessageSchema } from "@db/schema";
import { Router } from "express";
import { AuthenticatedRequest } from "../auth";
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

    // Check if group exists and is not deleted
    const group = await db.query.discussionGroups.findFirst({
      where: and(
        eq(discussionGroups.id, parsedGroupId),
        eq(discussionGroups.isDeleted, false)
      )
    });

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if user is member of group and membership is not deleted
    if (req.user) {
      const memberCheck = await db.query.groupMembers.findFirst({
        where: and(
          eq(groupMembers.groupId, parsedGroupId),
          eq(groupMembers.userId, req.user.id),
          eq(groupMembers.isDeleted, false)
        )
      });

      if (!memberCheck) {
        return res.status(403).json({ error: "Not a member of this group" });
      }
    }

    // Get only non-deleted messages
    const messages = await db.query.groupMessages.findMany({
      where: and(
        eq(groupMessages.groupId, parsedGroupId),
        eq(groupMessages.isDeleted, false)
      ),
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

    // Update last read timestamp for the current user if their membership is active
    if (req.user) {
      await db
        .update(groupMembers)
        .set({ 
          lastReadAt: new Date(),
          unreadCount: 0
        })
        .where(and(
          eq(groupMembers.groupId, parsedGroupId),
          eq(groupMembers.userId, req.user.id),
          eq(groupMembers.isDeleted, false)
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

    // Create the message
    const [message] = await db.insert(groupMessages).values({
      groupId: parsedGroupId,
      userId: req.user.id,
      content: result.data.content,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();

    // Update group's updatedAt and increment unread count for other members
    await db.transaction(async (tx) => {
      // Update group timestamp
      await tx
        .update(discussionGroups)
        .set({ updatedAt: new Date() })
        .where(eq(discussionGroups.id, parsedGroupId));

      // Increment unread count for other members
      await tx
        .update(groupMembers)
        .set({ 
          unreadCount: sql`${groupMembers.unreadCount} + 1`
        })
        .where(
          and(
            eq(groupMembers.groupId, parsedGroupId),
            sql`${groupMembers.userId} != ${req.user!.id}`
          )
        );
    });

    // Get group details with video information and engagement metrics
    const group = await db.query.discussionGroups.findFirst({
      where: eq(discussionGroups.id, parsedGroupId),
      with: {
        video: true,
        members: {
          with: {
            user: true
          }
        }
      }
    });

    if (!group) {
      console.error('Group not found for notifications:', parsedGroupId);
      return res.status(404).json({ error: "Group not found" });
    }

    console.log('[Email Notifications] Processing for group:', {
      groupId: group.id,
      groupName: group.name,
      videoId: group.video?.id
    });

    // Calculate engagement metrics
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentMessages = await db.query.groupMessages.findMany({
      where: and(
        eq(groupMessages.groupId, parsedGroupId),
        gt(groupMessages.createdAt, last24Hours)
      ),
      with: {
        user: {
          columns: {
            username: true
          }
        }
      }
    });

    // Calculate active members and top contributors
    const activeMembers = new Set(recentMessages.map(m => m.userId)).size;
    const messagesByUser = recentMessages.reduce((acc, msg) => {
      acc[msg.userId] = (acc[msg.userId] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    const topContributors = Object.entries(messagesByUser)
      .map(([userId, count]) => ({
        username: recentMessages.find(m => m.userId === parseInt(userId))?.user.username || 'Unknown',
        messageCount: count
      }))
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 3);

    const groupEngagement = {
      totalMembers: group.members.length,
      activeMembers,
      recentMessages: recentMessages.length,
      topContributors
    };

    // Get members who haven't read messages in the last hour and have email notifications enabled
    const inactiveMembers = await db.query.groupMembers.findMany({
      where: and(
        eq(groupMembers.groupId, parsedGroupId),
        sql`${groupMembers.userId} != ${req.user!.id}`,
        sql`${groupMembers.lastReadAt} < NOW() - INTERVAL '1 hour'`,
        eq(groupMembers.emailNotifications, true)
      ),
      with: {
        user: true
      }
    });

    console.log('[Email Notifications] Found inactive members:', {
      count: inactiveMembers.length,
      members: inactiveMembers.map(m => ({ 
        id: m.userId,
        lastRead: m.lastReadAt,
        unreadCount: m.unreadCount
      }))
    });

    // Send email notifications to inactive members
    for (const member of inactiveMembers) {
      if (member.user.email) {
        try {
          console.log('[Email Notifications] Processing for member:', {
            userId: member.userId,
            email: member.user.email,
            lastRead: member.lastReadAt,
            unreadCount: member.unreadCount
          });

          // Get unread messages for this member
          const unreadMessages = await db.query.groupMessages.findMany({
            where: and(
              eq(groupMessages.groupId, parsedGroupId),
              gt(groupMessages.createdAt, member.lastReadAt || new Date(0))
            ),
            with: {
              user: {
                columns: {
                  username: true
                }
              }
            },
            orderBy: [desc(groupMessages.createdAt)],
            limit: 5
          });

          console.log('[Email Notifications] Found unread messages:', {
            count: unreadMessages.length,
            sampleMessage: unreadMessages[0]?.content.substring(0, 50)
          });

          await sendUnreadMessagesNotification({
            userEmail: member.user.email,
            userName: member.user.username,
            groupName: group.name,
            videoTitle: group.video?.title || 'Video Discussion',
            unreadCount: member.unreadCount || unreadMessages.length,
            unreadMessages,
            groupUrl: `${process.env.APP_URL || 'http://localhost:5000'}/video/${group.video?.id}/group/${parsedGroupId}`,
            groupEngagement,
            reminderCount: member.reminderCount || 0
          });

          console.log('[Email Notifications] Successfully sent to:', member.user.email);

          // Increment reminder count
          await db
            .update(groupMembers)
            .set({ 
              reminderCount: sql`COALESCE(${groupMembers.reminderCount}, 0) + 1`
            })
            .where(and(
              eq(groupMembers.groupId, parsedGroupId),
              eq(groupMembers.userId, member.userId)
            ));

        } catch (error) {
          console.error('[Email Notifications] Failed to send:', error, {
            userId: member.userId,
            email: member.user.email
          });
        }
      }
    }

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
    console.error('[Group Messages] Error posting message:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;