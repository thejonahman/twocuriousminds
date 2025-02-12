import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Send, MessageSquare, Plus, Users } from "lucide-react";
import { 
  type Message, 
  type Group, 
  type WSMessage, 
  validateApiResponse, 
  messageSchema, 
  groupSchema, 
  wsMessageSchema 
} from "@/lib/api-types";
import { z } from "zod";
import { useLocation } from "wouter";
import { ShareButton } from "@/components/ui/share-button";
import { useWebSocket } from "@/hooks/use-websocket";

interface DiscussionGroupProps {
  videoId: number;
  initialGroupId?: number;
}

// Define a type for video data
interface VideoData {
  title?: string;
  description?: string;
}

export function DiscussionGroup({ videoId, initialGroupId }: DiscussionGroupProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [messageInput, setMessageInput] = useState("");
  const [groupNameInput, setGroupNameInput] = useState("");
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const { wsState, sendMessage: wsSendMessage, addMessageHandler } = useWebSocket();

  // Query for group if initialGroupId is provided
  const { data: group, isLoading: isLoadingGroup } = useQuery<Group>({
    queryKey: [`/api/groups/${initialGroupId}`],
    enabled: !!initialGroupId && !!user,
    select: (data) => validateApiResponse(groupSchema, data),
  });

  // Add query for user's last active group in this video
  const { data: lastActiveGroup } = useQuery<Group>({
    queryKey: [`/api/videos/${videoId}/last-active-group`],
    enabled: !!videoId && !!user && !initialGroupId,
    select: (data) => validateApiResponse(groupSchema, data),
  });

  // Set initial group when data is loaded
  useEffect(() => {
    if (group && !currentGroup) {
      console.log('Setting initial group:', group);
      setCurrentGroup(group);
      // Update URL to include group ID if not already present
      const currentPath = window.location.pathname;
      if (!currentPath.includes('/group/')) {
        setLocation(`/video/${videoId}/group/${group.id}`);
      }
    }
  }, [group, currentGroup, videoId, setLocation]);

  // Handle last active group
  useEffect(() => {
    if (lastActiveGroup && !currentGroup && !initialGroupId) {
      console.log('Setting last active group:', lastActiveGroup);
      setCurrentGroup(lastActiveGroup);
      setLocation(`/video/${videoId}/group/${lastActiveGroup.id}`);
    }
  }, [lastActiveGroup, currentGroup, initialGroupId, videoId, setLocation]);

  // Query for video data
  const { data: videoData } = useQuery<VideoData>({
    queryKey: [`/api/videos/${videoId}`],
    enabled: !!videoId,
  });

  // Query for video messages
  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<Message[]>({
    queryKey: ['/api/messages', videoId],
    enabled: !!user && !!videoId && !currentGroup,
    select: (data) => validateApiResponse(z.array(messageSchema), data),
  });

  // Update group messages query
  const { data: groupMessages = [], isLoading: isLoadingGroupMessages } = useQuery<Message[]>({
    queryKey: ['/api/group-messages', currentGroup?.id],
    enabled: !!user && !!currentGroup?.id,
    select: (data) => validateApiResponse(z.array(messageSchema), data),
    initialData: currentGroup?.messages || [],
  });

  // Connection status effect
  useEffect(() => {
    if (!wsState.connected && !wsState.connecting) {
      setConnectionError("Disconnected from chat server. Attempting to reconnect...");
    } else if (wsState.connected) {
      setConnectionError(null);
    }
    setIsConnecting(wsState.connecting);
  }, [wsState]);

  // Handle WebSocket messages
  useEffect(() => {
    if (!user) return;

    const cleanup = addMessageHandler((event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[Discussion] Received websocket message:', data);

        const message = validateApiResponse(wsMessageSchema, data);

        switch (message.type) {
          case 'new_message':
            if (!currentGroup) {
              queryClient.invalidateQueries({ queryKey: ['/api/messages', videoId] });
              messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }
            break;

          case 'new_group_message':
            if (currentGroup && message.data.groupId === currentGroup.id) {
              queryClient.invalidateQueries({ queryKey: ['/api/group-messages', currentGroup.id] });
              if (document.hidden) {
                setUnreadCount(prev => prev + 1);
              }
              messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }
            break;

          case 'group_created':
            console.log("[Discussion] Group Created:", message.data);
            const newGroup = validateApiResponse(groupSchema, message.data);
            setCurrentGroup(newGroup);
            setIsCreateGroupOpen(false);
            queryClient.invalidateQueries({ queryKey: ['/api/group-messages', newGroup.id] });
            setLocation(`/video/${videoId}/group/${newGroup.id}`);

            toast({
              title: "Success",
              description: `Group "${newGroup.name}" created! Share the link with friends to join the discussion.`,
            });
            break;

          case 'error':
            console.error('[Discussion] Server error:', message.message);
            toast({
              title: "Error",
              description: message.message,
              variant: "destructive",
            });
            break;
        }
      } catch (error) {
        console.error('[Discussion] Message processing error:', error);
      }
    });

    return cleanup;
  }, [user, currentGroup, videoId, queryClient, setLocation, toast, addMessageHandler]);

  // Add loading state component
  if (!user) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Discussion</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground">
            Please sign in to participate in discussions
          </p>
        </CardContent>
      </Card>
    );
  }

  const isLoading = isLoadingGroup || isLoadingMessages || isLoadingGroupMessages || isConnecting;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Discussion</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-4 p-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">
              {isConnecting ? 'Connecting to chat...' : 'Loading messages...'}
            </p>
            {connectionError && (
              <p className="text-sm text-destructive">{connectionError}</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const generateShareUrl = () => {
    const baseUrl = window.location.origin;
    if (!currentGroup?.id) {
      console.error('No group ID available for sharing');
      return '';
    }
    return `${baseUrl}/video/${videoId}/group/${currentGroup.id}`;
  };

  const sendMessage = () => {
    if (!wsState.connected) {
      toast({
        title: "Error",
        description: "Not connected to chat server",
        variant: "destructive",
      });
      return;
    }

    const messageData = currentGroup ? {
      type: 'group_message',
      groupId: currentGroup.id,
      content: messageInput,
    } : {
      type: 'message',
      videoId,
      content: messageInput,
    };

    // Add optimistic update
    const optimisticMessage: Message = {
      id: Date.now(),
      content: messageInput,
      userId: user!.id,
      createdAt: new Date().toISOString(),
      user: {
        username: user!.username,
      },
      ...(currentGroup ? { groupId: currentGroup.id } : { videoId }),
    };

    // Update the appropriate query with the optimistic message
    const queryKey = currentGroup
      ? ['/api/group-messages', currentGroup.id]
      : ['/api/messages', videoId];

    queryClient.setQueryData<Message[]>(queryKey, (old = []) => {
      return [...old, optimisticMessage];
    });

    console.log('Sending WebSocket message:', messageData);
    wsSendMessage(messageData);
    setMessageInput('');

    // Scroll to bottom after sending
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const createGroup = () => {
    if (!wsState.connected) {
      toast({
        title: "Error",
        description: "Not connected to server",
        variant: "destructive",
      });
      return;
    }

    const groupName = groupNameInput.trim() || videoData?.title || "Discussion Group";
    const createGroupData = {
      type: 'create_group',
      name: groupName,
      videoId,
      description: `Discussion group for ${videoData?.title || 'video'}`,
    };

    console.log('Sending create group request:', createGroupData);
    wsSendMessage(createGroupData);
    setGroupNameInput('');
  };

  const leaveGroup = () => {
    setCurrentGroup(null);
    // Clear stored group ID when leaving
    localStorage.removeItem(`lastGroupId-${videoId}`);
    // Update URL to remove group ID
    setLocation(`/video/${videoId}`);
  };

  // Update display messages to show in chronological order (oldest first)
  const sortedMessages = [...(currentGroup ? groupMessages : messages)].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  // Auto-scroll when new messages arrive
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      const container = messagesEndRef.current.parentElement;
      if (container) {
        // Only smooth scroll if user is near bottom
        const shouldSmoothScroll =
          container.scrollHeight - container.scrollTop - container.clientHeight < 100;

        messagesEndRef.current.scrollIntoView({
          behavior: shouldSmoothScroll ? "smooth" : "auto"
        });
      }
    }
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [sortedMessages.length, scrollToBottom]);

  useEffect(() => {
    if (currentGroup && user) {
      // Query for unread count
      const fetchUnreadCount = async () => {
        try {
          const response = await fetch(`/api/groups/${currentGroup.id}/unread-count`);
          if (response.ok) {
            const data = await response.json();
            setUnreadCount(data.unreadCount);
          }
        } catch (error) {
          console.error('Error fetching unread count:', error);
        }
      };

      fetchUnreadCount();
    }
  }, [currentGroup, user]);

  useEffect(() => {
    if (currentGroup && user && document.visibilityState === 'visible') {
      const markAsRead = async () => {
        try {
          await fetch(`/api/groups/${currentGroup.id}/mark-read`, {
            method: 'POST',
          });
          setUnreadCount(0);
        } catch (error) {
          console.error('Error marking messages as read:', error);
        }
      };

      markAsRead();
    }
  }, [currentGroup, user, sortedMessages.length]);

  // Handle visibility change to mark messages as read when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && currentGroup && user) {
        fetch(`/api/groups/${currentGroup.id}/mark-read`, {
          method: 'POST',
        }).catch(console.error);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentGroup, user]);


  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {currentGroup ? (
              <>
                <Users className="h-5 w-5" />
                {currentGroup.name}
                {unreadCount > 0 && (
                  <span className="bg-primary text-primary-foreground rounded-full px-2 py-1 text-xs">
                    {unreadCount}
                  </span>
                )}
              </>
            ) : (
              <>
                <MessageSquare className="h-5 w-5" />
                Discussion
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {currentGroup && (
              <>
                <ShareButton
                  url={generateShareUrl()}
                  title={`Join our discussion: ${currentGroup.name}`}
                  text={`Join our discussion group for "${videoData?.title}". Click the link to join!`}
                  className="gap-2"
                />
                <Button variant="outline" size="sm" onClick={leaveGroup}>
                  Leave Group
                </Button>
              </>
            )}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="flex items-center justify-between gap-2 mb-4">
          {!currentGroup && (
            <div className="flex items-center gap-2">
              <Dialog open={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Group
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Discussion Group</DialogTitle>
                    <DialogDescription>
                      Create a group to discuss this video with friends. You'll get a shareable link after creating the group.
                    </DialogDescription>
                  </DialogHeader>
                  <Input
                    value={groupNameInput}
                    onChange={(e) => setGroupNameInput(e.target.value)}
                    placeholder={videoData?.title || "Group name..."}
                    className="mb-2"
                  />
                  <DialogFooter>
                    <Button onClick={createGroup} disabled={!wsState.connected}>
                      Create Group
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>

        <div className="h-[300px] space-y-4 overflow-y-auto p-4 border rounded-lg">
          {sortedMessages.length === 0 && (
            <p className="text-center text-muted-foreground">
              No messages yet. Start the conversation!
            </p>
          )}
          {sortedMessages.map((message) => (
            <div
              key={message.id}
              className={`flex flex-col ${
                message.userId === user?.id ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`rounded-lg px-4 py-2 ${
                  message.userId === user?.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{message.user.username}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(message.createdAt).toLocaleTimeString()}
                  </p>
                </div>
                <p>{message.content}</p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </CardContent>

      <CardFooter>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (messageInput.trim()) {
              sendMessage();
            }
          }}
          className="flex w-full items-center gap-2"
        >
          <Input
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder={`Type your message${currentGroup ? ' to group' : ''}...`}
            className="flex-1"
            disabled={!wsState.connected}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!messageInput.trim() || !wsState.connected}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}