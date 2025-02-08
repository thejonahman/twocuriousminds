import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Users, Share2, Send, MessageSquare, Bell, BellOff } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Message {
  id: number;
  content: string;
  userId: number;
  createdAt: string;
  user: {
    username: string;
  };
}

interface DiscussionGroupProps {
  videoId: number;
  videoTitle: string;
}

export function DiscussionGroup({ videoId, videoTitle }: DiscussionGroupProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [socket, setSocket] = useState<WebSocket | null>(null);

  // Connect to WebSocket
  useEffect(() => {
    if (user) {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

      ws.onopen = () => {
        console.log("Connected to WebSocket");
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "new_message") {
          // Invalidate and refetch messages
          queryClient.invalidateQueries({ queryKey: [`/api/groups/${message.data.groupId}/messages`] });
        }
      };

      setSocket(ws);

      return () => {
        ws.close();
      };
    }
  }, [user, queryClient]);

  // Get current group for this video
  const { data: group } = useQuery({
    queryKey: ["/api/groups", videoId],
    enabled: !!user,
  });

  // Get messages if group exists
  const { data: messages } = useQuery<Message[]>({
    queryKey: [`/api/groups/${group?.id}/messages`],
    enabled: !!group,
  });

  // Create group mutation
  const createGroup = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/groups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: groupName || videoTitle,
          description: groupDescription,
          videoId,
          isPrivate: true,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create group");
      }

      return response.json();
    },
    onSuccess: () => {
      setCreateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/groups", videoId] });
      toast({
        title: "Group created",
        description: "You can now start discussing this video with others!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create discussion group",
        variant: "destructive",
      });
    },
  });

  // Send message mutation
  const sendMessage = useMutation({
    mutationFn: async () => {
      if (socket?.readyState === WebSocket.OPEN && group) {
        socket.send(JSON.stringify({
          type: "group_message",
          groupId: group.id,
          content: messageInput,
        }));
        return true;
      }
      throw new Error("WebSocket not connected");
    },
    onSuccess: () => {
      setMessageInput("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    },
  });

  // Copy invite link
  const copyInviteLink = async () => {
    if (group) {
      const inviteUrl = `${window.location.origin}/join/${group.inviteCode}`;
      try {
        await navigator.clipboard.writeText(inviteUrl);
        toast({
          title: "Copied!",
          description: "Invite link copied to clipboard",
        });
      } catch (err) {
        toast({
          title: "Error",
          description: "Failed to copy invite link",
          variant: "destructive",
        });
      }
    }
  };

  // Scroll to bottom of messages
  useEffect(() => {
    if (messages?.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages?.length]);

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Discussion Group</CardTitle>
          <CardDescription>Sign in to join the discussion</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Discussion Group
          </CardTitle>
          {!group && (
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Users className="mr-2 h-4 w-4" />
                  Start a Discussion
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Discussion Group</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Input
                      placeholder={videoTitle}
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Group description (optional)"
                      value={groupDescription}
                      onChange={(e) => setGroupDescription(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  onClick={() => createGroup.mutate()}
                  disabled={createGroup.isPending}
                >
                  Create Group
                </Button>
              </DialogContent>
            </Dialog>
          )}
          {group && (
            <Button variant="outline" size="sm" onClick={copyInviteLink}>
              <Share2 className="mr-2 h-4 w-4" />
              Share
            </Button>
          )}
        </div>
      </CardHeader>

      {group && (
        <>
          <CardContent className="space-y-4">
            <div className="h-[300px] space-y-4 overflow-y-auto p-4">
              {messages?.map((message) => (
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
                    <p className="text-sm font-semibold">
                      {message.user.username}
                    </p>
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
                  sendMessage.mutate();
                }
              }}
              className="flex w-full items-center gap-2"
            >
              <Input
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder="Type your message..."
                className="flex-1"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!messageInput.trim() || sendMessage.isPending}
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardFooter>
        </>
      )}
    </Card>
  );
}
