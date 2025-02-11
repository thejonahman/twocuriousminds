import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";

export default function JoinGroup() {
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();

  // Extract invite code and videoId from URL
  const inviteCode = window.location.pathname.split('/join-group/')[1];
  const videoId = new URLSearchParams(window.location.search).get('videoId');

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      // Store current URL for post-auth redirect
      const currentUrl = window.location.href;
      console.log('Storing redirect URL:', currentUrl);
      sessionStorage.setItem('redirectUrl', currentUrl);
      window.location.replace('/auth');
      return;
    }

    if (!inviteCode || !videoId) {
      toast({
        title: "Invalid Link",
        description: "The invite link is invalid or incomplete.",
        variant: "destructive",
      });
      window.location.replace(videoId ? `/video/${videoId}` : '/');
      return;
    }

    // Join group via REST API
    const joinGroup = async () => {
      try {
        console.log('Attempting to join group with invite code:', inviteCode);
        const response = await apiRequest('GET', `/api/groups/invite/${inviteCode}`);
        const group = await response.json();
        console.log('Successfully joined group:', group);

        // Navigate to video page with group ID
        const destination = `/video/${videoId}/group/${group.id}`;
        console.log('Redirecting to:', destination);
        window.location.replace(destination);
      } catch (error) {
        console.error('Error joining group:', error);
        toast({
          title: "Error",
          description: "Failed to join the group discussion",
          variant: "destructive",
        });
        window.location.replace(`/video/${videoId}`);
      }
    };

    joinGroup();
  }, [user, authLoading, inviteCode, videoId, toast]);

  return (
    <Card className="max-w-md mx-auto mt-8">
      <CardHeader>
        <CardTitle>
          {authLoading ? "Checking authentication..." : "Joining Group..."}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Progress value={20} className="w-full" />
        <p className="text-sm text-muted-foreground mt-2">
          {authLoading
            ? "Please wait while we verify your authentication status..."
            : "Please wait while we connect you to the group discussion..."}
        </p>
      </CardContent>
    </Card>
  );
}