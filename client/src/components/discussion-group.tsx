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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
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

  // Query for last active group if no initialGroupId is provided
  const { data: lastActiveGroup } = useQuery({
    queryKey: [`/api/videos/${videoId}/last-active-group`],
    enabled: !!videoId && !!user && !initialGroupId,
    retry: 3,
    staleTime: 1000, // Consider data fresh for 1 second
    refetchInterval: 30000, // Refetch every 30 seconds to maintain persistence
  });

  // Use initialGroupId or lastActiveGroup?.id for the effective group ID
  const effectiveGroupId = initialGroupId || (lastActiveGroup && lastActiveGroup.id);

  // Update the useEffect hook for group membership persistence
  useEffect(() => {
    if (!user || !effectiveGroupId) return;

    const setupGroupMembership = async () => {
      try {
        console.log('Setting up group membership:', {
          userId: user.id,
          groupId: effectiveGroupId,
          timestamp: new Date().toISOString()
        });

        // Touch the membership to maintain persistence
        const touchResponse = await fetch(`/api/groups/${effectiveGroupId}/members/${user.id}/touch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!touchResponse.ok) {
          throw new Error('Failed to update membership persistence');
        }

        console.log('Successfully updated membership persistence');

        // Invalidate queries to ensure fresh data
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: [`/api/groups/${effectiveGroupId}`] }),
          queryClient.invalidateQueries({ queryKey: [`/api/groups/${effectiveGroupId}/messages`] }),
          queryClient.invalidateQueries({ queryKey: [`/api/videos/${videoId}/last-active-group`] })
        ]);
      } catch (error) {
        console.error('Error setting up group membership:', error);
        toast({
          title: "Connection Error",
          description: "Having trouble connecting to the group. Please refresh the page.",
          variant: "destructive",
        });
      }
    };

    setupGroupMembership();

    // Set up interval to maintain persistence (every 15 seconds)
    const persistenceInterval = setInterval(setupGroupMembership, 15000);

    return () => clearInterval(persistenceInterval);
  }, [user, effectiveGroupId, queryClient, videoId, toast]);

  // Query for group details with enhanced persistence
  const { data: group, isLoading: isGroupLoading } = useQuery({
    queryKey: [`/api/groups/${effectiveGroupId}`],
    enabled: !!effectiveGroupId && !!user,
    select: (data: unknown) => validateApiResponse(groupSchema, data),
    staleTime: 5000, // Consider data fresh for 5 seconds
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  // Query for messages with proper error handling
  const { data: messages = [], isLoading: isMessagesLoading } = useQuery({
    queryKey: [`/api/groups/${effectiveGroupId}/messages`],
    enabled: !!effectiveGroupId && !!user && !!group,
    select: (data: unknown) => validateApiResponse(z.array(messageSchema), data),
    refetchInterval: 3000,
    staleTime: 1000,
    gcTime: 5 * 60 * 1000,
    retry: 3,
  });

  // Effect for scrolling to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Handle message submission with optimistic updates
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !effectiveGroupId) return;

    const optimisticMessage: Message = {
      id: Math.random(),
      content: messageInput.trim(),
      userId: user!.id,
      groupId: effectiveGroupId,
      user: { username: user!.username },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    queryClient.setQueryData(
      [`/api/groups/${effectiveGroupId}/messages`],
      (old: Message[] = []) => [...old, optimisticMessage]
    );

    setMessageInput("");

    try {
      const response = await fetch(`/api/groups/${effectiveGroupId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: messageInput.trim() }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      // Update both messages and group cache
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [`/api/groups/${effectiveGroupId}/messages`]
        }),
        queryClient.invalidateQueries({
          queryKey: [`/api/groups/${effectiveGroupId}`]
        })
      ]);
    } catch (error) {
      console.error("Error sending message:", error);
      queryClient.invalidateQueries({
        queryKey: [`/api/groups/${effectiveGroupId}/messages`]
      });
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Handle group creation with proper persistence
  const handleCreateGroup = async () => {
    if (!user) return;

    const groupName = groupNameInput.trim() || "Discussion Group";
    try {
      const response = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: groupName,
          videoId,
          description: `Discussion group for video ${videoId}`,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create group");
      }

      const newGroup = await response.json();
      setIsCreateGroupOpen(false);
      setGroupNameInput("");

      // Ensure group persistence is set up immediately
      await fetch(`/api/groups/${newGroup.id}/members/${user.id}/touch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // Invalidate queries to ensure fresh data
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [`/api/videos/${videoId}/last-active-group`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/groups/${newGroup.id}`] })
      ]);

      // Navigate to the new group
      setLocation(`/video/${videoId}/group/${newGroup.id}`);

      toast({
        title: "Success",
        description: `Group "${newGroup.name}" created! Share the link with friends to join the discussion.`,
      });
    } catch (error) {
      console.error("Error creating group:", error);
      toast({
        title: "Error",
        description: "Failed to create group. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Handle leaving group with proper cleanup
  const handleLeaveGroup = async () => {
    if (!effectiveGroupId) return;

    try {
      const response = await fetch(`/api/groups/${effectiveGroupId}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error("Failed to leave group");
      }

      // Clear cache data
      queryClient.setQueryData(
        [`/api/videos/${videoId}/last-active-group`],
        null
      );

      queryClient.removeQueries({
        queryKey: [`/api/groups/${effectiveGroupId}`]
      });

      setLocation(`/video/${videoId}`);

      toast({
        title: "Success",
        description: "Successfully left the group",
      });
    } catch (error) {
      console.error("Error leaving group:", error);
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

  if (isGroupLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading discussion group...</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-14 bg-muted rounded"></div>
            <div className="h-14 bg-muted rounded"></div>
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
                videoTitle={group.video?.title || "Video Discussion"}
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