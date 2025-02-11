import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { type Group } from "@/lib/api-types";

export default function JoinGroup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  // Extract invite code and videoId from URL
  const inviteCode = window.location.pathname.split('/join-group/')[1];
  const videoId = new URLSearchParams(window.location.search).get('videoId');

  // Query group details from invite code
  const { data: groupData, isLoading, error } = useQuery<Group>({
    queryKey: [`/api/groups/invite/${inviteCode}`],
    enabled: !!inviteCode && !!user,
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    console.log('Join Group Effect:', { user, groupData, isLoading, error });

    // Handle authentication
    if (!user) {
      const currentPath = window.location.pathname + window.location.search;
      sessionStorage.setItem('redirectAfterAuth', currentPath);
      setLocation('/auth');
      return;
    }

    // Handle successful group join
    if (groupData && !isLoading) {
      console.log('Group data received:', groupData);

      // Verify video ID matches if provided
      if (videoId && groupData.videoId !== null && groupData.videoId.toString() !== videoId) {
        console.log('Video ID mismatch:', { expected: groupData.videoId, received: videoId });
        toast({
          title: "Error",
          description: "Invalid video for this group",
          variant: "destructive",
        });
        setLocation('/');
        return;
      }

      // Show success message
      toast({
        title: "Success",
        description: `Joined group "${groupData.name}"!`,
      });

      // Navigate to video page with group ID
      if (groupData.videoId !== null && groupData.id !== null) {
        const destination = `/video/${groupData.videoId}/group/${groupData.id}`;
        console.log('Navigating to:', destination);
        // Use direct window location change to force navigation
        window.location.replace(destination);
      } else {
        console.error('Invalid group data:', groupData);
        toast({
          title: "Error",
          description: "Invalid group data",
          variant: "destructive",
        });
        setLocation('/');
      }
    }
  }, [user, groupData, setLocation, toast, videoId, isLoading]);

  if (!user) {
    return null;
  }

  if (error) {
    return (
      <Card className="max-w-md mx-auto mt-8">
        <CardHeader>
          <CardTitle className="text-destructive">Invalid Invite Link</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            This invite link is invalid or has expired. Please request a new invite link.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-md mx-auto mt-8">
      <CardHeader>
        <CardTitle>Joining Group...</CardTitle>
      </CardHeader>
      <CardContent>
        <Progress value={isLoading ? 20 : 100} className="w-full" />
        <p className="text-sm text-muted-foreground mt-2">
          Please wait while we connect you to the group discussion...
        </p>
      </CardContent>
    </Card>
  );
}