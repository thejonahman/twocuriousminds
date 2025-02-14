import { Router, Response } from 'express';
import { db } from "@db";
import { and, eq } from "drizzle-orm";
import { videos, discussionGroups, groupMembers, groupMessages } from "@db/schema";
import { AuthenticatedRequest, requireAuth, asyncHandler } from "./auth";

const router = Router();

// Add the delete video endpoint near other video-related endpoints
router.delete("/api/videos/:id", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    console.log('[DELETE] Attempting to soft delete video:', req.params.id);
    const videoId = parseInt(req.params.id);

    if (isNaN(videoId)) {
      console.error('[DELETE] Invalid video ID:', req.params.id);
      return res.status(400).json({ message: "Invalid video ID" });
    }

    try {
      // Start a transaction to handle soft deletion of video and related records
      await db.transaction(async (tx) => {
        // First check if video exists and is not already deleted
        const video = await tx.query.videos.findFirst({
          where: and(
            eq(videos.id, videoId),
            eq(videos.isDeleted, false)
          )
        });

        if (!video) {
          console.error('[DELETE] Video not found or already deleted:', videoId);
          throw new Error("Video not found");
        }

        console.log('[DELETE] Found video:', video.id, 'title:', video.title);

        // Find all discussion groups for this video
        const relatedGroups = await tx.query.discussionGroups.findMany({
          where: and(
            eq(discussionGroups.videoId, videoId),
            eq(discussionGroups.isDeleted, false)
          )
        });

        // For each group, soft delete members and messages first
        for (const group of relatedGroups) {
          // Mark group members as deleted
          await tx
            .update(groupMembers)
            .set({ isDeleted: true })
            .where(and(
              eq(groupMembers.groupId, group.id),
              eq(groupMembers.isDeleted, false)
            ));

          // Mark group messages as deleted
          await tx
            .update(groupMessages)
            .set({ isDeleted: true })
            .where(and(
              eq(groupMessages.groupId, group.id),
              eq(groupMessages.isDeleted, false)
            ));

          // Mark the group itself as deleted
          await tx
            .update(discussionGroups)
            .set({ isDeleted: true })
            .where(eq(discussionGroups.id, group.id));
        }

        // Finally mark the video as deleted
        await tx
          .update(videos)
          .set({ isDeleted: true })
          .where(eq(videos.id, videoId));

        console.log('[DELETE] Successfully soft deleted video and related records:', videoId);
      });

      res.json({ message: "Video deleted successfully" });
    } catch (error) {
      console.error('[DELETE] Error soft deleting video:', error);
      if (error instanceof Error && error.message === "Video not found") {
        return res.status(404).json({ message: "Video not found" });
      }
      throw error;
    }
  }));

export default router;