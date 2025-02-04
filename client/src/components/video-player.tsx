import { useState } from "react";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2 } from "lucide-react";

interface Video {
  url: string;
  platform: string;
}

export function VideoPlayer({ video }: { video: Video }) {
  const [isFullWidth, setIsFullWidth] = useState(false);

  const getEmbedUrl = (url: string, platform: string) => {
    try {
      switch (platform.toLowerCase()) {
        case 'youtube': {
          const youtubeId = url.split('v=')[1]?.split('&')[0];
          return `https://www.youtube.com/embed/${youtubeId}`;
        }
        case 'tiktok': {
          const videoId = url.split('/video/')[1]?.split('?')[0];
          return `https://www.tiktok.com/embed/${videoId}`;
        }
        case 'instagram': {
          const match = url.match(/\/(p|reel|share)\/([^/?]+)/);
          if (match) {
            const [, , id] = match;
            return `https://www.instagram.com/p/${id}/embed/`;
          }
          return url;
        }
        default:
          return url;
      }
    } catch (error) {
      console.error('Error parsing video URL:', error);
      return url;
    }
  };

  const embedUrl = getEmbedUrl(video.url, video.platform);

  const getAspectRatio = () => {
    switch (video.platform.toLowerCase()) {
      case 'tiktok':
        return 9/16; // TikTok vertical videos
      case 'instagram':
        return 4/5; // Instagram typical aspect ratio
      default:
        return 16/9; // YouTube and others
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsFullWidth(!isFullWidth)}
          className="flex items-center gap-2 shadow-sm hover:shadow"
        >
          {isFullWidth ? (
            <>
              <Minimize2 className="h-4 w-4" />
              <span className="hidden sm:inline">Compact View</span>
            </>
          ) : (
            <>
              <Maximize2 className="h-4 w-4" />
              <span className="hidden sm:inline">Full Width</span>
            </>
          )}
        </Button>
      </div>
      <div className="flex justify-center w-full">
        <Card 
          className={`overflow-hidden shadow-lg ${
            isFullWidth 
              ? 'w-full' 
              : video.platform.toLowerCase() === 'tiktok'
                ? 'w-full max-w-[400px] sm:w-[325px]'
                : video.platform.toLowerCase() === 'instagram'
                  ? 'w-full max-w-[500px] sm:w-[400px]'
                  : 'w-full max-w-[800px]'
          }`}
        >
          <AspectRatio ratio={getAspectRatio()}>
            <iframe
              src={embedUrl}
              className="w-full h-full"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="Video player"
            />
          </AspectRatio>
        </Card>
      </div>
    </div>
  );
}