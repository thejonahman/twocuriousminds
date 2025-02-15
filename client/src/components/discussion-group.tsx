import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, MessageSquare, Plus, Users, Loader2 } from "lucide-react";
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
  DiscussionGroup as DiscussionGroupType,
  validateApiResponse,
  messageSchema,
  discussionGroupSchema,
  GroupMessage,
  WSInputMessage,
  validateWSOutput,
  groupMessageSchema
} from "@/lib/api-types";
import { z } from "zod";
import { ShareGroupDialog } from "@/components/ui/share-group-dialog";
import debounce from 'lodash/debounce';
import { VirtualizedMessageList } from "@/components/ui/virtualized-message-list";
import { VideoData } from "@/types/video";

interface Props {
  videoId: number;
  initialGroupId?: number;
}

const INITIAL_RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 30000;
const RECONNECT_BACKOFF_FACTOR = 1.5;

const MESSAGES_PER_PAGE = 50;
const MESSAGE_UPDATE_DEBOUNCE = 300;


export function DiscussionGroupComponent({ videoId, initialGroupId }: Props) {
  // Hooks
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  // State
  const [messageInput, setMessageInput] = useState("");
  const [groupNameInput, setGroupNameInput] = useState("");
  const [currentGroup, setCurrentGroup] = useState<DiscussionGroupType | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [restorationAttempted, setRestorationAttempted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [reconnectDelay, setReconnectDelay] = useState(INITIAL_RECONNECT_DELAY);

  // Debug logging with memoization
  const logDebug = useCallback((action: string, data: unknown) => {
    console.log(`[DiscussionGroupComponent ${new Date().toISOString()}] ${action}:`, data);
  }, []);

  // Move handleNewMessages definition before connectWebSocket
  const handleNewMessages = useCallback(async (newMessages: GroupMessage[]) => {
    if (!currentGroup) return;

    logDebug('New messages received', {
      count: newMessages.length,
      groupId: currentGroup.id
    });

    queryClient.setQueryData<GroupMessage[]>(
      [`/api/groups/${currentGroup.id}/messages`],
      old => {
        const oldMessages = old || [];
        const newMessageIds = new Set(newMessages.map(m => m.id));
        return [...oldMessages.filter(m => !newMessageIds.has(m.id)), ...newMessages];
      }
    );

    if (document.hidden) {
      setUnreadCount(prev => prev + newMessages.length);
    } else {
      try {
        await fetch(`/api/groups/${currentGroup.id}/mark-read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        setUnreadCount(0);
      } catch (error) {
        console.error('Failed to mark messages as read:', error);
      }
    }
  }, [currentGroup, queryClient, logDebug]);

  // Reset reconnection state when connection is successful
  const resetReconnectionState = useCallback(() => {
    setReconnectAttempts(0);
    setReconnectDelay(INITIAL_RECONNECT_DELAY);
    setIsConnecting(false);
  }, []);

  // Calculate next reconnection delay with exponential backoff
  const getNextReconnectDelay = useCallback(() => {
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY * Math.pow(RECONNECT_BACKOFF_FACTOR, reconnectAttempts),
      MAX_RECONNECT_DELAY
    );
    return Math.floor(delay);
  }, [reconnectAttempts]);

  // Enhanced WebSocket connection handling
  const connectWebSocket = useCallback(() => {
    if (!user || !currentGroup) {
      console.log('[WebSocket] Connection attempted without user or group:', { 
        hasUser: !!user, 
        hasGroup: !!currentGroup,
        timestamp: new Date().toISOString()
      });
      return;
    }

    try {
      // Close existing connection if any
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        console.log('[WebSocket] Closing existing connection');
        socketRef.current.close();
        socketRef.current = null;
      }

      setIsConnecting(true);
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      console.log('[WebSocket] Initiating connection:', {
        url: wsUrl,
        userId: user.id,
        groupId: currentGroup.id,
        timestamp: new Date().toISOString()
      });

      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      // Connection timeout handler
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          console.log('[WebSocket] Connection timeout - closing socket');
          ws.close();
        }
      }, 10000); // 10 second timeout

      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log('[WebSocket] Connection established:', {
          readyState: ws.readyState,
          timestamp: new Date().toISOString()
        });
        resetReconnectionState();
      };

      ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        console.log('[WebSocket] Connection closed:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          timestamp: new Date().toISOString()
        });

        setIsConnecting(true);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }

        // Only attempt reconnection if we still have a current group
        if (currentGroup) {
          const nextDelay = getNextReconnectDelay();
          console.log('[WebSocket] Scheduling reconnection:', {
            attempt: reconnectAttempts + 1,
            delay: nextDelay,
            timestamp: new Date().toISOString()
          });

          setReconnectAttempts(prev => prev + 1);
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, nextDelay);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Connection error:', {
          error,
          readyState: ws.readyState,
          timestamp: new Date().toISOString()
        });
        // Don't set isConnecting to false here, let onclose handle it
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[WebSocket] Received message:', {
            type: data.type,
            timestamp: new Date().toISOString()
          });

          if (data.type === 'connected') {
            console.log('[WebSocket] Connection confirmed by server');
          } else if (data.type === 'new_group_message' && data.data.groupId === currentGroup.id) {
            handleNewMessages([data.data]);
          }
        } catch (error) {
          console.error('[WebSocket] Message parsing error:', error);
        }
      };

    } catch (error) {
      console.error('[WebSocket] Setup error:', {
        error,
        timestamp: new Date().toISOString()
      });
      setIsConnecting(false);
    }
  }, [user, currentGroup, reconnectAttempts, getNextReconnectDelay, resetReconnectionState, handleNewMessages]);

  // Cleanup WebSocket on unmount or group change
  useEffect(() => {
    connectWebSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connectWebSocket]);

  // Optimized queries with proper caching and error handling
  const { data: group, isLoading: isGroupLoading } = useQuery<DiscussionGroupType, Error>({
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

  // Optimistic updates mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!currentGroup || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        throw new Error('No active connection');
      }

      const message: WSInputMessage = {
        type: 'group_message',
        groupId: currentGroup.id,
        content
      };

      socketRef.current.send(JSON.stringify(message));
      return { success: true };
    },
    onMutate: async (content) => {
      if (!currentGroup || !user) return;

      // Cancel outgoing fetches
      await queryClient.cancelQueries({ queryKey: [`/api/groups/${currentGroup.id}/messages`] });

      // Get current messages
      const previousMessages = queryClient.getQueryData<GroupMessage[]>([`/api/groups/${currentGroup.id}/messages`]);

      // Optimistically add new message
      const optimisticMessage: GroupMessage = {
        id: Date.now(),
        content,
        userId: user.id,
        groupId: currentGroup.id,
        createdAt: new Date().toISOString(),
        user: {
          id: user.id,
          username: user.username || 'Unknown User'
        }
      };

      queryClient.setQueryData<GroupMessage[]>(
        [`/api/groups/${currentGroup.id}/messages`],
        old => [...(old || []), optimisticMessage]
      );

      return { previousMessages };
    },
    onError: (err, content, context) => {
      if (context?.previousMessages && currentGroup) {
        queryClient.setQueryData(
          [`/api/groups/${currentGroup.id}/messages`],
          context.previousMessages
        );
      }
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      if (currentGroup) {
        queryClient.invalidateQueries({
          queryKey: [`/api/groups/${currentGroup.id}/messages`]
        });
      }
    }
  });

  const { data: lastActiveGroup, isLoading: isLastActiveLoading } = useQuery<DiscussionGroupType, Error>({
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

  const { data: videoData, isLoading: isVideoDataLoading } = useQuery<VideoData>({
    queryKey: [`/api/videos/${videoId}`],
    enabled: !!videoId,
    select: useCallback((data: unknown) => {
      try {
        const videoData = data as VideoData;
        return {
          id: videoData.id,
          title: videoData.title,
          description: videoData.description
        };
      } catch (error) {
        console.error('Video data validation error:', error);
        return null;
      }
    }, []),
  });

  // Fix query type for messages
  const { data: messages = [], isLoading: isMessagesLoading } = useQuery<GroupMessage[]>({
    queryKey: [`/api/groups/${currentGroup?.id}/messages`],
    enabled: !!currentGroup?.id && !!user,
    select: useCallback((data: unknown) => {
      try {
        return validateApiResponse(z.array(groupMessageSchema), data);
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

  // Message handler -  Removed the useEffect that used addMessageHandler and usePolling.
  useEffect(() => {
    //This effect is now empty because message handling is done via websockets.

  }, []);


  const debouncedMessageUpdate = useMemo(
    () => debounce((value: string) => setMessageInput(value), MESSAGE_UPDATE_DEBOUNCE),
    []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !currentGroup) return;

    try {
      await sendMessageMutation.mutateAsync(messageInput.trim());
      setMessageInput('');
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      // Error handling is done in mutation callbacks
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

  if (isGroupLoading || isLastActiveLoading || isVideoDataLoading) {
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

  const renderConnectionStatus = () => {
    if (isConnecting) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Connecting...
        </div>
      );
    }
    return null;
  };

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
              {renderConnectionStatus()}
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
            onChange={(e) => debouncedMessageUpdate(e.target.value)}
            placeholder="Type your message..."
            className="flex-1"
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