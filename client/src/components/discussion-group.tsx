import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
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
  type Message,
  type Group,
  validateApiResponse,
  messageSchema,
  groupSchema,
} from "@/lib/api-types";
import { z } from "zod";
import { ShareGroupDialog } from "@/components/ui/share-group-dialog";

interface Props {
  videoId: number;
  initialGroupId?: number;
}

export function DiscussionGroup({ videoId, initialGroupId }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [messageInput, setMessageInput] = useState("");
  const [groupNameInput, setGroupNameInput] = useState("");
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);

  // Get group details if we have an initialGroupId
  const { data: group } = useQuery({
    queryKey: [`/api/groups/${initialGroupId}`],
    enabled: !!initialGroupId && !!user,
    select: (data: unknown) => validateApiResponse(groupSchema, data),
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    onSuccess: (data) => {
      // Update the last active group in cache when group data is loaded
      if (data) {
        queryClient.setQueryData(
          [`/api/videos/${videoId}/last-active-group`],
          {
            id: data.id,
            name: data.name,
            videoId: data.videoId,
            updatedAt: data.updatedAt
          }
        );
      }
    }
  });

  // Get messages for current group
  const { data: messages = [], isLoading: isMessagesLoading } = useQuery({
    queryKey: [`/api/groups/${initialGroupId}/messages`],
    enabled: !!initialGroupId && !!user,
    select: (data: unknown) => validateApiResponse(z.array(messageSchema), data),
    refetchInterval: 3000,
    staleTime: 1000 // Consider messages stale after 1 second
  });

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !initialGroupId) return;

    const optimisticMessage: Message = {
      id: Math.random(),
      content: messageInput.trim(),
      userId: user!.id,
      groupId: initialGroupId,
      user: { username: user!.username },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    queryClient.setQueryData(
      [`/api/groups/${initialGroupId}/messages`],
      (old: Message[] = []) => [...old, optimisticMessage]
    );

    setMessageInput('');

    try {
      const response = await fetch(`/api/groups/${initialGroupId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: messageInput.trim() })
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      queryClient.invalidateQueries({
        queryKey: [`/api/groups/${initialGroupId}/messages`]
      });
    } catch (error) {
      console.error('Error sending message:', error);
      queryClient.invalidateQueries({
        queryKey: [`/api/groups/${initialGroupId}/messages`]
      });
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCreateGroup = async () => {
    if (!user) return;

    const groupName = groupNameInput.trim() || "Discussion Group";
    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupName,
          videoId,
          description: `Discussion group for video ${videoId}`
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create group');
      }

      const newGroup: Group = await response.json();
      setIsCreateGroupOpen(false);

      // Update the cache before navigation
      queryClient.setQueryData(
        [`/api/videos/${videoId}/last-active-group`],
        {
          id: newGroup.id,
          name: newGroup.name,
          videoId: newGroup.videoId,
          updatedAt: newGroup.updatedAt
        }
      );

      // Navigate to the new group
      setLocation(`/video/${videoId}/group/${newGroup.id}`);

      toast({
        title: "Success",
        description: `Group "${newGroup.name}" created! Share the link with friends to join the discussion.`,
      });
    } catch (error) {
      console.error('Error creating group:', error);
      toast({
        title: "Error",
        description: "Failed to create group. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleLeaveGroup = async () => {
    if (!initialGroupId) return;

    try {
      const response = await fetch(`/api/groups/${initialGroupId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Failed to leave group');
      }

      // Clear the last active group data when leaving
      queryClient.setQueryData(
        [`/api/videos/${videoId}/last-active-group`],
        null
      );

      setLocation(`/video/${videoId}`);

      toast({
        title: "Success",
        description: "Successfully left the group",
      });
    } catch (error) {
      console.error('Error leaving group:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to leave group",
        variant: "destructive",
      });
    }
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {group ? (
              <>
                <Users className="h-5 w-5" />
                {group.name}
              </>
            ) : (
              <>
                <MessageSquare className="h-5 w-5" />
                Discussion
              </>
            )}
          </div>
          {group && (
            <div className="flex items-center gap-2">
              <ShareGroupDialog
                url={`${window.location.origin}/join-group/${group.inviteCode}?videoId=${videoId}`}
                groupName={group.name}
                videoTitle="Video Discussion"
                memberCount={group.members?.length ?? 0}
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
        {!group && (
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
                  placeholder="Group name..."
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
                  message.userId === user!.id ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`rounded-lg px-4 py-2 ${
                    message.userId === user!.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{message.user.username}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(message.createdAt || Date.now()).toLocaleTimeString()}
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
        {group && (
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
        )}
      </CardFooter>
    </Card>
  );
}