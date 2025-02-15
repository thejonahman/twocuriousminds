import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
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
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: messages, isLoading, error } = useQuery<ChatMessage[]>({
    queryKey: [`/api/messages/${videoId}`],
  });

  const mutation = useMutation({
    mutationFn: async (content: string) => {
      try {
        const res = await apiRequest("POST", "/api/messages", {
          videoId,
          content,
        });
        if (!res.ok) {
          throw new Error("Failed to send message");
        }
        return res.json();
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : "Failed to send message");
      }
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      mutation.mutate(message);
    }
  };

  if (error) {
    return (
      <Card className="h-[600px] flex flex-col">
        <CardHeader className="border-b p-4">
          <h3 className="font-semibold text-destructive">Error loading messages</h3>
        </CardHeader>
        <CardContent className="flex-1 p-4 flex items-center justify-center">
          <p className="text-muted-foreground">Failed to load messages. Please try again later.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="border-b p-4">
        <h3 className="font-semibold">Discussion</h3>
      </CardHeader>
      <CardContent className="flex-1 p-4">
        <ScrollArea className="h-full">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {messages?.map((msg) => (
                <div key={msg.id} className="bg-muted rounded-lg p-3">
                  {msg.user && <p className="font-medium">{msg.user.username}</p>}
                  <p>{msg.content}</p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
      <CardFooter className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex w-full gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message..."
            className="flex-1"
            disabled={mutation.isPending}
          />
          <Button 
            type="submit" 
            disabled={mutation.isPending || !message.trim()}
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}