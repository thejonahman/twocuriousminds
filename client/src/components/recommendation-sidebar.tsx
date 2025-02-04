import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Youtube, Instagram, ExternalLink, ThumbsUp, ThumbsDown } from "lucide-react";
import { SiTiktok } from "react-icons/si";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { PreferencesDialog } from "./preferences-dialog";

interface Video {
  id: number;
  title: string;
  thumbnailUrl: string | null;
  platform: string;
  category: {
    name: string;
  };
  subcategory: {
    name: string;
  } | null;
}

export function RecommendationSidebar({ 
  currentVideoId,
  categoryId,
  subcategoryId 
}: { 
  currentVideoId: number;
  categoryId: number;
  subcategoryId?: number;
}) {
  const [feedbackGiven, setFeedbackGiven] = useState<Record<number, boolean>>({});
  const queryClient = useQueryClient();

  const { data: recommendations, isLoading, error } = useQuery<Video[]>({
    queryKey: [`/api/videos/${currentVideoId}/recommendations`],
    retry: false,
  });

  const feedbackMutation = useMutation({
    mutationFn: async ({ recommendedId, isRelevant }: { recommendedId: number, isRelevant: boolean }) => {
      const res = await apiRequest(
        "POST", 
        `/api/videos/${currentVideoId}/recommendations/${recommendedId}/feedback`,
        { isRelevant }
      );
      return res.json();
    },
    onSuccess: (_, { recommendedId }) => {
      setFeedbackGiven(prev => ({ ...prev, [recommendedId]: true }));
      queryClient.invalidateQueries({ queryKey: [`/api/videos/${currentVideoId}/recommendations`] });
    },
  });

  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'youtube':
        return <Youtube className="h-4 w-4 text-red-500" />;
      case 'tiktok':
        return <SiTiktok className="h-4 w-4 text-black dark:text-white" />;
      case 'instagram':
        return <Instagram className="h-4 w-4 text-pink-500" />;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <Card className="backdrop-blur-sm bg-background/95">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Related Videos</h3>
            <p className="text-sm text-muted-foreground">Loading recommendations...</p>
          </div>
          <PreferencesDialog />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-video bg-muted rounded-lg animate-pulse" />
              <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error || !recommendations) {
    return (
      <Card className="backdrop-blur-sm bg-background/95">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Related Videos</h3>
            <p className="text-sm text-destructive">Unable to load recommendations</p>
          </div>
          <PreferencesDialog />
        </CardHeader>
        <CardContent className="p-4">
          <p className="text-muted-foreground text-center">
            Please try refreshing the page
          </p>
        </CardContent>
      </Card>
    );
  }


  const handleFeedback = (recommendedId: number, isRelevant: boolean) => {
    feedbackMutation.mutate({ recommendedId, isRelevant });
  };

  const firstRecommendation = recommendations[0];

  return (
    <Card className="backdrop-blur-sm bg-secondary/5 border-primary/10 shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between bg-secondary/10 rounded-t-lg">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Recommended For You</h3>
          {firstRecommendation && (
            <p className="text-sm text-muted-foreground">
              Based on {firstRecommendation.category.name}
              {firstRecommendation.subcategory && (
                <span className="inline-flex items-center">
                  <svg className="w-3 h-3 mx-1 text-muted-foreground/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                  {firstRecommendation.subcategory.name}
                </span>
              )}
            </p>
          )}
        </div>
        <PreferencesDialog />
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {recommendations.map((video) => (
          <div key={video.id} className="group relative space-y-2 rounded-lg transition-all duration-300 hover:bg-secondary/20 p-2 -mx-2">
            <Link 
              href={`/video/${video.id}`}
              className="block"
            >
              <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                {video.thumbnailUrl ? (
                  <>
                    <img
                      src={video.thumbnailUrl}
                      alt={video.title}
                      className="absolute inset-0 w-full h-full object-cover transition-all duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    <ExternalLink className="h-8 w-8" />
                  </div>
                )}
                <div className="absolute top-2 right-2">
                  <Badge 
                    variant="secondary" 
                    className={cn(
                      "flex items-center gap-1 transition-all duration-300",
                      "bg-background/80 backdrop-blur-sm",
                      "group-hover:bg-background/95 group-hover:shadow-md"
                    )}
                  >
                    {getPlatformIcon(video.platform)}
                    <span className="capitalize">{video.platform}</span>
                  </Badge>
                </div>
              </div>
            </Link>
            <div className="space-y-1">
              <h4 className="font-medium line-clamp-2 transition-colors duration-300 group-hover:text-primary">
                {video.title}
              </h4>
              <div className="flex items-center justify-between">
                {video.subcategory && (
                  <Badge 
                    variant="outline" 
                    className="transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground"
                  >
                    {video.subcategory.name}
                  </Badge>
                )}
                {!feedbackGiven[video.id] && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleFeedback(video.id, true)}
                      className="h-8 w-8"
                      disabled={feedbackMutation.isPending}
                    >
                      <ThumbsUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleFeedback(video.id, false)}
                      className="h-8 w-8"
                      disabled={feedbackMutation.isPending}
                    >
                      <ThumbsDown className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}