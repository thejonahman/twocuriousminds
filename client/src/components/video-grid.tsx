import { Link } from "wouter";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Youtube, Instagram, Image, Pencil, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { SiTiktok } from "react-icons/si";
import { useState, useCallback, useRef, memo } from "react";
import { EditVideoForm } from "./edit-video-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Video } from "@/lib/types";
import { ErrorBoundary } from "./error-boundary";

// Platform icon component with increased size for better visibility
const PlatformIcon = memo(({ platform }: { platform: string }) => {
  const size = "h-12 w-12"; // Increased size for better visibility
  switch (platform.toLowerCase()) {
    case 'youtube':
      return <Youtube className={`${size} text-red-500`} />;
    case 'tiktok':
      return <SiTiktok className={`${size} text-black dark:text-white`} />;
    case 'instagram':
      return <Instagram className={`${size} text-pink-500`} />;
    default:
      return <Image className={`${size} text-muted-foreground`} />;
  }
});

interface VideoGridProps {
  videos: Video[];
  showEditButton?: boolean;
  highlightVideoId?: number;
}

function VideoGridComponent({ videos, showEditButton = false, highlightVideoId }: VideoGridProps) {
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
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
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

  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const img = e.currentTarget;
    console.log('[VideoGrid] Image failed to load:', {
      src: img.src,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      error: e
    });

    img.style.display = 'none';
    const container = img.parentElement;
    if (container) {
      const fallback = container.querySelector('.fallback-icon');
      if (fallback) {
        fallback.classList.remove('hidden');
      }
    }
  }, []);

  if (!videos || videos.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No videos found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {videos.map((video) => (
        <Card
          key={video.id}
          className={`overflow-hidden bg-card hover:shadow-xl transition-all duration-300 ${
            video.id === highlightVideoId ? 'ring-2 ring-primary ring-offset-2' : ''
          }`}
        >
          <Link href={`/video/${video.id}`} className="block group">
            <AspectRatio ratio={16 / 9}>
              <div className="w-full h-full bg-muted/50 relative">
                {video.thumbnailUrl && (
                  <img
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className="w-full h-full object-cover absolute inset-0 transition-opacity duration-200"
                    onError={handleImageError}
                    loading="lazy"
                  />
                )}
                <div className={`fallback-icon absolute inset-0 flex items-center justify-center bg-muted/20 ${video.thumbnailUrl ? 'hidden' : ''}`}>
                  <PlatformIcon platform={video.platform} />
                </div>
                <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
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
              <Link href={`/video/${video.id}`} className="hover:text-primary transition-colors duration-200">
                {video.title}
              </Link>
            </h3>
          </CardContent>
        </Card>
      ))}

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
    </div>
  );
}

// Wrap the component with error boundary using the HOC pattern
const withErrorBoundary = (Component: React.ComponentType<any>, FallbackComponent: React.ReactElement) => {
  return function WrappedComponent(props: any) {
    return (
      <ErrorBoundary FallbackComponent={FallbackComponent}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
};

export const VideoGrid = withErrorBoundary(VideoGridComponent, (
  <div className="p-6 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive space-y-4">
    <div className="flex items-center gap-2">
      <AlertTriangle className="h-5 w-5" />
      <h2 className="text-lg font-semibold">Failed to load videos</h2>
    </div>
    <p className="text-sm">
      There was an error loading the video grid. Please try refreshing the page.
    </p>
    <Button 
      variant="destructive"
      onClick={() => window.location.reload()}
      className="w-full justify-center"
    >
      Refresh page
    </Button>
  </div>
));