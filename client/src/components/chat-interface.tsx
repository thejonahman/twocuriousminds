import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ChatMessage {
  id: number;
  question: string;
  answer: string;
}

export function ChatInterface({ videoId }: { videoId: number }) {
  const [question, setQuestion] = useState("");
  const queryClient = useQueryClient();

  const { data: messages, isLoading } = useQuery<ChatMessage[]>({
    queryKey: [`/api/chat/${videoId}`],
  });

  const mutation = useMutation({
    mutationFn: async (question: string) => {
      const res = await apiRequest("POST", "/api/chat", {
        videoId,
        question,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/chat/${videoId}`] });
      setQuestion("");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim()) {
      mutation.mutate(question);
    }
  };

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="border-b p-4">
        <h3 className="font-semibold">Ask Questions</h3>
      </CardHeader>
      <CardContent className="flex-1 p-4">
        <ScrollArea className="h-full">
          <div className="space-y-4">
            {messages?.map((message) => (
              <div key={message.id} className="space-y-2">
                <div className="bg-muted rounded-lg p-3">
                  <p className="font-medium">You</p>
                  <p>{message.question}</p>
                </div>
                <div className="bg-primary/10 rounded-lg p-3">
                  <p className="font-medium">AI Assistant</p>
                  <p>{message.answer}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex w-full gap-2">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question about the video..."
            className="flex-1"
          />
          <Button type="submit" disabled={mutation.isPending}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}