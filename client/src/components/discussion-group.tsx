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
import { Users, Share2, Send, MessageSquare } from "lucide-react";
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
  const [showInviteGuide, setShowInviteGuide] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const maxReconnectAttempts = 5;
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Get current group for this video
  const { data: groups, isLoading: groupLoading } = useQuery({
    queryKey: [`/api/groups`, videoId],
    queryFn: () => fetch(`/api/groups?videoId=${videoId}`).then(r => r.json()),
    enabled: !!user && !!videoId,
  });

  // Get the first group for this video (there should only be one)
  const group = groups?.[0];

  // Get messages if group exists
  const { data: messages, isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: [`/api/groups/${group?.id}/messages`],
    enabled: !!group?.id,
  });

  // Connect WebSocket
  useEffect(() => {
    if (!user || !group?.id || isConnecting || reconnectAttempts >= maxReconnectAttempts) {
      return;
    }

    const connectWebSocket = () => {
      try {
        setIsConnecting(true);
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

        ws.onopen = () => {
          console.log("WebSocket connected");
          setSocket(ws);
          setIsConnecting(false);
          setReconnectAttempts(0);
          toast({
            title: "Connected",
            description: "You're now connected to the chat server",
          });
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === "new_message" && message.data.groupId === group.id) {
              queryClient.invalidateQueries({ queryKey: [`/api/groups/${group.id}/messages`] });
            } else if (message.type === "error") {
              toast({
                title: "Error",
                description: message.message,
                variant: "destructive",
              });
            }
          } catch (error) {
            console.warn("error parsing message", error);
          }
        };

        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          ws.close();
        };

        ws.onclose = () => {
          console.log("WebSocket connection closed");
          setSocket(null);
          setIsConnecting(false);

          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }

          // Only attempt reconnect if not at max attempts
          if (reconnectAttempts < maxReconnectAttempts) {
            const nextAttempt = reconnectAttempts + 1;
            setReconnectAttempts(nextAttempt);

            // Exponential backoff
            const delay = Math.min(1000 * Math.pow(2, nextAttempt), 10000);

            reconnectTimeoutRef.current = setTimeout(() => {
              setIsConnecting(false);
            }, delay);
          } else {
            toast({
              title: "Connection Failed",
              description: "Unable to connect to chat server. Please refresh the page.",
              variant: "destructive",
            });
          }
        };

        return ws;
      } catch (error) {
        console.error("Error creating WebSocket:", error);
        setIsConnecting(false);
        return null;
      }
    };

    const ws = connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws) {
        ws.close();
      }
    };
  }, [user, group?.id, isConnecting, reconnectAttempts, toast, queryClient]);

  // Scroll to bottom of messages
  useEffect(() => {
    if (messages?.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages?.length]);

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
      queryClient.invalidateQueries({ queryKey: [`/api/groups`] });
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
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        throw new Error("Not connected to chat server");
      }
      if (!group) {
        throw new Error("No active discussion group");
      }

      socket.send(JSON.stringify({
        type: "group_message",
        groupId: group.id,
        content: messageInput,
      }));
      return true;
    },
    onSuccess: () => {
      setMessageInput("");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      });

      // If the error was due to connection, attempt to reconnect
      if (socket?.readyState !== WebSocket.OPEN) {
        setSocket(null);
        setIsConnecting(false);
      }
    },
  });

  // Copy invite link
  const copyInviteLink = async () => {
    if (group) {
      const inviteUrl = `${window.location.origin}/join/${group.inviteCode}`;
      try {
        await navigator.clipboard.writeText(inviteUrl);
        setShowInviteGuide(true);
        toast({
          title: "Copied!",
          description: "Share this link with friends to invite them to the discussion",
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

  if (groupLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading discussion...</CardTitle>
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
            {group ? "Discussion Group" : "Start a Discussion"}
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
        </div>
      </CardHeader>

      {group && (
        <>
          <CardContent className="space-y-4">
            {showInviteGuide && (
              <div className="rounded-lg bg-muted p-4 mb-4">
                <h4 className="font-semibold mb-2">👥 Invite your friends!</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Share the copied link with friends to invite them to this discussion.
                  They can join instantly when they open the link!
                </p>
                <Button variant="outline" size="sm" onClick={copyInviteLink}>
                  <Share2 className="mr-2 h-4 w-4" />
                  Copy invite link again
                </Button>
              </div>
            )}

            {!showInviteGuide && (
              <div className="flex justify-end mb-4">
                <Button variant="outline" size="sm" onClick={copyInviteLink}>
                  <Share2 className="mr-2 h-4 w-4" />
                  Invite others
                </Button>
              </div>
            )}

            <div className="h-[300px] space-y-4 overflow-y-auto p-4 border rounded-lg">
              {messagesLoading ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">Loading messages...</p>
                </div>
              ) : messages?.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">
                    No messages yet. Start the conversation!
                  </p>
                </div>
              ) : (
                messages?.map((message) => (
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
                ))
              )}
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