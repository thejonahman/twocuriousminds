import { useState, useEffect, useRef } from "react";
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
import { useQuery } from "@tanstack/react-query";

interface Message {
  id: number;
  content: string;
  userId: number;
  groupId?: number;
  createdAt: string;
  user: {
    username: string;
  };
}

interface Group {
  id: number;
  name: string;
  description: string;
  inviteCode: string;
  creatorId: number;
}

interface DiscussionGroupProps {
  videoId: number;
}

export function DiscussionGroup({ videoId }: DiscussionGroupProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messageInput, setMessageInput] = useState("");
  const [groupNameInput, setGroupNameInput] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [connected, setConnected] = useState(false);
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
  const [groupMessages, setGroupMessages] = useState<Message[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const reconnectTimeoutRef = useRef<number>();

  // If there's no user, show a message instead of returning null
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

  // Query for video messages
  const { data: queryMessages = [] } = useQuery<Message[]>({
    queryKey: ['/api/messages', videoId],
    queryFn: () => fetch(`/api/messages?videoId=${videoId}`).then(r => r.json()),
    enabled: !!user && !!videoId && !currentGroup,
  });

  // Query for group messages when in a group
  const { data: queryGroupMessages = [] } = useQuery<Message[]>({
    queryKey: ['/api/group-messages', currentGroup?.id],
    queryFn: () => fetch(`/api/group-messages?groupId=${currentGroup?.id}`).then(r => r.json()),
    enabled: !!user && !!currentGroup?.id,
  });

  // Initialize messages state with query data
  useEffect(() => {
    console.log("Query Messages:", queryMessages);
    if (queryMessages.length > 0 && !currentGroup) {
      setMessages(queryMessages);
    }
  }, [queryMessages, currentGroup]);

  // Initialize group messages when joining a group
  useEffect(() => {
    console.log("Query Group Messages:", queryGroupMessages);
    if (queryGroupMessages.length > 0 && currentGroup) {
      setGroupMessages(queryGroupMessages);
    }
  }, [queryGroupMessages, currentGroup]);

  useEffect(() => {
    if (!user) return;

    const connectWebSocket = () => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnected(true);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setConnected(false);
        reconnectTimeoutRef.current = window.setTimeout(() => {
          if (user) {
            connectWebSocket();
          }
        }, 5000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received websocket message:', data);

          switch (data.type) {
            case 'new_message':
              console.log("New Message Received:", data.data);
              if (!currentGroup) {
                setMessages(prev => [...prev, data.data]);
              }
              break;
            case 'new_group_message':
              console.log('Received group message:', data.data);
              if (currentGroup && data.data.groupId === currentGroup.id) {
                const newMessage: Message = {
                  id: data.data.id,
                  content: data.data.content,
                  userId: data.data.userId,
                  groupId: data.data.groupId,
                  createdAt: data.data.createdAt,
                  user: {
                    username: data.data.user.username
                  }
                };
                setGroupMessages(prev => [...prev, newMessage]);
              }
              break;
            case 'group_created':
              console.log("Group Created:", data.data);
              setCurrentGroup(data.data);
              setGroupMessages([]);
              toast({
                title: "Success",
                description: `Group "${data.data.name}" created! Share this invite code with friends: ${data.data.inviteCode}`,
              });
              break;
            case 'group_joined':
              console.log("Group Joined:", data.data);
              setCurrentGroup(data.data);
              setGroupMessages([]);
              toast({
                title: "Success",
                description: `Joined group "${data.data.name}"!`,
              });
              break;
            case 'error':
              toast({
                title: "Error",
                description: data.message,
                variant: "destructive",
              });
              break;
          }
        } catch (error) {
          console.error('Error processing message:', error);
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
    };

    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [user, toast]);

  const sendMessage = () => {
    console.log("Sending Message:", messageInput);
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      toast({
        title: "Error",
        description: "Not connected to chat server",
        variant: "destructive",
      });
      return;
    }

    if (currentGroup) {
      socketRef.current.send(JSON.stringify({
        type: 'group_message',
        groupId: currentGroup.id,
        content: messageInput,
      }));
    } else {
      socketRef.current.send(JSON.stringify({
        type: 'message',
        videoId,
        content: messageInput,
      }));
    }

    setMessageInput('');
  };

  const createGroup = () => {
    console.log("Creating Group:", groupNameInput);
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      toast({
        title: "Error",
        description: "Not connected to server",
        variant: "destructive",
      });
      return;
    }

    socketRef.current.send(JSON.stringify({
      type: 'create_group',
      name: groupNameInput,
      videoId,
    }));

    setGroupNameInput('');
  };

  const joinGroup = () => {
    console.log("Joining Group:", inviteCode);
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      toast({
        title: "Error",
        description: "Not connected to server",
        variant: "destructive",
      });
      return;
    }

    socketRef.current.send(JSON.stringify({
      type: 'join_group',
      inviteCode,
    }));

    setInviteCode('');
  };

  const leaveGroup = () => {
    console.log("Leaving Group");
    setCurrentGroup(null);
    setGroupMessages([]);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, groupMessages.length]);

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
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-muted-foreground">
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          {!currentGroup && (
            <div className="flex items-center gap-2">
              <Dialog>
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

              <Dialog>
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
          {(currentGroup ? groupMessages : messages).length === 0 && (
            <p className="text-center text-muted-foreground">
              No messages yet. Start the conversation!
            </p>
          )}
          {(currentGroup ? groupMessages : messages).map((message) => (
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
            disabled={!messageInput.trim() || !connected}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}