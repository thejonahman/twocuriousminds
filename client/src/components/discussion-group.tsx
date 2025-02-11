import { useState, useEffect, useRef } from "react";
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
import { type Message, type Group } from "@/lib/api-types";
import { useLocation } from "wouter";
import { ShareButton } from "@/components/ui/share-button";

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
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Query for group if initialGroupId is provided
  const { data: group } = useQuery<Group>({
    queryKey: [`/api/groups/${initialGroupId}`],
    enabled: !!initialGroupId && !!user,
  });

  // Query for video messages with proper query key
  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<Message[]>({
    queryKey: [`/api/messages/${videoId}`],
    enabled: !!videoId && !currentGroup,
  });

  // Query for group messages with proper query key
  const { data: groupMessages = [], isLoading: isLoadingGroupMessages } = useQuery<Message[]>({
    queryKey: [`/api/group-messages/${currentGroup?.id}`],
    enabled: !!currentGroup?.id,
  });

  // Query for video data
  const { data: videoData } = useQuery<VideoData>({
    queryKey: [`/api/videos/${videoId}`],
    enabled: !!videoId,
  });

  // Set initial group when data is loaded
  useEffect(() => {
    if (group && !currentGroup) {
      setCurrentGroup(group);
      if (!window.location.pathname.includes('/group/')) {
        setLocation(`/video/${videoId}/group/${group.id}`);
      }
    }
  }, [group, currentGroup, videoId, setLocation]);

  // WebSocket connection
  useEffect(() => {
    if (!user) return;

    const connectWebSocket = () => {
      if (socketRef.current?.readyState === WebSocket.OPEN) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        setTimeout(connectWebSocket, 2000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received WebSocket message:', data);

          switch (data.type) {
            case 'new_message':
              if (!currentGroup) {
                queryClient.invalidateQueries({ queryKey: [`/api/messages/${videoId}`] });
                console.log('Invalidating video messages cache');
              }
              break;
            case 'new_group_message':
              if (currentGroup && data.groupId === currentGroup.id) {
                queryClient.invalidateQueries({ queryKey: [`/api/group-messages/${currentGroup.id}`] });
                console.log('Invalidating group messages cache');
              }
              break;
            case 'group_created':
              setCurrentGroup(data.data);
              setIsCreateGroupOpen(false);
              queryClient.invalidateQueries({ queryKey: [`/api/group-messages/${data.data.id}`] });
              setLocation(`/video/${videoId}/group/${data.data.id}`);
              toast({
                title: "Success",
                description: `Group "${data.data.name}" created! Share the link with friends to join the discussion.`,
              });
              break;
          }
          // Scroll to bottom on new message
          setTimeout(() => {
            if (messagesEndRef.current) {
              messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
            }
          }, 100);
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      };
    };

    connectWebSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [user, videoId, currentGroup, queryClient, setLocation, toast]);

  const sendMessage = () => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      toast({
        title: "Not Connected",
        description: "Reconnecting to chat server...",
        variant: "destructive",
      });
      return;
    }

    if (!messageInput.trim()) return;

    const messageData = currentGroup ? {
      type: 'group_message',
      groupId: currentGroup.id,
      content: messageInput.trim(),
    } : {
      type: 'message',
      videoId,
      content: messageInput.trim(),
    };

    try {
      socketRef.current.send(JSON.stringify(messageData));
      setMessageInput('');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    }
  };

  const createGroup = () => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      toast({
        title: "Not Connected",
        description: "Please wait for connection to be established...",
        variant: "destructive",
      });
      return;
    }

    const groupName = groupNameInput.trim() || videoData?.title || "Discussion Group";
    try {
      socketRef.current.send(JSON.stringify({
        type: 'create_group',
        name: groupName,
        videoId,
        description: `Discussion group for ${videoData?.title ?? 'video'}`,
      }));
      setGroupNameInput('');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create group. Please try again.",
        variant: "destructive",
      });
    }
  };

  const leaveGroup = () => {
    setCurrentGroup(null);
    setLocation(`/video/${videoId}`);
  };

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

  const displayMessages = currentGroup ? groupMessages : messages;
  const isLoading = isLoadingMessages || isLoadingGroupMessages;

  // Sort messages by creation time
  const sortedMessages = [...(displayMessages || [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

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
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
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

      <CardContent className="flex flex-col gap-4">
        {!currentGroup && (
          <Dialog open={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
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
              <form onSubmit={(e) => {
                e.preventDefault();
                createGroup();
              }}>
                <Input
                  value={groupNameInput}
                  onChange={(e) => setGroupNameInput(e.target.value)}
                  placeholder={videoData?.title || "Group name..."}
                  className="mb-4"
                />
                <DialogFooter>
                  <Button type="submit" disabled={!isConnected}>
                    Create Group
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}

        <div className="h-[300px] space-y-4 overflow-y-auto p-4 border rounded-lg">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (!sortedMessages || sortedMessages.length === 0) ? (
            <p className="text-center text-muted-foreground">
              No messages yet. Start the conversation!
            </p>
          ) : (
            sortedMessages.map((message) => (
              <div
                key={message.id}
                className={`flex flex-col ${
                  message.userId === user?.id ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`rounded-lg px-4 py-2 max-w-[80%] ${
                    message.userId === user?.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  {message.user?.username && (
                    <p className="text-sm font-semibold">{message.user.username}</p>
                  )}
                  <p className="break-words">{message.content}</p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </CardContent>

      <CardFooter>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex w-full items-center gap-2"
        >
          <Input
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder={`Type your message${currentGroup ? ' to group' : ''}...`}
            className="flex-1"
            disabled={!isConnected}
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