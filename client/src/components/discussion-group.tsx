import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, MessageSquare, Plus, Users } from "lucide-react";
import { Card, CardHeader, CardContent, CardFooter, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { Message, DiscussionGroup, validateApiResponse, messageSchema, discussionGroupSchema, GroupMessage, WSMessage } from "@/lib/api-types";
import { z } from "zod";
import { ShareGroupDialog } from "@/components/ui/share-group-dialog";
import { VirtualizedMessageList } from "@/components/ui/virtualized-message-list";
import { useWebSocket } from "@/hooks/use-websocket";

interface Props {
  videoId: number;
  initialGroupId?: number;
}

interface VideoData {
  title?: string;
  description?: string;
}

export function DiscussionGroupComponent({ videoId, initialGroupId }: Props) {
  // Hooks
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { state: wsState, sendMessage: sendWsMessage, addMessageHandler } = useWebSocket();

  // State
  const [messageInput, setMessageInput] = useState("");
  const [groupNameInput, setGroupNameInput] = useState("");
  const [currentGroup, setCurrentGroup] = useState<DiscussionGroup | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [restorationAttempted, setRestorationAttempted] = useState(false);

  // Debug logging with memoization
  const logDebug = useCallback((action: string, data: unknown) => {
    console.log(`[DiscussionGroupComponent ${new Date().toISOString()}] ${action}:`, data);
  }, []);

  // Message handler for WebSocket messages
  const handleNewMessages = useCallback((data: WSMessage) => {
    if (!currentGroup || data.type !== 'new_message' || data.data.groupId !== currentGroup.id) return;

    logDebug('WebSocket message received', data);

    queryClient.setQueryData<Message[]>(
      [`/api/groups/${currentGroup.id}/messages`],
      old => [...(old || []), data.data]
    );

    if (document.hidden) {
      setUnreadCount(prev => prev + 1);
    } else {
      fetch(`/api/groups/${currentGroup.id}/mark-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).catch(error => {
        console.error('Failed to mark messages as read:', error);
      });
      setUnreadCount(0);
    }
  }, [currentGroup, queryClient, logDebug]);

  // Optimized message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!currentGroup) throw new Error('No active group');

      const message = {
        type: 'new_message',
        groupId: currentGroup.id,
        content,
        timestamp: new Date().toISOString()
      };

      // Send via WebSocket first for instant feedback
      sendWsMessage(message);

      // Then persist to database
      const response = await fetch(`/api/groups/${currentGroup.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });

      if (!response.ok) throw new Error('Failed to send message');
      return response.json();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      });
    }
  });

  // Message submission handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !currentGroup) return;

    const content = messageInput.trim();
    setMessageInput(""); // Clear input immediately for better UX

    try {
      await sendMessageMutation.mutateAsync(content);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      // Error handled by mutation callbacks
      setMessageInput(content); // Restore input on error
    }
  };

  // Setup WebSocket message handler
  useEffect(() => {
    if (!user || !currentGroup) return;

    const cleanup = addMessageHandler(handleNewMessages);

    // Handle visibility change
    const handleVisibilityChange = () => {
      if (!document.hidden && unreadCount > 0 && currentGroup) {
        fetch(`/api/groups/${currentGroup.id}/mark-read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }).catch(console.error);
        setUnreadCount(0);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cleanup();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, currentGroup, handleNewMessages, unreadCount, addMessageHandler]);


  const { data: group, isLoading: isGroupLoading } = useQuery<DiscussionGroup, Error>({
    queryKey: [`/api/groups/${initialGroupId}`],
    enabled: !!initialGroupId && !!user,
    select: useCallback((data: unknown) => {
      try {
        const validated = validateApiResponse(discussionGroupSchema, data);
        if (!validated) throw new Error('Invalid group data');
        return validated;
      } catch (error) {
        console.error('Group validation error:', error);
        throw error;
      }
    }, []),
    retry: (failureCount, error) => {
      return failureCount < 3 && !error.message.includes('Invalid group data');
    },
    staleTime: 30000,
    gcTime: 5 * 60 * 1000,
  });

  const { data: lastActiveGroup, isLoading: isLastActiveLoading } = useQuery<DiscussionGroup, Error>({
    queryKey: [`/api/videos/${videoId}/last-active-group`],
    enabled: !!videoId && !!user && !initialGroupId && !currentGroup,
    select: useCallback((data: unknown) => {
      try {
        const validated = validateApiResponse(discussionGroupSchema, data);
        if (!validated) throw new Error('Invalid group data');
        return validated;
      } catch (error) {
        console.error('Group validation error:', error);
        throw error;
      }
    }, []),
    retry: 3,
    staleTime: 30000,
  });

  const { data: videoData } = useQuery<VideoData>({
    queryKey: [`/api/videos/${videoId}`],
    enabled: !!videoId,
  });

  const { data: messages = [], isLoading: isMessagesLoading } = useQuery<Message[], Error>({
    queryKey: [`/api/groups/${currentGroup?.id}/messages`],
    enabled: !!currentGroup?.id && !!user,
    select: useCallback((data: unknown) => {
      try {
        return validateApiResponse(z.array(messageSchema), data);
      } catch (error) {
        console.error('Message validation error:', error);
        return [];
      }
    }, []),
    staleTime: 1000,
  });

  // Group restoration effect
  useEffect(() => {
    if (!user || restorationAttempted) return;

    const restoreGroup = async () => {
      try {
        logDebug('Starting group restoration', { videoId, initialGroupId });

        // If we have an initialGroupId from URL, use that
        if (initialGroupId && group) {
          logDebug('Restoring from URL group ID', { groupId: initialGroupId });
          setCurrentGroup(group);
          localStorage.setItem(`activeGroup-${videoId}`, group.id.toString());
          return;
        }

        // Check localStorage for previously active group
        const storedGroupId = localStorage.getItem(`activeGroup-${videoId}`);
        logDebug('Checking stored group', { storedGroupId });

        if (storedGroupId) {
          const groupId = parseInt(storedGroupId);
          if (!isNaN(groupId)) {
            try {
              const response = await fetch(`/api/groups/${groupId}`);
              if (!response.ok) throw new Error('Failed to fetch stored group');

              const storedGroup = await response.json();
              logDebug('Successfully restored stored group', { groupId: storedGroup.id });
              setCurrentGroup(storedGroup);
              setLocation(`/video/${videoId}/group/${storedGroup.id}`);
              return;
            } catch (error) {
              logDebug('Failed to restore stored group', { error });
              localStorage.removeItem(`activeGroup-${videoId}`);
            }
          }
        }

        // Fall back to last active group if available
        if (lastActiveGroup) {
          const lastLeftGroup = sessionStorage.getItem('lastLeftGroup');
          const lastLeftTime = sessionStorage.getItem('lastLeftTime');
          const timeSinceLeft = lastLeftTime ? Date.now() - parseInt(lastLeftTime) : Infinity;
          const REJOIN_TIMEOUT = 5 * 60 * 1000;

          if (lastLeftGroup === lastActiveGroup.id.toString() && timeSinceLeft < REJOIN_TIMEOUT) {
            logDebug('Skipping last active group due to recent leave', {
              lastLeftGroup,
              timeSinceLeft
            });
            return;
          }

          logDebug('Restoring last active group', { groupId: lastActiveGroup.id });
          setCurrentGroup(lastActiveGroup);
          setLocation(`/video/${videoId}/group/${lastActiveGroup.id}`);
          localStorage.setItem(`activeGroup-${videoId}`, lastActiveGroup.id.toString());
        }
      } catch (error) {
        logDebug('Error during group restoration', { error });
      } finally {
        setRestorationAttempted(true);
      }
    };

    restoreGroup();
  }, [user, videoId, initialGroupId, group, lastActiveGroup, setLocation, restorationAttempted]);

  // State persistence effect
  useEffect(() => {
    const persistGroupState = () => {
      if (currentGroup) {
        logDebug('Persisting group state', {
          videoId,
          groupId: currentGroup.id,
          timestamp: Date.now()
        });
        localStorage.setItem(`activeGroup-${videoId}`, currentGroup.id.toString());
      }
    };

    // Handle page unload
    window.addEventListener('beforeunload', persistGroupState);

    // Handle SPA navigation
    const handleRouteChange = () => {
      logDebug('Route change detected', { currentPath: window.location.pathname });
      persistGroupState();
    };

    window.addEventListener('popstate', handleRouteChange);

    // Cleanup
    return () => {
      window.removeEventListener('beforeunload', persistGroupState);
      window.removeEventListener('popstate', handleRouteChange);
      persistGroupState();
    };
  }, [currentGroup, videoId]);


  const handleCreateGroup = async () => {
    const groupName = groupNameInput.trim() || videoData?.title || "Discussion Group";
    try {
      logDebug('Creating group', { groupName, videoId });
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: groupName,
          videoId,
          description: `Discussion group for ${videoData?.title || 'video'}`
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create group');
      }

      const newGroup = await response.json();
      logDebug('Group created successfully', { groupId: newGroup.id });

      localStorage.setItem(`activeGroup-${videoId}`, newGroup.id.toString());
      setCurrentGroup(newGroup);
      setIsCreateGroupOpen(false);
      setLocation(`/video/${videoId}/group/${newGroup.id}`);

      toast({
        title: "Success",
        description: `Group "${newGroup.name}" created! Share the link with friends to join the discussion.`,
      });
    } catch (error) {
      logDebug('Error creating group', { error });
      toast({
        title: "Error",
        description: "Failed to create group",
        variant: "destructive",
      });
    }
  };

  const handleLeaveGroup = async () => {
    if (!currentGroup) return;

    try {
      logDebug('Leaving group', { groupId: currentGroup.id });
      const response = await fetch(`/api/groups/${currentGroup.id}/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to leave group');
      }

      // Mark this group as recently left to prevent auto-rejoin
      sessionStorage.setItem('lastLeftGroup', currentGroup.id.toString());
      sessionStorage.setItem('lastLeftTime', Date.now().toString());

      // Clear group from localStorage and state
      localStorage.removeItem(`activeGroup-${videoId}`);
      setCurrentGroup(null);
      setRestorationAttempted(false); // Allow restoration on next mount

      // Update URL and invalidate queries
      setLocation(`/video/${videoId}`);
      queryClient.invalidateQueries({
        queryKey: [`/api/videos/${videoId}/last-active-group`]
      });

      logDebug('Group left successfully', { groupId: currentGroup.id });
      toast({
        title: "Success",
        description: "Successfully left the group",
      });
    } catch (error) {
      logDebug('Error leaving group', { error });
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to leave group",
        variant: "destructive",
      });
    }
  };

  // Render loading states
  if (!user) {
    return (
      <Card>
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

  if (isGroupLoading || isLastActiveLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading discussion...</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (wsState.error) { //Check WebSocket state for errors
    return (
      <Card>
        <CardHeader>
          <CardTitle>Discussion</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-4 p-8">
            <p className="text-sm text-muted-foreground">
              Connection error. Retrying...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

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
          {currentGroup && (
            <div className="flex items-center gap-2">
              <ShareGroupDialog
                url={`${window.location.origin}/join-group/${currentGroup.inviteCode}?videoId=${videoId}`}
                groupName={currentGroup.name}
                videoTitle={videoData?.title}
                memberCount={currentGroup.members?.length ?? 0}
                messageCount={messages?.length || 0}
              />
              <Button variant="outline" size="sm" onClick={handleLeaveGroup}>
                Leave Group
              </Button>
            </div>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent>
        {!currentGroup && (
          <div className="flex items-center justify-between gap-2 mb-4">
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
                  <Button onClick={handleCreateGroup}>
                    Create Group
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}

        <VirtualizedMessageList
          messages={messages}
          currentUserId={user?.id}
          isLoading={isMessagesLoading}
          onLoadMore={() => {/* Implement infinite scroll */}}
        />
      </CardContent>

      <CardFooter>
        <form onSubmit={handleSubmit} className="flex w-full items-center gap-2">
          <Input
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1"
            disabled={sendMessageMutation.isPending}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!messageInput.trim() || sendMessageMutation.isPending}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}

export default DiscussionGroupComponent;