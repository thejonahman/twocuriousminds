import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { type Message, type Group, type WSMessage, validateApiResponse, messageSchema, groupSchema, wsMessageSchema } from "@/lib/api-types";
import { z } from "zod";
import { useLocation } from "wouter";
import { ShareButton } from "@/components/ui/share-button";

// Maximum number of reconnection attempts
const MAX_RETRIES = 5;
// Initial delay in milliseconds (1 second)
const INITIAL_RETRY_DELAY = 1000;
// Maximum delay between retries (30 seconds)
const MAX_RETRY_DELAY = 30000;

interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  retryCount: number;
  retryDelay: number;
}

interface DiscussionGroupProps {
  videoId: number;
  initialGroupId?: number;
}

interface VideoData {
  title: string;
  id: number;
}

export function DiscussionGroup({ videoId, initialGroupId }: DiscussionGroupProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [messageInput, setMessageInput] = useState("");
  const [groupNameInput, setGroupNameInput] = useState("");
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const reconnectTimeoutRef = useRef<number>();

  const [wsState, setWsState] = useState<WebSocketState>({
    connected: false,
    connecting: false,
    retryCount: 0,
    retryDelay: INITIAL_RETRY_DELAY,
  });

  // Query for group if initialGroupId is provided
  const { data: group } = useQuery<Group>({
    queryKey: [`/api/groups/${initialGroupId}`],
    enabled: !!initialGroupId && !!user,
  });

  // Query for video messages
  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<Message[]>({
    queryKey: ['/api/messages', videoId],
    enabled: !!user && !!videoId && !currentGroup,
  });

  // Query for group messages
  const { data: groupMessages = [], isLoading: isLoadingGroupMessages } = useQuery<Message[]>({
    queryKey: ['/api/group-messages', currentGroup?.id],
    enabled: !!user && !!currentGroup?.id && wsState.connected,
  });

  // Add video data query
  const { data: videoData } = useQuery<VideoData>({
    queryKey: [`/api/videos/${videoId}`],
    enabled: !!videoId,
  });

  // Set initial group when data is loaded
  useEffect(() => {
    if (group && !currentGroup) {
      setCurrentGroup(group);
      const currentPath = window.location.pathname;
      if (!currentPath.includes('/group/')) {
        setLocation(`/video/${videoId}/group/${group.id}`);
      }
    }
  }, [group, currentGroup, videoId, setLocation]);

  const connectWebSocket = useCallback(() => {
    if (!user || wsState.connecting) return;

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    if (socketRef.current) {
      console.log('Closing existing WebSocket connection');
      socketRef.current.close();
    }

    setWsState(prev => ({ ...prev, connecting: true }));

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setWsState({
          connected: true,
          connecting: false,
          retryCount: 0,
          retryDelay: INITIAL_RETRY_DELAY,
        });

        if (reconnectTimeoutRef.current) {
          window.clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = undefined;
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected, code:', event.code, 'reason:', event.reason);
        setWsState(prev => ({
          ...prev,
          connected: false,
          connecting: false,
        }));

        if (event.code !== 1000 && event.code !== 1008 && user && wsState.retryCount < MAX_RETRIES) {
          const nextDelay = Math.min(wsState.retryDelay * 2, MAX_RETRY_DELAY);
          console.log(`Scheduling reconnection attempt ${wsState.retryCount + 1}/${MAX_RETRIES} in ${nextDelay}ms`);

          reconnectTimeoutRef.current = window.setTimeout(() => {
            setWsState(prev => ({
              ...prev,
              retryCount: prev.retryCount + 1,
              retryDelay: nextDelay,
            }));
            connectWebSocket();
          }, nextDelay);
        } else if (wsState.retryCount >= MAX_RETRIES) {
          toast({
            title: "Connection Error",
            description: "Maximum reconnection attempts reached. Please refresh the page.",
            variant: "destructive",
          });
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received websocket message:', data);

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
              toast({
                title: "Error",
                description: message.message,
                variant: "destructive",
              });
              break;
          }
        } catch (error) {
          console.error('Error processing message:', error);
          toast({
            title: "Error",
            description: "Failed to process server message",
            variant: "destructive",
          });
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
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      setWsState(prev => ({
        ...prev,
        connected: false,
        connecting: false,
      }));
      toast({
        title: "Connection Error",
        description: "Failed to connect to chat server. Please try again later.",
        variant: "destructive",
      });
    }
  }, [user, toast, wsState.retryCount, wsState.retryDelay, videoId, currentGroup, queryClient, setLocation]);

  useEffect(() => {
    if (!user) return;

    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close(1000, 'Component unmounting');
      }
    };
  }, [user, connectWebSocket]);

  const updateLastAccessedGroup = useCallback(async () => {
    if (!user || !videoId || !currentGroup?.id) return;

    try {
      await fetch('/api/user-preferences/last-group', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          videoId,
          groupId: currentGroup.id
        })
      });
    } catch (error) {
      console.error('Failed to update last accessed group:', error);
    }
  }, [user, videoId, currentGroup?.id]);

  useEffect(() => {
    if (currentGroup?.id) {
      updateLastAccessedGroup();
    }
  }, [currentGroup?.id, updateLastAccessedGroup]);

  const sendMessage = () => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
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

    // Add optimistic update
    const queryKey = currentGroup
      ? ['/api/group-messages', currentGroup.id]
      : ['/api/messages', videoId];

    queryClient.setQueryData<Message[]>(queryKey, (old = []) => {
      return [...old, optimisticMessage].sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    });

    console.log('Sending WebSocket message:', messageData);
    socketRef.current.send(JSON.stringify(messageData));
    setMessageInput('');
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const createGroup = () => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
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
      description: `Discussion group for ${videoData?.title ?? 'video'}`,
    };

    console.log('Sending create group request:', createGroupData);
    socketRef.current.send(JSON.stringify(createGroupData));
    setGroupNameInput('');
  };

  const leaveGroup = () => {
    setCurrentGroup(null);
    setLocation(`/video/${videoId}`);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, groupMessages.length]);

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

  const displayMessages = currentGroup ? groupMessages : messages;
  const isLoading = isLoadingMessages || isLoadingGroupMessages || !wsState.connected;

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
              {!wsState.connected ? 'Connecting to chat...' : 'Loading messages...'}
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
          <div className="flex items-center gap-2">
            {currentGroup && (
              <>
                <ShareButton
                  url={`${window.location.origin}/video/${videoId}/group/${currentGroup.id}`}
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
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${wsState.connected ? 'bg-green-500' : wsState.connecting ? 'bg-yellow-500' : 'bg-red-500'}`} />
            <span className="text-sm text-muted-foreground">
              {wsState.connected ? 'Connected' : wsState.connecting ? 'Connecting...' : 'Disconnected'}
              {!wsState.connected && wsState.retryCount > 0 && ` (Attempt ${wsState.retryCount}/${MAX_RETRIES})`}
            </span>
          </div>
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
          {(!displayMessages || displayMessages.length === 0) && (
            <p className="text-center text-muted-foreground">
              No messages yet. Start the conversation!
            </p>
          )}
          {displayMessages?.map((message: Message) => (
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
                <p className="text-sm font-semibold">{message.user.username}</p>
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