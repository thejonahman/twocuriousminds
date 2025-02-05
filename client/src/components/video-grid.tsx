import { Link } from "wouter";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Youtube, Instagram, Image, Pencil, Trash2 } from "lucide-react";
import { SiTiktok } from "react-icons/si";
import { useState, useEffect, useCallback, useRef } from "react";
import { EditVideoForm } from "./edit-video-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";

interface Video {
  id: number;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  platform: string;
  watched: boolean;
  description: string;
  category: {
    id: number;
    name: string;
  };
  subcategory: {
    id: number;
    name: string;
    displayOrder?: number;
  } | null;
  categoryId: number;
  subcategoryId?: number;
}

interface VideoGridProps {
  videos: Video[];
  showEditButton?: boolean;
}

export function VideoGrid({ videos, showEditButton = false }: VideoGridProps) {
  const [failedThumbnails, setFailedThumbnails] = useState<Set<number>>(new Set());
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
  const queryClient = useQueryClient();
  const gridRef = useRef<HTMLDivElement>(null);

  const deleteMutation = useMutation({
    mutationFn: async (videoId: number) => {
      const response = await apiRequest("DELETE", `/api/videos/${videoId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete video");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      toast({
        title: "Success",
        description: "Video deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Store scroll position when dialog opens
  const handleDialogOpen = useCallback((video: Video) => {
    setScrollPosition(window.scrollY);
    setSelectedVideo(video);
    setDialogOpen(true);
  }, []);

  // Restore scroll position when dialog closes
  const handleDialogClose = useCallback(() => {
    setDialogOpen(false);
    setSelectedVideo(null);
    // Wait for React to finish updating and dialog to close
    setTimeout(() => {
      window.scrollTo({
        top: scrollPosition,
        behavior: "instant"
      });
    }, 100);
  }, [scrollPosition]);

  const getPlatformIcon = (platform: string) => {
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
  };

  const handleThumbnailError = (videoId: number) => {
    setFailedThumbnails(prev => {
      const newSet = new Set(prev);
      newSet.add(videoId);
      return newSet;
    });
  };

  const handleDelete = (videoId: number) => {
    deleteMutation.mutate(videoId);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" ref={gridRef}>
      {videos.map((video) => (
        <Card key={video.id} className="overflow-hidden bg-card hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] hover:-translate-y-1 border-accent/20">
          <Link href={`/video/${video.id}`}>
            <AspectRatio ratio={16 / 9}>
              <div className="w-full h-full bg-muted/50 relative group">
                <div 
                  className={`absolute inset-0 flex items-center justify-center ${
                    video.thumbnailUrl && !failedThumbnails.has(video.id) ? 'opacity-0' : 'opacity-100'
                  } transition-opacity duration-200 bg-muted/10 backdrop-blur-sm`}
                >
                  {getPlatformIcon(video.platform)}
                </div>
                {video.thumbnailUrl && !failedThumbnails.has(video.id) && (
                  <img
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                    onError={() => handleThumbnailError(video.id)}
                  />
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent h-1/2 transition-opacity opacity-0 group-hover:opacity-100" />
                <div className="absolute top-2 right-2 z-10">
                  <Badge 
                    variant={video.watched ? "secondary" : "outline"}
                    className="flex items-center gap-1.5 bg-background/95 backdrop-blur-sm shadow-sm"
                  >
                    {video.watched ? (
                      <>
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Watched</span>
                      </>
                    ) : (
                      <>
                        {getPlatformIcon(video.platform)}
                        <span className="capitalize">{video.platform}</span>
                      </>
                    )}
                  </Badge>
                </div>
              </div>
            </AspectRatio>
          </Link>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="capitalize bg-primary/10">
                  {video.platform}
                </Badge>
                {video.subcategory && (
                  <Badge variant="outline" className="border-accent/20">
                    {video.subcategory.name}
                  </Badge>
                )}
              </div>
              {showEditButton && (
                <div className="flex items-center gap-2">
                  <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={(e) => {
                          e.preventDefault();
                          handleDialogOpen(video);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Edit Video</DialogTitle>
                      </DialogHeader>
                      {selectedVideo && (
                        <EditVideoForm 
                          video={selectedVideo} 
                          onClose={handleDialogClose}
                        />
                      )}
                    </DialogContent>
                  </Dialog>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive/90"
                        onClick={(e) => e.preventDefault()}
                      >
                        <Trash2 className="h-4 w-4" />
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
                          onClick={(e) => {
                            e.preventDefault();
                            handleDelete(video.id);
                          }}
                          className="bg-destructive hover:bg-destructive/90"
                        >
                          Delete
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
  );
}