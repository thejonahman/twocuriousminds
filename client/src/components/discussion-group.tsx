import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
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
import { type Message, type Group, validateApiResponse, messageSchema, groupSchema } from "@/lib/api-types";
import { z } from "zod";
import { useLocation } from "wouter";
import { ShareButton } from "@/components/ui/share-button";

interface DiscussionGroupProps {
  videoId: number;
  initialGroupId?: number;
}

export function DiscussionGroup({ videoId, initialGroupId }: DiscussionGroupProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [messageInput, setMessageInput] = useState("");
  const [groupNameInput, setGroupNameInput] = useState("");
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);

  // Query for group if initialGroupId is provided
  const { data: group } = useQuery<Group>({
    queryKey: [`/api/groups/${initialGroupId}`],
    enabled: !!initialGroupId && !!user,
    retry: 3,
    onSuccess: (data) => {
      if (data && !currentGroup) {
        setCurrentGroup(data);
      }
    },
  });

  // Query for video messages
  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<Message[]>({
    queryKey: ['/api/messages', videoId],
    enabled: !!user && !!videoId && !currentGroup,
    select: (data) => validateApiResponse(z.array(messageSchema), data),
  });

  // Query for group messages
  const { data: groupMessages = [], isLoading: isLoadingGroupMessages } = useQuery<Message[]>({
    queryKey: ['/api/group-messages', currentGroup?.id],
    enabled: !!user && !!currentGroup?.id,
    retry: 3,
    select: (data) => validateApiResponse(z.array(messageSchema), data),
  });

  // Add video data query
  const { data: videoData } = useQuery({
    queryKey: [`/api/videos/${videoId}`],
    enabled: !!videoId,
  });

  useEffect(() => {
    if (!user) return;

    // Initialize Socket.IO connection on port 4000
    const socket = io('http://localhost:4000', {
      path: '/ws',
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      withCredentials: true
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Socket.IO connected');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Socket.IO disconnected');
      setIsConnected(false);
    });

    socket.on('message', (data) => {
      console.log('Received socket message:', data);

      if (data.type === 'new_message' && !currentGroup) {
        queryClient.invalidateQueries({ queryKey: ['/api/messages', videoId] });
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      } else if (data.type === 'new_group_message' && currentGroup && data.data.groupId === currentGroup.id) {
        queryClient.invalidateQueries({ queryKey: ['/api/group-messages', currentGroup.id] });
      }
    });

    socket.on('group_created', (data) => {
      const newGroup = validateApiResponse(groupSchema, data);
      setCurrentGroup(newGroup);
      setIsCreateGroupOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/group-messages', newGroup.id] });
      setLocation(`/video/${videoId}/group/${newGroup.id}`);

      toast({
        title: "Success",
        description: `Group "${newGroup.name}" created! Share the link with friends to join the discussion.`,
      });
    });

    socket.on('error', (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [user, videoId, currentGroup, queryClient, setLocation, toast]);

  const sendMessage = () => {
    if (!socketRef.current?.connected) {
      toast({
        title: "Error",
        description: "Not connected to chat server",
        variant: "destructive",
      });
      return;
    }

    const messageData = currentGroup 
      ? {
          type: 'group_message',
          groupId: currentGroup.id,
          content: messageInput,
        }
      : {
          type: 'message',
          videoId,
          content: messageInput,
        };

    socketRef.current.emit('message', messageData);
    setMessageInput('');
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const createGroup = () => {
    if (!socketRef.current?.connected) {
      toast({
        title: "Error",
        description: "Not connected to server",
        variant: "destructive",
      });
      return;
    }

    const groupName = groupNameInput.trim() || videoData?.title || "Discussion Group";
    socketRef.current.emit('message', {
      type: 'create_group',
      name: groupName,
      videoId,
      description: `Discussion group for ${videoData?.title}`,
    });

    setGroupNameInput('');
  };

  const generateShareUrl = () => {
    const baseUrl = window.location.origin;
    if (!currentGroup?.id) {
      console.error('No group ID available for sharing');
      return '';
    }
    return `${baseUrl}/video/${videoId}/group/${currentGroup.id}`;
  };

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
    if (currentGroup && user && !document.hidden) {
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
  }, [currentGroup, user, groupMessages]);


  const addOptimisticMessage = (newMessage: Message) => {
    const queryKey = currentGroup
      ? ['/api/group-messages', currentGroup.id]
      : ['/api/messages', videoId];

    queryClient.setQueryData<Message[]>(queryKey, (old = []) => {
      return [...old, newMessage];
    });
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
  const isLoading = isLoadingMessages || isLoadingGroupMessages;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Discussion</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
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
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-muted-foreground">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          {!currentGroup && (
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
                />
                <DialogFooter>
                  <Button onClick={createGroup} disabled={!isConnected}>
                    Create Group
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
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
            disabled={!messageInput.trim() || !isConnected}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}