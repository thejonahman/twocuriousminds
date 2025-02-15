import { Link } from "wouter";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Youtube, Instagram, Image, Pencil, Trash2, Loader2 } from "lucide-react";
import { SiTiktok } from "react-icons/si";
import { useState, useCallback, useRef, memo } from "react";
import { EditVideoForm } from "./edit-video-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Video } from "@/lib/types";
import { ErrorBoundary } from "./error-boundary";

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
  const scrollPositionRef = useRef(0);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (videoId: number) => {
      console.log('[Delete] Starting delete mutation for video:', videoId);
      setDeletingVideoId(videoId);

      try {
        const response = await apiRequest("DELETE", `/api/videos/${videoId}`);
        console.log('[Delete] API Response:', { status: response.status });

        if (!response.ok) {
          throw new Error('Failed to delete video');
        }

        const data = await response.json();
        console.log('[Delete] Success response:', data);
        return data;
      } catch (error) {
        console.error('[Delete] Error in mutation:', error);
        throw error;
      }
    },
    onSuccess: (data, videoId) => {
      console.log('[Delete] Successfully deleted video:', videoId);
      // Update the cache optimistically
      const previousVideos = queryClient.getQueryData<Video[]>(["/api/videos"]);
      if (previousVideos) {
        const updatedVideos = previousVideos.filter(video => video.id !== videoId);
        queryClient.setQueryData(["/api/videos"], updatedVideos);
      }

      toast({
        title: "Success",
        description: "Video deleted successfully",
      });
    },
    onError: (error) => {
      console.error('[Delete] Delete mutation error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete video",
        variant: "destructive",
      });
    },
    onSettled: () => {
      console.log('[Delete] Mutation settled, clearing state');
      setDeletingVideoId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
    },
  });

  const handleDelete = useCallback((videoId: number) => {
    console.log('[Delete] handleDelete called for video:', videoId);
    deleteMutation.mutate(videoId);
  }, [deleteMutation]);

  const handleDialogOpen = useCallback((video: Video) => {
    scrollPositionRef.current = window.scrollY;
    setSelectedVideo(video);
    setDialogOpen(true);
  }, []);

  return (
    <ErrorBoundary>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {videos.map((video) => (
          <Card
            key={video.id}
            className={`overflow-hidden bg-card hover:shadow-xl transition-all duration-300 ${
              video.id === highlightVideoId ? 'ring-2 ring-primary ring-offset-2' : ''
            }`}
          >
            <AspectRatio ratio={16 / 9}>
              <div className="w-full h-full bg-muted/50 relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <PlatformIcon platform={video.platform} />
                </div>
              </div>
            </AspectRatio>

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
                      onClick={() => handleDialogOpen(video)}
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
                          disabled={deletingVideoId === video.id}
                        >
                          {deletingVideoId === video.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </AlertDialogTrigger>

                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Video</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{video.title}"? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive hover:bg-destructive/90"
                            disabled={deletingVideoId === video.id}
                            onClick={() => handleDelete(video.id)}
                          >
                            {deletingVideoId === video.id ? (
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
                <Link href={`/video/${video.id}`}>
                  {video.title}
                </Link>
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
    </ErrorBoundary>
  );
}

interface VideoGridProps {
  videos: Video[];
  showEditButton?: boolean;
  highlightVideoId?: number;
}