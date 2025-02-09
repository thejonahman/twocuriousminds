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
import { Send, MessageSquare } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

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
}

export function DiscussionGroup({ videoId }: DiscussionGroupProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messageInput, setMessageInput] = useState("");
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch messages
  const { data: messages = [], refetch: refetchMessages } = useQuery<Message[]>({
    queryKey: ['/api/messages', videoId],
    queryFn: () => fetch(`/api/messages?videoId=${videoId}`).then(r => r.json()),
    enabled: !!user && !!videoId,
  });

  // Setup WebSocket
  useEffect(() => {
    if (!user) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'new_message') {
          refetchMessages();
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    };

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [user]);

  // Send message
  const sendMessage = () => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      toast({
        title: "Error",
        description: "Not connected to chat server",
        variant: "destructive",
      });
      return;
    }

    socketRef.current.send(JSON.stringify({
      type: 'message',
      videoId,
      content: messageInput,
    }));

    setMessageInput('');
  };

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (!user) return null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Discussion Group
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-muted-foreground">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        <div className="h-[300px] space-y-4 overflow-y-auto p-4 border rounded-lg">
          {messages.length === 0 && (
            <p className="text-center text-muted-foreground">
              No messages yet. Start the conversation!
            </p>
          )}
          {messages.map((message) => (
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
            placeholder="Type your message..."
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