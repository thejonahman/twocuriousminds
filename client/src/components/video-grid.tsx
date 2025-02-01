import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";

interface Video {
  id: number;
  title: string;
  thumbnailUrl: string;
  platform: string;
  category: {
    name: string;
  };
}

export function VideoGrid({ videos }: { videos: Video[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {videos.map((video) => (
        <Link key={video.id} href={`/video/${video.id}`}>
          <Card className="overflow-hidden hover:shadow-lg transition-shadow">
            <AspectRatio ratio={16 / 9}>
              <img
                src={video.thumbnailUrl}
                alt={video.title}
                className="object-cover w-full h-full"
              />
            </AspectRatio>
            <CardContent className="p-4">
              <div className="space-y-2">
                <Badge variant="secondary">{video.platform}</Badge>
                <h3 className="font-semibold leading-none tracking-tight">
                  {video.title}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {video.category.name}
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
