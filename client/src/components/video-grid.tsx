import { Link } from "wouter";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Youtube, Instagram, Image, Pencil, Trash2, Loader2 } from "lucide-react";
import { SiTiktok } from "react-icons/si";
import { useState, useCallback, useRef, useEffect, memo } from "react";
import { EditVideoForm } from "./edit-video-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Video } from "@/lib/types";
import { ErrorBoundary } from "./error-boundary";

interface VideoGridProps {
  videos: Video[];
  showEditButton?: boolean;
  highlightVideoId?: number;
}

// Platform icon component
const PlatformIcon = memo(({ platform }: { platform: string }) => {
  switch (platform.toLowerCase()) {
    case 'youtube':
      return <Youtube className="h-3 w-3 text-red-500" />;
    case 'tiktok':
      return <SiTiktok className="h-3 w-3 text-black dark:text-white" />;
    case 'instagram':
      return <Instagram className="h-3 w-3 text-pink-500" />;
    default:
      return <Image className="h-3 w-3 text-muted-foreground" />;
  }
});

export function VideoGrid({ videos, showEditButton = false, highlightVideoId }: VideoGridProps) {
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingVideoId, setDeletingVideoId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const scrollPositionRef = useRef(0);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (videoId: number) => {
      setIsDeleting(true);
      console.log('Attempting to delete video:', videoId);
      const response = await apiRequest("DELETE", `/api/videos/${videoId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete video');
      }
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to delete video');
      }
      return result;
    },
    onMutate: (videoId) => {
      console.log('Starting optimistic update for video deletion:', videoId);
      setDeletingVideoId(videoId);

      // Cancel any outgoing refetches
      queryClient.cancelQueries({ queryKey: ["/api/videos"] });

      // Get the current videos from cache
      const previousVideos = queryClient.getQueryData<Video[]>(["/api/videos"]);

      // Optimistically remove the video from the UI
      if (previousVideos) {
        queryClient.setQueryData<Video[]>(
          ["/api/videos"],
          previousVideos.filter(video => video.id !== videoId)
        );
      }

      return { previousVideos };
    },
    onError: (err: Error, videoId, context) => {
      console.error('Error deleting video:', videoId, err);
      // If the mutation fails, roll back to the previous state
      if (context?.previousVideos) {
        queryClient.setQueryData(["/api/videos"], context.previousVideos);
      }
      toast({
        title: "Error",
        description: err.message || "Failed to delete video",
        variant: "destructive",
      });
    },
    onSuccess: (data, videoId) => {
      console.log('Successfully deleted video:', videoId);
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      toast({
        title: "Success",
        description: "Video deleted successfully",
      });
    },
    onSettled: () => {
      setDeletingVideoId(null);
      setIsDeleting(false);
    }
  });

  const handleDelete = useCallback(async (videoId: number) => {
    if (isDeleting) return;
    try {
      console.log('Handling delete for video:', videoId);
      await deleteMutation.mutateAsync(videoId);
    } catch (error) {
      console.error('Error in handleDelete:', error);
    }
  }, [deleteMutation, isDeleting]);

  // Save scroll position when opening the edit dialog
  const handleDialogOpen = useCallback((video: Video) => {
    scrollPositionRef.current = window.scrollY;
    setSelectedVideo(video);
    setDialogOpen(true);
  }, []);

  return (
    <ErrorBoundary>
      <>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map((video) => (
            <Card
              key={video.id}
              data-video-id={video.id}
              className={`overflow-hidden bg-card hover:shadow-xl transition-all duration-300 ${
                video.id === highlightVideoId ? 'ring-2 ring-primary ring-offset-2' : ''
              }`}
            >
              <Link href={`/video/${video.id}`}>
                <AspectRatio ratio={16 / 9}>
                  <div className="w-full h-full bg-muted/50 relative">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <PlatformIcon platform={video.platform} />
                    </div>
                  </div>
                </AspectRatio>
              </Link>

              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="capitalize bg-primary/10">
                      {video.category.name}
                    </Badge>
                    {video.subcategory && (
                      <Badge variant="outline" className="border-accent/20">
                        {video.subcategory.name}
                      </Badge>
                    )}
                  </div>

                  {showEditButton && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.preventDefault();
                          handleDialogOpen(video);
                        }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive/90"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            disabled={isDeleting}
                          >
                            {isDeleting && deletingVideoId === video.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent
                          onClick={(e) => e.stopPropagation()}
                          className="sm:max-w-[425px]"
                        >
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Video</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{video.title}"? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDelete(video.id);
                              }}
                              className="bg-destructive hover:bg-destructive/90"
                              disabled={isDeleting && deletingVideoId === video.id}
                            >
                              {isDeleting && deletingVideoId === video.id ? (
                                <div className="flex items-center">
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  <span>Deleting...</span>
                                </div>
                              ) : (
                                'Delete'
                              )}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>
                <h3 className="font-semibold tracking-tight line-clamp-2 text-sm sm:text-base">
                  {video.title}
                </h3>
              </CardContent>
            </Card>
          ))}
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Video</DialogTitle>
            </DialogHeader>
            {selectedVideo && (
              <EditVideoForm
                video={selectedVideo}
                onClose={() => {
                  setDialogOpen(false);
                  setSelectedVideo(null);
                }}
                scrollPosition={scrollPositionRef.current}
              />
            )}
          </DialogContent>
        </Dialog>
      </>
    </ErrorBoundary>
  );
}