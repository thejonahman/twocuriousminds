import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

// Maximum number of reconnection attempts
const MAX_RETRIES = 5;
// Initial delay in milliseconds (1 second)
const INITIAL_RETRY_DELAY = 1000;
// Maximum delay between retries (30 seconds)
const MAX_RETRY_DELAY = 30000;

interface ChatMessage {
  id: number;
  content: string;
  userId: number;
  createdAt: string;
  user?: {
    username: string;
  };
}

interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  retryCount: number;
  retryDelay: number;
}

export function ChatInterface({ videoId }: { videoId: number }) {
  const [message, setMessage] = useState("");
  const [wsState, setWsState] = useState<WebSocketState>({
    connected: false,
    connecting: false,
    retryCount: 0,
    retryDelay: INITIAL_RETRY_DELAY,
  });
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number>();
  const { toast } = useToast();

  const { data: messages, isLoading } = useQuery<ChatMessage[]>({
    queryKey: [`/api/messages/${videoId}`],
  });

  const mutation = useMutation({
    mutationFn: async (content: string) => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        throw new Error("Not connected to chat server");
      }

      const messageData = {
        type: 'message',
        videoId,
        content,
      };

      socketRef.current.send(JSON.stringify(messageData));
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/messages/${videoId}`] });
      setMessage("");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const connectWebSocket = () => {
    if (wsState.connecting || socketRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setWsState(prev => ({ ...prev, connecting: true }));

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setWsState({
          connected: true,
          connecting: false,
          retryCount: 0,
          retryDelay: INITIAL_RETRY_DELAY,
        });
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setWsState(prev => ({
          ...prev,
          connected: false,
          connecting: false,
        }));

        // Try to reconnect if we haven't exceeded max retries
        if (wsState.retryCount < MAX_RETRIES) {
          const nextDelay = Math.min(wsState.retryDelay * 2, MAX_RETRY_DELAY);
          console.log(`Reconnecting in ${nextDelay}ms...`);

          reconnectTimeoutRef.current = window.setTimeout(() => {
            setWsState(prev => ({
              ...prev,
              retryCount: prev.retryCount + 1,
              retryDelay: nextDelay,
            }));
            connectWebSocket();
          }, nextDelay);
        } else {
          toast({
            title: "Connection Lost",
            description: "Unable to connect to chat server. Please refresh the page.",
            variant: "destructive",
          });
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      setWsState(prev => ({
        ...prev,
        connected: false,
        connecting: false,
      }));
    }
  };

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      mutation.mutate(message);
    }
  };

  if (isLoading) {
    return (
      <Card className="h-[600px] flex flex-col">
        <CardHeader className="border-b p-4">
          <h3 className="font-semibold">Loading Discussion...</h3>
        </CardHeader>
        <CardContent className="flex-1 p-4 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="border-b p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Discussion</h3>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${wsState.connected ? 'bg-green-500' : wsState.connecting ? 'bg-yellow-500' : 'bg-red-500'}`} />
            <span className="text-sm text-muted-foreground">
              {wsState.connected ? 'Connected' : wsState.connecting ? 'Connecting...' : 'Disconnected'}
              {!wsState.connected && wsState.retryCount > 0 && ` (Attempt ${wsState.retryCount}/${MAX_RETRIES})`}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-4">
        <ScrollArea className="h-full">
          <div className="space-y-4">
            {!wsState.connected && !wsState.connecting && wsState.retryCount >= MAX_RETRIES && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>
                  Unable to connect to the chat server. Please try refreshing the page.
                </AlertDescription>
              </Alert>
            )}
            {messages?.map((msg) => (
              <div key={msg.id} className="bg-muted rounded-lg p-3">
                {msg.user && <p className="font-medium">{msg.user.username}</p>}
                <p>{msg.content}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex w-full gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message..."
            className="flex-1"
            disabled={!wsState.connected}
          />
          <Button type="submit" disabled={!wsState.connected || mutation.isPending}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}