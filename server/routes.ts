import { Router, Response } from 'express';
import { db } from "@db";
import { and, eq, desc } from "drizzle-orm";
import { videos, discussionGroups, groupMembers, groupMessages } from "@db/schema";
import { AuthenticatedRequest, requireAuth, asyncHandler } from "./auth";

const router = Router();

// Get all videos (non-deleted)
router.get("/api/videos", asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log('[GET Videos] Fetching non-deleted videos...');
    const allVideos = await db.query.videos.findMany({
      where: eq(videos.isDeleted, false),
      orderBy: [desc(videos.createdAt)]
    });

    console.log('[GET Videos] Found videos:', {
      count: allVideos.length,
      sampleVideo: allVideos[0] ? {
        id: allVideos[0].id,
        title: allVideos[0].title
      } : null
    });

    res.json(allVideos);
  } catch (error) {
    console.error('[GET Videos] Error:', error);
    res.status(500).json({ error: "Failed to fetch videos" });
  }
}));

// Add the delete video endpoint near other video-related endpoints
router.delete("/api/videos/:id", asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  console.log('[DELETE] Attempting to soft delete video:', req.params.id);
  const videoId = parseInt(req.params.id);

  if (isNaN(videoId)) {
    console.error('[DELETE] Invalid video ID:', req.params.id);
    return res.status(400).json({ error: "Invalid video ID" });
  }

  try {
    // Start a transaction to handle soft deletion of video and related records
    await db.transaction(async (tx) => {
      try {
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

        try {
          // Find all discussion groups for this video
          const relatedGroups = await tx.query.discussionGroups.findMany({
            where: and(
              eq(discussionGroups.videoId, videoId),
              eq(discussionGroups.isDeleted, false)
            )
          });

          console.log('[DELETE] Found related groups:', relatedGroups.length);

          // For each group, soft delete members and messages first
          for (const group of relatedGroups) {
            console.log('[DELETE] Processing group:', group.id);

            try {
              // Mark group members as deleted
              await tx
                .update(groupMembers)
                .set({ isDeleted: true })
                .where(and(
                  eq(groupMembers.groupId, group.id),
                  eq(groupMembers.isDeleted, false)
                ));
              console.log('[DELETE] Updated members for group:', group.id);

              // Mark group messages as deleted
              await tx
                .update(groupMessages)
                .set({ isDeleted: true })
                .where(and(
                  eq(groupMessages.groupId, group.id),
                  eq(groupMessages.isDeleted, false)
                ));
              console.log('[DELETE] Updated messages for group:', group.id);

              // Mark the group itself as deleted
              await tx
                .update(discussionGroups)
                .set({ isDeleted: true })
                .where(eq(discussionGroups.id, group.id));
              console.log('[DELETE] Updated group:', group.id);
            } catch (groupError) {
              console.error('[DELETE] Error processing group:', group.id, groupError);
              throw groupError;
            }
          }

          // Finally mark the video as deleted
          await tx
            .update(videos)
            .set({ isDeleted: true })
            .where(eq(videos.id, videoId));
          console.log('[DELETE] Updated video:', videoId);

          console.log('[DELETE] Successfully soft deleted video and related records:', videoId);
        } catch (innerError) {
          console.error('[DELETE] Error during deletion process:', innerError);
          throw innerError;
        }
      } catch (txError) {
        console.error('[DELETE] Transaction error:', txError);
        throw txError;
      }
    });

    res.json({ message: "Video deleted successfully" });
  } catch (error) {
    console.error('[DELETE] Error soft deleting video:', error);
    if (error instanceof Error) {
      console.error('[DELETE] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });

      if (error.message === "Video not found") {
        return res.status(404).json({ error: "Video not found" });
      }
    }
    res.status(500).json({ error: "Failed to delete video. Please try again." });
  }
}));

export default router;