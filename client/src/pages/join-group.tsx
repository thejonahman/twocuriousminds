import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";

export default function JoinGroup() {
  const { toast } = useToast();
  const { user, login } = useAuth();
  const [, setLocation] = useLocation();

  // Extract invite code and videoId from URL
  const inviteCode = window.location.pathname.split('/join-group/')[1];
  const videoId = new URLSearchParams(window.location.search).get('videoId');

  useEffect(() => {
    const joinGroup = async () => {
      if (!inviteCode || !videoId) {
        toast({
          title: "Invalid Link",
          description: "The invite link is invalid or incomplete.",
          variant: "destructive",
        });
        setLocation('/');
        return;
      }

      try {
        // If not logged in, create a temporary session
        if (!user) {
          await login({ isTemporary: true });
        }

        const response = await apiRequest('POST', `/api/groups/invite/${inviteCode}/join`, {
          videoId
        });

        if (!response.ok) {
          throw new Error('Failed to join group');
        }

        const data = await response.json();
        if (!data.group || !data.group.id) {
          throw new Error('Invalid group data received');
        }
        
        // Navigate directly to the group after joining
        setLocation(`/video/${videoId}/group/${data.group.id}`);
      } catch (error) {
        console.error('Error joining group:', error);
        toast({
          title: "Error",
          description: "Failed to join the group discussion. Please try again.",
          variant: "destructive",
        });
        setLocation(`/video/${videoId}`);
      }
    };

    joinGroup();
  }, [inviteCode, videoId, user, login, toast, setLocation]);

  return (
    <Card className="max-w-md mx-auto mt-8">
      <CardHeader>
        <CardTitle>Joining Group Discussion...</CardTitle>
      </CardHeader>
      <CardContent>
        <Progress value={40} className="w-full" />
        <p className="text-sm text-muted-foreground mt-2">
          Please wait while we connect you to the group discussion...
        </p>
      </CardContent>
    </Card>
  );
}