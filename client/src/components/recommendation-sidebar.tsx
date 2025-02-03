import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Youtube, Instagram } from "lucide-react";
import { SiTiktok } from "react-icons/si";

interface Video {
  id: number;
  title: string;
  thumbnailUrl: string | null;
  platform: string;
  subcategory: {
    name: string;
  } | null;
}

export function RecommendationSidebar({ 
  currentVideoId,
  categoryId,
  subcategoryId 
}: { 
  currentVideoId: number;
  categoryId: number;
  subcategoryId?: number;
}) {
  const { data: recommendations, isLoading } = useQuery<Video[]>({
    queryKey: [`/api/videos/${currentVideoId}/recommendations`],
  });

  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'youtube':
        return <Youtube className="h-4 w-4 text-red-500" />;
      case 'tiktok':
        return <SiTiktok className="h-4 w-4 text-black" />;
      case 'instagram':
        return <Instagram className="h-4 w-4 text-pink-500" />;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold">Related Videos</h3>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-20 bg-muted rounded-lg mb-2" />
              <div className="h-4 bg-muted rounded w-3/4" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!recommendations?.length) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold">Related Videos</h3>
      </CardHeader>
      <CardContent className="space-y-4">
        {recommendations.map((video) => (
          <Link 
            key={video.id} 
            href={`/video/${video.id}`}
            className="block"
          >
            <div className="group space-y-2">
              <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                {video.thumbnailUrl && (
                  <img
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                )}
                <div className="absolute top-2 right-2">
                  <Badge variant="secondary" className="flex items-center gap-1">
                    {getPlatformIcon(video.platform)}
                    <span className="capitalize">{video.platform}</span>
                  </Badge>
                </div>
              </div>
              <div>
                <h4 className="font-medium line-clamp-2 group-hover:text-primary transition-colors">
                  {video.title}
                </h4>
                {video.subcategory && (
                  <Badge variant="outline" className="mt-1">
                    {video.subcategory.name}
                  </Badge>
                )}
              </div>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
