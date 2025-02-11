import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

export default function JoinGroup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const socketRef = useRef<WebSocket | null>(null);

  // Extract invite code and videoId from URL
  const inviteCode = window.location.pathname.split('/join-group/')[1];
  const videoId = new URLSearchParams(window.location.search).get('videoId');

  console.log('JoinGroup component mounted:', { inviteCode, videoId, user, authLoading });

  // Set up WebSocket connection
  useEffect(() => {
    if (!user || !inviteCode || !videoId) {
      console.log('Missing required parameters:', { user, inviteCode, videoId });
      toast({
        title: "Invalid Link",
        description: "The invite link is invalid or incomplete.",
        variant: "destructive",
      });
      setLocation('/');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected, sending join group request');
      ws.send(JSON.stringify({
        type: 'join_group',
        inviteCode,
        videoId: parseInt(videoId, 10),
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Received websocket message:', data);

        if (data.type === 'group_joined') {
          console.log('Successfully joined group:', data.data);
          const group = data.data;

          // Navigate to video page with group ID
          const destination = `/video/${group.videoId}/group/${group.id}`;
          console.log('Navigating to:', destination);
          window.location.replace(destination);
        } else if (data.type === 'error') {
          toast({
            title: "Error",
            description: data.message,
            variant: "destructive",
          });
          // Redirect to video page if we have videoId
          if (videoId) {
            setLocation(`/video/${videoId}`);
          } else {
            setLocation('/');
          }
        }
      } catch (error) {
        console.error('Error processing message:', error);
        toast({
          title: "Error",
          description: "Failed to process server response",
          variant: "destructive",
        });
        setLocation('/');
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      toast({
        title: "Connection Error",
        description: "Failed to connect to chat server",
        variant: "destructive",
      });
    };

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [user, inviteCode, videoId, toast, setLocation]);

  // Handle authentication state
  useEffect(() => {
    console.log('Join Group Effect:', { user, authLoading });

    // Only proceed if auth loading is complete
    if (authLoading) {
      console.log('Auth state is still loading...');
      return;
    }

    // Handle authentication
    if (!user) {
      console.log('User not authenticated, storing navigation data and redirecting to auth');
      // Store the current path and search params for post-auth redirect
      sessionStorage.setItem('targetType', 'join-group');
      sessionStorage.setItem('targetId', videoId || '');
      sessionStorage.setItem('inviteCode', inviteCode);

      // Redirect to auth page
      console.log('Redirecting to auth page');
      window.location.replace('/auth');
      return;
    }
  }, [user, authLoading, videoId, inviteCode]);

  if (authLoading) {
    return (
      <Card className="max-w-md mx-auto mt-8">
        <CardHeader>
          <CardTitle>Checking authentication...</CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={20} className="w-full" />
          <p className="text-sm text-muted-foreground mt-2">
            Please wait while we verify your authentication status...
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <Card className="max-w-md mx-auto mt-8">
      <CardHeader>
        <CardTitle>Joining Group...</CardTitle>
      </CardHeader>
      <CardContent>
        <Progress value={20} className="w-full" />
        <p className="text-sm text-muted-foreground mt-2">
          Please wait while we connect you to the group discussion...
        </p>
      </CardContent>
    </Card>
  );
}