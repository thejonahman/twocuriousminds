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
import { Send, MessageSquare, Users } from "lucide-react";
import { type Message, type Group } from "@/lib/api-types";
import { useLocation } from "wouter";

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
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Basic queries without complex conditions
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: [`/api/messages/${videoId}`],
    enabled: !currentGroup,
  });

  const { data: groupMessages = [] } = useQuery<Message[]>({
    queryKey: [`/api/group-messages/${currentGroup?.id}`],
    enabled: !!currentGroup?.id,
  });

  // Keep WebSocket connection alive
  useEffect(() => {
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
          console.log('Received message:', data);

          if (data.type === 'message' && !currentGroup) {
            queryClient.invalidateQueries({ queryKey: [`/api/messages/${videoId}`] });
          } else if (data.type === 'group_message' && currentGroup?.id === data.groupId) {
            queryClient.invalidateQueries({ queryKey: [`/api/group-messages/${currentGroup.id}`] });
          }

          // Scroll to bottom on new message
          setTimeout(() => {
            if (messagesEndRef.current) {
              messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
            }
          }, 100);
        } catch (error) {
          console.error('Error processing message:', error);
        }
      };
    };

    connectWebSocket();
    return () => socketRef.current?.close();
  }, [currentGroup, queryClient, videoId]);

  const sendMessage = () => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      toast({
        title: "Error",
        description: "Not connected to chat server",
        variant: "destructive",
      });
      return;
    }

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

    try {
      socketRef.current.send(JSON.stringify(messageData));
      setMessageInput("");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send message",
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

  // Get the current messages to display
  const displayMessages = currentGroup ? groupMessages : messages;

  // Sort messages by creation time
  const sortedMessages = [...displayMessages].sort(
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
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="h-[300px] space-y-4 overflow-y-auto p-4 border rounded-lg">
          {sortedMessages.length === 0 ? (
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