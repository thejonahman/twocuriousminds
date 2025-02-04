import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CheckCircle2, Clock, Youtube, Instagram, Image, Pencil } from "lucide-react";
import { SiTiktok } from "react-icons/si";
import { useState } from "react";
import { EditVideoForm } from "./edit-video-form";

interface Video {
  id: number;
  title: string;
  thumbnailUrl: string | null;
  platform: string;
  watched: boolean;
  subcategory: {
    name: string;
  } | null;
  description?: string;
  categoryId: number;
  subcategoryId?: number;
  url: string;
}

interface VideoGridProps {
  videos: Video[];
  showEditButton?: boolean;
}

export function VideoGrid({ videos, showEditButton = false }: VideoGridProps) {
  const [failedThumbnails, setFailedThumbnails] = useState<Set<number>>(new Set());
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);

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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
                <Dialog>
                  <DialogTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={(e) => {
                        e.preventDefault();
                        setSelectedVideo(video);
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
                      <EditVideoForm video={selectedVideo} />
                    )}
                  </DialogContent>
                </Dialog>
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