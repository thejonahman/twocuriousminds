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

  // Handle authentication state
  useEffect(() => {
    console.log('Join Group Auth Effect:', { user, authLoading });

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

    // If we're authenticated but missing required params, redirect
    if (!inviteCode || !videoId) {
      console.log('Missing required parameters:', { inviteCode, videoId });
      toast({
        title: "Invalid Link",
        description: "The invite link is invalid or incomplete.",
        variant: "destructive",
      });
      window.location.replace(videoId ? `/video/${videoId}` : '/');
      return;
    }

    // Set up WebSocket connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected, sending join group request');
      // Add a slight delay to ensure WebSocket is fully ready
      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'join_group',
          inviteCode,
          videoId: parseInt(videoId, 10),
        }));
      }, 500);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Received websocket message:', data);

        if (data.type === 'group_joined') {
          console.log('Successfully joined group:', data.data);
          const group = data.data;

          // Navigate to video page with group ID
          const destination = `/video/${videoId}/group/${group.id}`;
          console.log('Navigating to:', destination);
          window.location.replace(destination);
        } else if (data.type === 'error') {
          toast({
            title: "Error",
            description: data.message,
            variant: "destructive",
          });
          // Redirect to video page since we have the videoId
          window.location.replace(`/video/${videoId}`);
        }
      } catch (error) {
        console.error('Error processing message:', error);
        toast({
          title: "Error",
          description: "Failed to process server response",
          variant: "destructive",
        });
        // Redirect to video page since we have the videoId
        window.location.replace(`/video/${videoId}`);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      toast({
        title: "Connection Error",
        description: "Failed to connect to chat server",
        variant: "destructive",
      });
      // Redirect to video page since we have the videoId
      window.location.replace(`/video/${videoId}`);
    };

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
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