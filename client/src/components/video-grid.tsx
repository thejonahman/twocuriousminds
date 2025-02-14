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

interface ThumbnailState {
  loading: Set<number>;
  failed: Set<number>;
}

// Memoized platform icon component
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

// Memoized thumbnail component with performance monitoring
const VideoThumbnail = memo(({ video, thumbnailState, onThumbnailStateChange }: {
  video: Video;
  thumbnailState: ThumbnailState;
  onThumbnailStateChange: (videoId: number, type: 'loading' | 'failed', value: boolean) => void;
}) => {
  const startTime = useRef(performance.now());

  useEffect(() => {
    const loadTime = performance.now() - startTime.current;
    console.log(`Thumbnail component mounted for video ${video.id} in ${loadTime.toFixed(2)}ms`);

    return () => {
      console.log(`Thumbnail component unmounted for video ${video.id}`);
    };
  }, [video.id]);

  const handleThumbnailLoading = useCallback(() => {
    console.log(`Starting to load thumbnail for video ${video.id}`);
    onThumbnailStateChange(video.id, 'loading', true);
  }, [video.id, onThumbnailStateChange]);

  const handleThumbnailLoaded = useCallback(() => {
    const loadTime = performance.now() - startTime.current;
    console.log(`Thumbnail loaded for video ${video.id} in ${loadTime.toFixed(2)}ms`);
    onThumbnailStateChange(video.id, 'loading', false);
  }, [video.id, onThumbnailStateChange]);

  const handleThumbnailError = useCallback(() => {
    console.error(`Failed to load thumbnail for video ${video.id}`, {
      url: video.thumbnailUrl,
      platform: video.platform
    });
    onThumbnailStateChange(video.id, 'failed', true);
    onThumbnailStateChange(video.id, 'loading', false);
  }, [video.id, onThumbnailStateChange, video.thumbnailUrl, video.platform]);

  return (
    <AspectRatio ratio={16 / 9}>
      <div className="w-full h-full bg-muted/50 relative group">
        <div
          className={`absolute inset-0 flex items-center justify-center ${
            video.thumbnailUrl && !thumbnailState.failed.has(video.id) && !thumbnailState.loading.has(video.id)
              ? 'opacity-0'
              : 'opacity-100'
          } transition-opacity duration-200 bg-muted/10 backdrop-blur-sm`}
        >
          {thumbnailState.loading.has(video.id) ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            <PlatformIcon platform={video.platform} />
          )}
        </div>
        {video.thumbnailUrl && !thumbnailState.failed.has(video.id) && (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onLoadStart={handleThumbnailLoading}
            onLoad={handleThumbnailLoaded}
            onError={handleThumbnailError}
          />
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent h-1/2 transition-opacity opacity-0 group-hover:opacity-100" />
      </div>
    </AspectRatio>
  );
});

export function VideoGrid({ videos, showEditButton = false, highlightVideoId }: VideoGridProps) {
  const startTime = useRef(performance.now());
  const [thumbnailState, setThumbnailState] = useState<ThumbnailState>({
    loading: new Set(),
    failed: new Set()
  });
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingVideoId, setDeletingVideoId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const scrollPositionRef = useRef(0);
  const queryClient = useQueryClient();
  const gridRef = useRef<HTMLDivElement>(null);

  // Effect to scroll to highlighted video
  useEffect(() => {
    if (highlightVideoId && gridRef.current) {
      const videoElement = gridRef.current.querySelector(`[data-video-id="${highlightVideoId}"]`);
      if (videoElement) {
        requestAnimationFrame(() => {
          videoElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          videoElement.classList.add('highlight-animation');
          setTimeout(() => {
            videoElement.classList.remove('highlight-animation');
          }, 2000);
        });
      }
    }
  }, [highlightVideoId]);

  // Performance monitoring
  useEffect(() => {
    const renderTime = performance.now() - startTime.current;
    console.log('VideoGrid rendered with:', {
      totalVideos: videos.length,
      thumbnailStates: {
        loading: Array.from(thumbnailState.loading),
        failed: Array.from(thumbnailState.failed)
      },
      highlightVideoId,
      renderTime: `${renderTime.toFixed(2)}ms`
    });
  }, [videos.length, thumbnailState, highlightVideoId]);

  const handleThumbnailStateChange = useCallback((videoId: number, type: 'loading' | 'failed', value: boolean) => {
    console.log('Thumbnail state change:', { videoId, type, value });
    setThumbnailState(prev => {
      const newState = { ...prev };
      const set = new Set(prev[type]);
      if (value) {
        set.add(videoId);
      } else {
        set.delete(videoId);
      }
      newState[type] = set;
      return newState;
    });
  }, []);

  const deleteMutation = useMutation({
    mutationFn: async (videoId: number) => {
      setIsDeleting(true);
      const response = await apiRequest("DELETE", `/api/videos/${videoId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete video');
      }
      return response.json();
    },
    onMutate: (videoId) => {
      setDeletingVideoId(videoId);
      queryClient.cancelQueries({ queryKey: ["/api/videos"] });
      const previousVideos = queryClient.getQueryData<Video[]>(["/api/videos"]);
      queryClient.setQueryData<Video[]>(["/api/videos"],
        old => old?.filter(video => video.id !== videoId) || []
      );
      return { previousVideos };
    },
    onError: (err: Error, _, context) => {
      if (context?.previousVideos) {
        queryClient.setQueryData(["/api/videos"], context.previousVideos);
      }
      toast({
        title: "Error",
        description: err.message || "Failed to delete video",
        variant: "destructive",
      });
    },
    onSuccess: () => {
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

  const handleDialogClose = useCallback(() => {
    setDialogOpen(false);
    setTimeout(() => setSelectedVideo(null), 300);
  }, []);

  const handleDialogOpen = useCallback((video: Video) => {
    scrollPositionRef.current = window.scrollY;
    setSelectedVideo(video);
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback(async (videoId: number) => {
    if (isDeleting) return;
    try {
      await deleteMutation.mutateAsync(videoId);
    } catch (error) {
      console.error('Error in handleDelete:', error);
    }
  }, [deleteMutation, isDeleting]);

  return (
    <ErrorBoundary>
      <>
        <style>{`
          .highlight-animation {
            animation: highlight 2s ease-in-out;
          }
          @keyframes highlight {
            0%, 100% {
              transform: scale(1);
              box-shadow: 0 0 0 0 rgba(var(--primary) / 0.1);
            }
            50% {
              transform: scale(1.02);
              box-shadow: 0 0 0 8px rgba(var(--primary) / 0.1);
            }
          }
        `}</style>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" ref={gridRef}>
          {videos.map((video) => (
            <Card
              key={video.id}
              data-video-id={video.id}
              className={`overflow-hidden bg-card hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] hover:-translate-y-1 border-accent/20 ${
                video.id === highlightVideoId ? 'ring-2 ring-primary ring-offset-2' : ''
              }`}
            >
              <Link href={`/video/${video.id}`}>
                <VideoThumbnail
                  video={video}
                  thumbnailState={thumbnailState}
                  onThumbnailStateChange={handleThumbnailStateChange}
                />
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
                          e.stopPropagation();
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
                          onOpenAutoFocus={(e) => e.preventDefault()}
                          className="sm:max-w-[425px]"
                        >
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Video</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{video.title}"? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel
                              onClick={(e) => e.stopPropagation()}
                              disabled={isDeleting}
                            >
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDelete(video.id);
                              }}
                              className="bg-destructive hover:bg-destructive/90"
                              disabled={isDeleting}
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
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Video</DialogTitle>
            </DialogHeader>
            {selectedVideo && (
              <EditVideoForm
                video={selectedVideo}
                onClose={handleDialogClose}
                scrollPosition={scrollPositionRef.current}
              />
            )}
          </DialogContent>
        </Dialog>
      </>
    </ErrorBoundary>
  );
}

export default function SafeVideoGrid(props: VideoGridProps) {
  return (
    <ErrorBoundary>
      <VideoGrid {...props} />
    </ErrorBoundary>
  );
}