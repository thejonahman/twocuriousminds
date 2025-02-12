import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket } from "@/hooks/use-websocket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShareButton } from "@/components/ui/share-button";
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
  type Message,
  type Group,
  validateApiResponse,
  messageSchema,
  groupSchema,
  wsMessageSchema,
} from "@/lib/api-types";
import { z } from "zod";

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
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);

  // WebSocket connection
  const { state: wsState, sendMessage: wsSendMessage, addMessageHandler } = useWebSocket();

  // Queries
  const { data: group } = useQuery<Group>({
    queryKey: [`/api/groups/${initialGroupId}`],
    enabled: !!initialGroupId && !!user,
    select: (data) => validateApiResponse(groupSchema, data),
  });

  const { data: lastActiveGroup } = useQuery<Group>({
    queryKey: [`/api/videos/${videoId}/last-active-group`],
    enabled: !!videoId && !!user && !initialGroupId,
    select: (data) => validateApiResponse(groupSchema, data),
  });

  const { data: videoData } = useQuery<VideoData>({
    queryKey: [`/api/videos/${videoId}`],
    enabled: !!videoId,
  });

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: [currentGroup ? '/api/group-messages' : '/api/messages', currentGroup?.id || videoId],
    enabled: !!user && (!!videoId || !!currentGroup?.id),
    select: (data) => validateApiResponse(z.array(messageSchema), data),
  });

  // Effects
  useEffect(() => {
    if (group && !currentGroup) {
      setCurrentGroup(group);
      setLocation(`/video/${videoId}/group/${group.id}`);
    }
  }, [group, currentGroup, videoId, setLocation]);

  useEffect(() => {
    if (lastActiveGroup && !currentGroup && !initialGroupId) {
      setCurrentGroup(lastActiveGroup);
      setLocation(`/video/${videoId}/group/${lastActiveGroup.id}`);
    }
  }, [lastActiveGroup, currentGroup, initialGroupId, videoId, setLocation]);

  // WebSocket message handler
  useEffect(() => {
    if (!user) return;

    const handleMessage = (data: any) => {
      try {
        const message = validateApiResponse(wsMessageSchema, data);

        switch (message.type) {
          case 'new_message':
          case 'new_group_message':
            queryClient.invalidateQueries({ 
              queryKey: [currentGroup ? '/api/group-messages' : '/api/messages', currentGroup?.id || videoId] 
            });
            if (document.hidden) {
              setUnreadCount(prev => prev + 1);
            }
            break;

          case 'group_created':
            const newGroup = validateApiResponse(groupSchema, message.data);
            setCurrentGroup(newGroup);
            setIsCreateGroupOpen(false);
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
        console.error('Message handling error:', error);
      }
    };

    const cleanup = addMessageHandler(handleMessage);
    return cleanup;
  }, [user, currentGroup, videoId, queryClient, setLocation, toast, addMessageHandler]);

  // Event handlers
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim()) return;

    const messageData = currentGroup
      ? {
          type: 'group_message',
          groupId: currentGroup.id,
          content: messageInput.trim(),
        }
      : {
          type: 'message',
          videoId,
          content: messageInput.trim(),
        };

    if (wsSendMessage(messageData)) {
      setMessageInput('');
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleCreateGroup = () => {
    const groupName = groupNameInput.trim() || videoData?.title || "Discussion Group";
    wsSendMessage({
      type: 'create_group',
      name: groupName,
      videoId,
      description: `Discussion group for ${videoData?.title || 'video'}`,
    });
    setGroupNameInput('');
  };

  const handleLeaveGroup = () => {
    setCurrentGroup(null);
    setLocation(`/video/${videoId}`);
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

  if (!wsState.connected || wsState.connecting) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Discussion</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-4 p-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">
              Connecting to chat...
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
              <ShareButton
                url={`${window.location.origin}/video/${videoId}/group/${currentGroup.id}`}
                title={`Join our discussion: ${currentGroup.name}`}
                text={`Join our discussion group for "${videoData?.title}". Click the link to join!`}
                className="gap-2"
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
          {messages.length === 0 ? (
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
            value={messageInput}
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
