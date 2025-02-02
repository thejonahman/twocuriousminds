import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Image } from "lucide-react";
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
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {videos.map((video) => (
        <Link key={video.id} href={`/video/${video.id}`}>
          <Card className="overflow-hidden hover:shadow-lg transition-shadow">
            <AspectRatio ratio={16 / 9}>
              <div className="w-full h-full bg-muted relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <Image className="h-8 w-8 text-muted-foreground" />
                </div>
                {video.thumbnailUrl && (
                  <img
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.style.display = 'none';
                    }}
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