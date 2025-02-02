import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock } from "lucide-react";

interface Video {
  id: number;
  title: string;
  thumbnailUrl: string;
  platform: string;
  watched: boolean;
}

export function VideoGrid({ videos }: { videos: Video[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {videos.map((video) => (
        <Link key={video.id} href={`/video/${video.id}`}>
          <Card className="overflow-hidden hover:shadow-lg transition-shadow">
            <AspectRatio ratio={16 / 9}>
              <img
                src={video.thumbnailUrl}
                alt={video.title}
                className="object-cover w-full h-full"
                loading="lazy"
              />
              <div className="absolute top-2 right-2">
                <Badge 
                  variant={video.watched ? "secondary" : "outline"}
                  className="flex items-center gap-1"
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
            </AspectRatio>
            <CardContent className="p-4">
              <div className="space-y-2">
                <Badge variant="secondary" className="capitalize">
                  {video.platform}
                </Badge>
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