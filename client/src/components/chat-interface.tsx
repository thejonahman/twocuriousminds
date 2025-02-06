import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";

interface ChatMessage {
  id: number;
  question: string;
  answer: string;
}

const MessageBubble = motion.div;

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
        <motion.h3 
          className="font-semibold"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          Ask Questions
        </motion.h3>
      </CardHeader>
      <CardContent className="flex-1 p-4">
        <ScrollArea className="h-full">
          <AnimatePresence>
            <div className="space-y-4">
              {messages?.map((message) => (
                <motion.div 
                  key={message.id} 
                  className="space-y-2"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <MessageBubble
                    className="bg-muted rounded-lg p-3"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  >
                    <p className="font-medium">You</p>
                    <p>{message.question}</p>
                  </MessageBubble>
                  <MessageBubble
                    className="bg-primary/10 rounded-lg p-3"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ 
                      type: "spring", 
                      stiffness: 500, 
                      damping: 30,
                      delay: 0.2 
                    }}
                  >
                    <p className="font-medium">AI Assistant</p>
                    <p>{message.answer}</p>
                  </MessageBubble>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        </ScrollArea>
      </CardContent>
      <CardFooter className="border-t p-4">
        <motion.form 
          onSubmit={handleSubmit} 
          className="flex w-full gap-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question about the video..."
            className="flex-1"
          />
          <Button 
            type="submit" 
            disabled={mutation.isPending}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Send className="h-4 w-4" />
          </Button>
        </motion.form>
      </CardFooter>
    </Card>
  );
}