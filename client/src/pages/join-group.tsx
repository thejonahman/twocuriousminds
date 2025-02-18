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
  const inviteCode = window.location.pathname.split('/join-group/')[1];
  const videoId = new URLSearchParams(window.location.search).get('videoId');

  useEffect(() => {
    if (!inviteCode || !videoId) {
      console.error('Invalid join link parameters:', { inviteCode, videoId });
      toast({
        title: "Invalid Link",
        description: "The invite link appears to be invalid.",
        variant: "destructive",
      });
      setLocation('/');
      return;
    }

    if (!user) {
      console.log('User not logged in, storing invite info');
      // Store invite info and redirect to auth
      sessionStorage.setItem('pendingInvite', JSON.stringify({ inviteCode, videoId }));
      setLocation('/auth');
      return;
    }

    // Process group join with enhanced persistence
    const joinGroup = async () => {
      try {
        console.log('Joining group with invite code:', inviteCode);
        const response = await fetch(`/api/groups/invite/${inviteCode}/join`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ videoId })
        });

        if (!response.ok) {
          throw new Error('Failed to join group');
        }

        const group = await response.json();
        console.log('Successfully joined group:', group);

        // Invalidate existing queries to ensure fresh data
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: [`/api/groups/${group.id}`] }),
          queryClient.invalidateQueries({ queryKey: [`/api/groups/${group.id}/messages`] })
        ]);

        // Set up persistence by calling the members endpoint
        const memberResponse = await fetch(`/api/groups/${group.id}/members`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            notificationsEnabled: true,
            emailNotifications: true
          })
        });

        if (!memberResponse.ok) {
          console.warn('Member persistence setup failed:', await memberResponse.text());
        }

        toast({
          title: "Welcome!",
          description: "You've successfully joined the discussion group.",
        });

        // Redirect to the video page with the group
        setLocation(`/video/${videoId}/group/${group.id}`);
      } catch (error) {
        console.error('Error joining group:', error);
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to join the group. Please try again.",
          variant: "destructive",
        });
        setLocation(`/video/${videoId}`);
      }
    };

    joinGroup();
  }, [inviteCode, videoId, toast, setLocation, user, queryClient]);

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