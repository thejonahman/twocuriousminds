
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

export default function JoinGroup() {
  const { toast } = useToast();
  const { user, login } = useAuth();
  const [, setLocation] = useLocation();

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
        // Ensure user is logged in
        if (!user) {
          await login({ isTemporary: true });
        }

        const response = await fetch(`/api/groups/invite/${inviteCode}/join`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ videoId })
        });

        if (!response.ok) {
          throw new Error('Failed to join group');
        }

        const { group } = await response.json();
        
        if (!group?.id) {
          throw new Error('Invalid response from server');
        }

        setLocation(`/video/${videoId}/group/${group.id}`);
      } catch (error) {
        console.error('Error joining group:', error);
        toast({
          title: "Error",
          description: "Could not join the group. Please try again.",
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
          Connecting you to the discussion...
        </p>
      </CardContent>
    </Card>
  );
}
