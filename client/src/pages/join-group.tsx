import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

export default function JoinGroup() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [progress, setProgress] = useState(20);

  // Get invite code from URL path and video ID from query params
  const inviteCode = window.location.pathname.split('/join-group/')[1];
  const videoId = new URLSearchParams(window.location.search).get('videoId');

  useEffect(() => {
    const joinGroup = async () => {
      if (!inviteCode || !videoId) {
        toast({
          title: "Invalid Link",
          description: "The invite link appears to be invalid.",
          variant: "destructive",
        });
        setLocation('/');
        return;
      }

      try {
        // Show progress indicator
        setProgress(40);

        // Join group in a single request
        const response = await fetch(`/api/groups/invite/${inviteCode}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId })
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        setProgress(80);
        const { group } = await response.json();

        if (!group?.id) {
          throw new Error('Invalid response from server');
        }

        setProgress(100);
        // Redirect to video page with group context
        setLocation(`/video/${videoId}/group/${group.id}`);

        toast({
          title: "Welcome to the discussion!",
          description: "You've successfully joined the group.",
        });
      } catch (error) {
        console.error('Error joining group:', error);
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Could not join the group",
          variant: "destructive",
        });
        setLocation(`/video/${videoId}`);
      }
    };

    if (user) {
      joinGroup();
    } else {
      // If user is not logged in, redirect to auth page with return URL
      const returnUrl = `/join-group/${inviteCode}?videoId=${videoId}`;
      setLocation(`/auth?returnUrl=${encodeURIComponent(returnUrl)}`);
    }
  }, [inviteCode, videoId, toast, setLocation, user]);

  return (
    <Card className="max-w-md mx-auto mt-8">
      <CardHeader>
        <CardTitle>Joining Discussion Group...</CardTitle>
      </CardHeader>
      <CardContent>
        <Progress value={progress} className="w-full" />
        <p className="text-sm text-muted-foreground mt-2">
          {progress < 40 && "Preparing to join..."}
          {progress >= 40 && progress < 80 && "Joining discussion group..."}
          {progress >= 80 && "Redirecting to discussion..."}
        </p>
      </CardContent>
    </Card>
  );
}