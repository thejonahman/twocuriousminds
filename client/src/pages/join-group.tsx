import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

export default function JoinGroup() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Extract invite code from URL
  const inviteCode = window.location.pathname.split('/join-group/')[1];

  // Query group details from invite code
  const { data: groupData, isLoading, error } = useQuery({
    queryKey: [`/api/groups/invite/${inviteCode}`],
    enabled: !!inviteCode && !!user,
  });

  useEffect(() => {
    if (!user) {
      // Store the invite URL in sessionStorage to redirect back after auth
      sessionStorage.setItem('redirectAfterAuth', window.location.pathname);
      navigate('/auth');
      return;
    }

    if (groupData) {
      toast({
        title: "Success",
        description: `Joined group "${groupData.name}"!`,
      });
      navigate(`/video/${groupData.videoId}`);
    }
  }, [user, groupData, navigate, toast]);

  if (!user) {
    return null; // Will redirect to auth
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
        <Progress value={100} className="w-full" />
      </CardContent>
    </Card>
  );
}
