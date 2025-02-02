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
  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'youtube':
        return <Youtube className="h-8 w-8 text-red-500" />;
      case 'tiktok':
        return <SiTiktok className="h-8 w-8 text-black" />;
      case 'instagram':
        return <Instagram className="h-8 w-8 text-pink-500" />;
      default:
        return <Image className="h-8 w-8 text-muted-foreground" />;
    }
  };

  const getAspectRatio = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'tiktok':
        return 9/16; // TikTok vertical videos
      case 'instagram':
        return 1; // Instagram square format
      default:
        return 16/9; // YouTube and others
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {videos.map((video) => (
        <Link key={video.id} href={`/video/${video.id}`}>
          <Card className="overflow-hidden hover:shadow-lg transition-shadow">
            <AspectRatio ratio={getAspectRatio(video.platform)}>
              <div className="w-full h-full bg-muted relative">
                <div className="absolute inset-0 flex items-center justify-center z-10">
                  {getPlatformIcon(video.platform)}
                </div>
                {video.thumbnailUrl && (
                  <img
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.style.opacity = '0';
                      console.error(`Failed to load thumbnail for video ${video.id}:`, video.thumbnailUrl);
                    }}
                  />
                )}
                <div className="absolute top-2 right-2 z-20">
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