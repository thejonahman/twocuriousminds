import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

export default function JoinGroup() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

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

    // If we reach here, we have both a valid invite and a logged-in user
    console.log('Redirecting to auth page to handle group join');
    sessionStorage.setItem('pendingInvite', JSON.stringify({ inviteCode, videoId }));
    setLocation('/auth');
  }, [inviteCode, videoId, toast, setLocation, user]);

  return (
    <Card className="max-w-md mx-auto mt-8">
      <CardHeader>
        <CardTitle>Preparing to join discussion...</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </CardContent>
    </Card>
  );
}