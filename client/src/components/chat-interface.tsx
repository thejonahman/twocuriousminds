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

interface ChatMessage {
  id: number;
  content: string;
  userId: number;
  createdAt: string;
  user?: {
    username: string;
  };
}

export function ChatInterface({ videoId }: { videoId: number }) {
  const [message, setMessage] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();

  const { data: messages = [], isLoading } = useQuery<ChatMessage[]>({
    queryKey: [`/api/messages/${videoId}`],
  });

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

        if (data.type === 'message') {
          queryClient.invalidateQueries({ queryKey: [`/api/messages/${videoId}`] });
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };
  };

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

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
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      mutation.mutate(message);
      setMessage("");
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
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-muted-foreground">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-4">
        <ScrollArea className="h-full">
          <div className="space-y-4">
            {!isConnected && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>
                  Not connected to chat server. Messages may not be delivered.
                </AlertDescription>
              </Alert>
            )}
            {messages.map((msg) => (
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
            disabled={!isConnected}
          />
          <Button type="submit" disabled={!isConnected || mutation.isPending}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}