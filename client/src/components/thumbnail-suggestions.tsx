import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

interface ThumbnailSuggestion {
  imageUrl: string;
  confidence: number;
  reasoning: string;
}

export function ThumbnailSuggestions({ videoId }: { videoId: number }) {
  const { toast } = useToast();
  const [selectedThumbnail, setSelectedThumbnail] = useState<string | null>(null);

  const { data: suggestions, isLoading } = useQuery<ThumbnailSuggestion[]>({
    queryKey: [`/api/videos/${videoId}/suggest-thumbnails`],
    enabled: !!videoId,
  });

  const handleSelectThumbnail = (imageUrl: string) => {
    setSelectedThumbnail(imageUrl);
    toast({
      title: "Thumbnail selected",
      description: "The thumbnail has been selected and will be updated shortly.",
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">AI Thumbnail Suggestions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="w-full aspect-video rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!suggestions?.length) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">AI Thumbnail Suggestions</h3>
      <ScrollArea className="h-[400px] rounded-md border p-4">
        <div className="grid grid-cols-1 gap-4">
          {suggestions.map((suggestion, index) => (
            <Card key={index} className="p-4 space-y-4">
              <div className="aspect-video relative rounded-lg overflow-hidden">
                <img
                  src={suggestion.imageUrl}
                  alt={`Thumbnail suggestion ${index + 1}`}
                  className="object-cover w-full h-full"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Confidence: {suggestion.confidence}%
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => handleSelectThumbnail(suggestion.imageUrl)}
                    disabled={selectedThumbnail === suggestion.imageUrl}
                  >
                    {selectedThumbnail === suggestion.imageUrl
                      ? "Selected"
                      : "Select"}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {suggestion.reasoning}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
