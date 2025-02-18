import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function JoinGroup() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    // Get invite info from URL with enhanced error handling and logging
    const getInviteInfo = () => {
      console.log('[JoinGroup] Processing URL:', window.location.href);

      const inviteCode = window.location.pathname.split('/join-group/')[1];
      const videoId = new URLSearchParams(window.location.search).get('videoId');

      console.log('[JoinGroup] Extracted parameters:', { inviteCode, videoId });

      // Validate parameters
      if (!inviteCode || !videoId) {
        console.error('[JoinGroup] Invalid parameters:', { inviteCode, videoId });
        toast({
          title: "Invalid Link",
          description: "The invite link appears to be invalid. Please check the URL.",
          variant: "destructive",
        });
        setLocation('/');
        return null;
      }

      return { inviteCode, videoId };
    };

    const processInviteAndJoin = async (inviteInfo: { inviteCode: string; videoId: string }) => {
      try {
        console.log('[JoinGroup] Starting join process:', {
          inviteCode: inviteInfo.inviteCode,
          videoId: inviteInfo.videoId,
          userId: user?.id,
          timestamp: new Date().toISOString()
        });

        // First verify if the group exists and is valid
        const verifyResponse = await fetch(`/api/groups/invite/${inviteInfo.inviteCode}/verify`);
        if (!verifyResponse.ok) {
          throw new Error('Invalid or expired invite link');
        }

        // Join the group with admin role for persistence
        const joinResponse = await fetch(`/api/groups/invite/${inviteInfo.inviteCode}/join`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            videoId: inviteInfo.videoId,
            role: 'admin'
          })
        });

        if (!joinResponse.ok) {
          const errorText = await joinResponse.text();
          console.error('[JoinGroup] Join failed:', errorText);
          throw new Error('Failed to join group');
        }

        const { group } = await joinResponse.json();
        console.log('[JoinGroup] Successfully joined group:', {
          groupId: group.id,
          videoId: inviteInfo.videoId
        });

        // Invalidate and prefetch relevant queries
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: [`/api/groups/${group.id}`] }),
          queryClient.invalidateQueries({ queryKey: [`/api/groups/${group.id}/messages`] }),
          queryClient.prefetchQuery({ 
            queryKey: [`/api/videos/${inviteInfo.videoId}`],
          })
        ]);

        toast({
          title: "Welcome!",
          description: "You've successfully joined the discussion group.",
        });

        // Store navigation target before redirect
        const targetLocation = `/video/${inviteInfo.videoId}/group/${group.id}`;
        console.log('[JoinGroup] Navigating to:', targetLocation);

        // Return location for controlled navigation
        return targetLocation;
      } catch (error) {
        console.error('[JoinGroup] Error in join process:', error);
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to join the group. Please try again.",
          variant: "destructive",
        });
        return `/video/${inviteInfo.videoId}`;
      }
    };

    const initializeJoinProcess = async () => {
      // First, try to get invite info from URL
      const inviteInfo = getInviteInfo();
      if (!inviteInfo) {
        console.log('[JoinGroup] No valid invite info found');
        return;
      }

      // If no user, store invite info and redirect to auth
      if (!user) {
        console.log('[JoinGroup] User not logged in, storing invite info');
        sessionStorage.setItem('pendingInvite', JSON.stringify(inviteInfo));
        setLocation('/auth');
        return;
      }

      // Process the join request and handle navigation
      const targetLocation = await processInviteAndJoin(inviteInfo);
      if (targetLocation) {
        console.log('[JoinGroup] Navigation target:', targetLocation);
        setLocation(targetLocation);
      }
    };

    initializeJoinProcess();
  }, [toast, setLocation, user, queryClient]);

  return (
    <Card className="max-w-md mx-auto mt-8">
      <CardHeader>
        <CardTitle>Joining discussion group...</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center gap-4 p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <Progress value={100} className="w-[60%]" />
      </CardContent>
    </Card>
  );
}