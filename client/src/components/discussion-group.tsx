import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { usePolling } from "@/hooks/use-polling";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, MessageSquare, Plus, Users } from "lucide-react";
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
import {
  Message,
  DiscussionGroup,
  validateApiResponse,
  messageSchema,
  discussionGroupSchema,
} from "@/lib/api-types";
import { z } from "zod";
import { ShareGroupDialog } from "@/components/ui/share-group-dialog";
import { env } from "@/lib/env";

interface Props {
  videoId: number;
  initialGroupId?: number;
}

interface VideoData {
  title?: string;
  description?: string;
}

export function DiscussionGroup({ videoId, initialGroupId }: Props) {
  // Hooks
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // State
  const [messageInput, setMessageInput] = useState("");
  const [groupNameInput, setGroupNameInput] = useState("");
  const [currentGroup, setCurrentGroup] = useState<DiscussionGroup | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [restorationAttempted, setRestorationAttempted] = useState(false);

  // Debug logging function with timestamp
  const logDebug = (action: string, data: unknown) => {
    console.log(`[DiscussionGroup ${new Date().toISOString()}] ${action}:`, data);
  };

  // Polling setup
  const { state: pollingState, sendMessage, addMessageHandler } = usePolling(currentGroup?.id);

  // Queries with proper type safety
  const { data: group, isLoading: isGroupLoading } = useQuery<DiscussionGroup, Error>({
    queryKey: [`/api/groups/${initialGroupId}`],
    enabled: !!initialGroupId && !!user,
    select: (data: unknown) => {
      try {
        const validated = validateApiResponse(discussionGroupSchema, data);
        if (!validated) throw new Error('Invalid group data');
        return validated;
      } catch (error) {
        console.error('Group validation error:', error);
        throw error;
      }
    },
    retry: 3,
    staleTime: 30000,
  });

  const { data: lastActiveGroup, isLoading: isLastActiveLoading } = useQuery<DiscussionGroup, Error>({
    queryKey: [`/api/videos/${videoId}/last-active-group`],
    enabled: !!videoId && !!user && !initialGroupId && !currentGroup,
    select: (data: unknown) => {
      try {
        const validated = validateApiResponse(discussionGroupSchema, data);
        if (!validated) throw new Error('Invalid group data');
        return validated;
      } catch (error) {
        console.error('Group validation error:', error);
        throw error;
      }
    },
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
    select: (data: unknown) => {
      try {
        return validateApiResponse(z.array(messageSchema), data);
      } catch (error) {
        console.error('Message validation error:', error);
        return [];
      }
    },
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
          setCurrentGroup((prevGroup: DiscussionGroup | null) => {
            if (prevGroup?.id === group.id) return prevGroup;
            return group;
          });
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

  // Message handler
  useEffect(() => {
    if (!user || !currentGroup) return;

    const handleNewMessages = async (newMessages: Message[]) => {
      logDebug('New messages received', {
        count: newMessages.length,
        groupId: currentGroup.id
      });

      // Update messages in cache
      queryClient.invalidateQueries({
        queryKey: [`/api/groups/${currentGroup.id}/messages`]
      });

      // Only increment unread count if the window is not focused
      if (document.hidden) {
        setUnreadCount(prev => prev + newMessages.length);
      } else {
        // If window is focused, mark messages as read
        try {
          await fetch(`/api/groups/${currentGroup.id}/mark-read`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            }
          });
          setUnreadCount(0);
        } catch (error) {
          console.error('Failed to mark messages as read:', error);
        }
      }
    };

    const cleanup = addMessageHandler(handleNewMessages);

    // Add visibility change handler
    const handleVisibilityChange = async () => {
      if (!document.hidden && unreadCount > 0) {
        try {
          await fetch(`/api/groups/${currentGroup.id}/mark-read`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            }
          });
          setUnreadCount(0);
        } catch (error) {
          console.error('Failed to mark messages as read:', error);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cleanup();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, currentGroup, queryClient, addMessageHandler, unreadCount]);

  // Event handlers
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !currentGroup) return;

    try {
      logDebug('Sending message', { groupId: currentGroup.id });
      const response = await fetch(`/api/groups/${currentGroup.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: messageInput.trim()
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const newMessage = await response.json();
      logDebug('Message sent successfully', { messageId: newMessage.id });

      queryClient.invalidateQueries({
        queryKey: [`/api/groups/${currentGroup.id}/messages`]
      });

      setMessageInput('');
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      logDebug('Error sending message', { error });
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    }
  };

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

  if (pollingState.error) {
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

        <div className="h-[300px] space-y-4 overflow-y-auto p-4 border rounded-lg">
          {isMessagesLoading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-14 bg-muted rounded"></div>
              <div className="h-14 bg-muted rounded"></div>
              <div className="h-14 bg-muted rounded"></div>
            </div>
          ) : messages.length === 0 ? (
            <p className="text-center text-muted-foreground">
              No messages yet. Start the conversation!
            </p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex flex-col ${
                  message.userId === user.id ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`rounded-lg px-4 py-2 ${
                    message.userId === user.id
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
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </CardContent>

      <CardFooter>
        <form onSubmit={handleSubmit} className="flex w-full items-center gap-2">
          <Input
            value={messageInput || ''}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={!messageInput.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}