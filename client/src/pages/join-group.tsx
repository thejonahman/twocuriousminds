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
    // Get invite info from URL with enhanced error handling
    const getInviteInfo = () => {
      const inviteCode = window.location.pathname.split('/join-group/')[1];
      const videoId = new URLSearchParams(window.location.search).get('videoId');

      // Validate parameters
      if (!inviteCode || !videoId) {
        console.error('Invalid join link parameters:', { inviteCode, videoId });
        toast({
          title: "Invalid Link",
          description: "The invite link appears to be invalid.",
          variant: "destructive",
        });
        setLocation('/');
        return null;
      }

      return { inviteCode, videoId };
    };

    // First, try to get invite info from URL
    const urlInviteInfo = getInviteInfo();
    if (!urlInviteInfo) return;

    // If no user, store invite info and redirect to auth
    if (!user) {
      console.log('User not logged in, storing invite info');
      sessionStorage.setItem('pendingInvite', JSON.stringify(urlInviteInfo));
      setLocation('/auth');
      return;
    }

    // Process group join with enhanced persistence
    const joinGroup = async () => {
      try {
        console.log('Processing group join:', {
          inviteCode: urlInviteInfo.inviteCode,
          videoId: urlInviteInfo.videoId,
          userId: user.id,
          timestamp: new Date().toISOString()
        });

        // First verify if the group exists and is valid
        const verifyResponse = await fetch(`/api/groups/invite/${urlInviteInfo.inviteCode}/verify`);
        if (!verifyResponse.ok) {
          throw new Error('Invalid or expired invite link');
        }

        // Join the group with admin role to ensure persistence
        const joinResponse = await fetch(`/api/groups/invite/${urlInviteInfo.inviteCode}/join`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            videoId: urlInviteInfo.videoId,
            role: 'admin'  // Set role to admin for joining users
          })
        });

        if (!joinResponse.ok) {
          throw new Error('Failed to join group');
        }

        const group = await joinResponse.json();
        console.log('Successfully joined group:', group);

        // Set up admin membership persistence
        const memberResponse = await fetch(`/api/groups/${group.id}/members`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            role: 'admin',  // Ensure admin role is set
            notificationsEnabled: true,
            emailNotifications: true
          })
        });

        if (!memberResponse.ok) {
          console.warn('Member persistence setup failed:', await memberResponse.text());
        }

        // Invalidate and prefetch relevant queries
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: [`/api/groups/${group.id}`] }),
          queryClient.invalidateQueries({ queryKey: [`/api/groups/${group.id}/messages`] }),
          queryClient.prefetchQuery({ 
            queryKey: [`/api/videos/${urlInviteInfo.videoId}`],
          })
        ]);

        toast({
          title: "Welcome!",
          description: "You've successfully joined the discussion group as an admin.",
        });

        // Redirect to the video page with the group
        setLocation(`/video/${urlInviteInfo.videoId}/group/${group.id}`);
      } catch (error) {
        console.error('Error joining group:', error);
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to join the group. Please try again.",
          variant: "destructive",
        });
        setLocation(`/video/${urlInviteInfo.videoId}`);
      }
    };

    joinGroup();
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