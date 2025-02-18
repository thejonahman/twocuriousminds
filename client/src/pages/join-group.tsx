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
    // Enhanced getInviteInfo with better error handling and validation
    const getInviteInfo = () => {
      try {
        console.log('[JoinGroup] Starting invite info extraction from URL:', window.location.href);

        const urlPath = window.location.pathname;
        const urlParams = new URLSearchParams(window.location.search);

        const inviteCode = urlPath.split('/join-group/')[1];
        const videoId = urlParams.get('videoId');

        console.log('[JoinGroup] Extracted parameters:', { inviteCode, videoId, path: urlPath });

        if (!inviteCode || !videoId) {
          console.error('[JoinGroup] Missing required parameters:', { inviteCode, videoId });
          toast({
            title: "Invalid Invite Link",
            description: "The invite link is missing required information. Please check the URL.",
            variant: "destructive",
          });
          setLocation('/');
          return null;
        }

        return { inviteCode, videoId };
      } catch (error) {
        console.error('[JoinGroup] Error extracting invite info:', error);
        toast({
          title: "Error",
          description: "Failed to process the invite link. Please try again.",
          variant: "destructive",
        });
        setLocation('/');
        return null;
      }
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
          const errorText = await verifyResponse.text();
          console.error('[JoinGroup] Group verification failed:', errorText);
          throw new Error('Invalid or expired invite link');
        }

        // Join the group
        const joinResponse = await fetch(`/api/groups/invite/${inviteInfo.inviteCode}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            videoId: inviteInfo.videoId,
            role: 'admin'  // Set role to admin for persistence
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
          videoId: inviteInfo.videoId,
          timestamp: new Date().toISOString()
        });

        // Invalidate and prefetch relevant queries
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: [`/api/groups/${group.id}`] }),
          queryClient.invalidateQueries({ queryKey: [`/api/groups/${group.id}/messages`] }),
          queryClient.prefetchQuery({ 
            queryKey: [`/api/videos/${inviteInfo.videoId}`],
          })
        ]);

        // Store target location before navigation
        const targetLocation = `/video/${inviteInfo.videoId}/group/${group.id}`;
        console.log('[JoinGroup] Preparing to navigate to:', targetLocation);

        // Show success message
        toast({
          title: "Welcome!",
          description: "You've successfully joined the discussion group.",
        });

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
      console.log('[JoinGroup] Initializing join process');

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
        console.log('[JoinGroup] Navigating to target location:', targetLocation);
        setLocation(targetLocation);
      }
    };

    // Start the join process
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