import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Youtube, Instagram, Image } from "lucide-react";
import { SiTiktok } from "react-icons/si";
import { useState } from "react";

interface Video {
  id: number;
  title: string;
  thumbnailUrl: string | null;
  platform: string;
  watched: boolean;
  subcategory: {
    name: string;
  } | null;
}

export function VideoGrid({ videos }: { videos: Video[] }) {
  const [failedThumbnails, setFailedThumbnails] = useState<Set<number>>(new Set());

  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'youtube':
        return <Youtube className="h-8 w-8 text-red-500" />;
      case 'tiktok':
        return <SiTiktok className="h-8 w-8 text-black dark:text-white" />;
      case 'instagram':
        return <Instagram className="h-8 w-8 text-pink-500" />;
      default:
        return <Image className="h-8 w-8 text-muted-foreground" />;
    }
  };

  const handleThumbnailError = (videoId: number) => {
    setFailedThumbnails(prev => new Set([...prev, videoId]));
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {videos.map((video) => (
        <Link key={video.id} href={`/video/${video.id}`}>
          <Card className="overflow-hidden hover:shadow-lg transition-shadow group">
            <AspectRatio ratio={16 / 9}>
              <div className="w-full h-full bg-muted relative group-hover:brightness-90 transition-all">
                <div className={`absolute inset-0 flex items-center justify-center ${video.thumbnailUrl && !failedThumbnails.has(video.id) ? 'opacity-0' : 'opacity-100'}`}>
                  {getPlatformIcon(video.platform)}
                </div>
                {video.thumbnailUrl && !failedThumbnails.has(video.id) && (
                  <img
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className="absolute inset-0 w-full h-full object-cover transition-opacity duration-200"
                    loading="lazy"
                    onError={() => handleThumbnailError(video.id)}
                  />
                )}
                <div className="absolute top-2 right-2 z-10">
                  <Badge 
                    variant={video.watched ? "secondary" : "outline"}
                    className="flex items-center gap-1 bg-background/80 backdrop-blur-sm"
                  >
                    {video.watched ? (
                      <>
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Watched</span>
                      </>
                    ) : (
                      <>
                        <Clock className="h-3 w-3" />
                        <span>Watch Later</span>
                      </>
                    )}
                  </Badge>
                </div>
              </div>
            </AspectRatio>
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Badge variant="secondary" className="capitalize">
                    {video.platform}
                  </Badge>
                  {video.subcategory && (
                    <Badge variant="outline">
                      {video.subcategory.name}
                    </Badge>
                  )}
                </div>
                <h3 className="font-semibold leading-none tracking-tight line-clamp-2">
                  {video.title}
                </h3>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}