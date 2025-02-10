import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
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
import { Send, MessageSquare, Plus, UserPlus, Users } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type Message, type Group, type WSMessage, validateApiResponse, messageSchema, groupSchema, wsMessageSchema } from "@/lib/api-types";
import { z } from "zod";

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
}

export function DiscussionGroup({ videoId }: DiscussionGroupProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [messageInput, setMessageInput] = useState("");
  const [groupNameInput, setGroupNameInput] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [wsState, setWsState] = useState<WebSocketState>({
    connected: false,
    connecting: false,
    retryCount: 0,
    retryDelay: INITIAL_RETRY_DELAY,
  });
  const reconnectTimeoutRef = useRef<number>();

  // Query for video messages
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['/api/messages', videoId],
    enabled: !!user && !!videoId && !currentGroup,
    select: (data) => validateApiResponse(z.array(messageSchema), data),
  });

  // Query for group messages
  const { data: groupMessages = [] } = useQuery<Message[]>({
    queryKey: ['/api/group-messages', currentGroup?.id],
    enabled: !!user && !!currentGroup?.id,
    select: (data) => validateApiResponse(z.array(messageSchema), data),
  });

  const addOptimisticMessage = (newMessage: Message) => {
    const queryKey = currentGroup 
      ? ['/api/group-messages', currentGroup.id]
      : ['/api/messages', videoId];

    queryClient.setQueryData<Message[]>(queryKey, (old = []) => {
      return [...old, newMessage];
    });
  };

  const connectWebSocket = useCallback(() => {
    if (!user || wsState.connecting) return;

    // Close existing connection if any
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    if (socketRef.current) {
      console.log('Closing existing WebSocket connection');
      socketRef.current.close();
    }

    setWsState(prev => ({ ...prev, connecting: true }));

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

      // Don't reconnect if the socket was closed intentionally (code 1000) or max retries reached
      if (event.code !== 1000 && user && wsState.retryCount < MAX_RETRIES) {
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

        // Validate websocket message format
        const message = validateApiResponse(wsMessageSchema, data);

        switch (message.type) {
          case 'new_message':
            if (!currentGroup) {
              console.log('Invalidating messages query');
              queryClient.invalidateQueries({ queryKey: ['/api/messages', videoId] });
              // Scroll to bottom on new message
              messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }
            break;

          case 'new_group_message':
            if (currentGroup && message.data.groupId === currentGroup.id) {
              console.log('Invalidating group messages query');
              queryClient.invalidateQueries({ queryKey: ['/api/group-messages', currentGroup.id] });
              // Scroll to bottom on new message
              messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }
            break;

          case 'group_created':
            console.log("Group Created:", message.data);
            // Validate group data
            const newGroup = validateApiResponse(groupSchema, message.data);
            setCurrentGroup(newGroup);
            setIsCreateGroupOpen(false);
            queryClient.invalidateQueries({ queryKey: ['/api/group-messages', newGroup.id] });
            toast({
              title: "Success",
              description: `Group "${newGroup.name}" created! Share this invite code with friends: ${newGroup.inviteCode}`,
            });
            break;

          case 'group_joined':
            console.log("Group Joined:", message.data);
            // Validate group data
            const joinedGroup = validateApiResponse(groupSchema, message.data);
            setCurrentGroup(joinedGroup);
            setIsJoinGroupOpen(false);
            queryClient.invalidateQueries({ queryKey: ['/api/group-messages', joinedGroup.id] });
            toast({
              title: "Success",
              description: `Joined group "${joinedGroup.name}"!`,
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
  }, [user, toast, queryClient, videoId, currentGroup, wsState.retryCount, wsState.retryDelay]);

  useEffect(() => {
    if (!user) return;

    connectWebSocket();

    // Cleanup function
    return () => {
      console.log('Cleaning up WebSocket connection');
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        // Use code 1000 to indicate intentional closure
        socketRef.current.close(1000, 'Component unmounting');
      }
    };
  }, [user, connectWebSocket]);

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

    // Add optimistic update
    const optimisticMessage: Message = {
      id: Date.now(), // Temporary ID
      content: messageInput,
      userId: user.id,
      createdAt: new Date().toISOString(),
      user: {
        username: user.username,
      },
      ...(currentGroup ? { groupId: currentGroup.id } : { videoId }),
    };

    addOptimisticMessage(optimisticMessage);

    console.log('Sending WebSocket message:', messageData);
    socketRef.current.send(JSON.stringify(messageData));
    setMessageInput('');

    // Scroll to bottom after sending
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

    const createGroupData = {
      type: 'create_group',
      name: groupNameInput,
      videoId,
    };

    console.log('Sending create group request:', createGroupData);
    socketRef.current.send(JSON.stringify(createGroupData));
    setGroupNameInput('');
  };

  const joinGroup = () => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      toast({
        title: "Error",
        description: "Not connected to server",
        variant: "destructive",
      });
      return;
    }

    const joinGroupData = {
      type: 'join_group',
      inviteCode,
    };

    console.log('Sending join group request:', joinGroupData);
    socketRef.current.send(JSON.stringify(joinGroupData));
    setInviteCode('');
  };

  const leaveGroup = () => {
    setCurrentGroup(null);
  };

  // Auto-scroll when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, groupMessages.length]);

  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isJoinGroupOpen, setIsJoinGroupOpen] = useState(false);

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {currentGroup ? (
              <>
                <Users className="h-5 w-5" />
                {currentGroup.name}
              </>
            ) : (
              <>
                <MessageSquare className="h-5 w-5" />
                Discussion
              </>
            )}
          </div>
          {currentGroup && (
            <Button variant="outline" size="sm" onClick={leaveGroup}>
              Leave Group
            </Button>
          )}
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
                      Create a private group to discuss this video with friends.
                    </DialogDescription>
                  </DialogHeader>
                  <Input
                    value={groupNameInput}
                    onChange={(e) => setGroupNameInput(e.target.value)}
                    placeholder="Group name..."
                  />
                  <DialogFooter>
                    <Button onClick={createGroup} disabled={!groupNameInput.trim()}>
                      Create Group
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={isJoinGroupOpen} onOpenChange={setIsJoinGroupOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Join Group
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Join Discussion Group</DialogTitle>
                    <DialogDescription>
                      Enter an invite code to join an existing group.
                    </DialogDescription>
                  </DialogHeader>
                  <Input
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Invite code..."
                  />
                  <DialogFooter>
                    <Button onClick={joinGroup} disabled={!inviteCode.trim()}>
                      Join Group
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>

        <div className="h-[300px] space-y-4 overflow-y-auto p-4 border rounded-lg">
          {displayMessages.length === 0 && (
            <p className="text-center text-muted-foreground">
              No messages yet. Start the conversation!
            </p>
          )}
          {displayMessages.map((message) => (
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