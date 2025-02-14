import { useState, useEffect, useRef } from "react";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Video {
  url: string;
  platform: string;
  title?: string;
}

export function VideoPlayer({ video }: { video: Video }) {
  const [isFullWidth, setIsFullWidth] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadStartTime = useRef(Date.now());

  const getEmbedUrl = (url: string, platform: string) => {
    try {
      console.log(`Generating embed URL for platform: ${platform}`, {
        originalUrl: url,
        timestamp: new Date().toISOString()
      });

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
          console.warn(`Unsupported platform: ${platform}`);
          return url;
      }
    } catch (error) {
      console.error('Error parsing video URL:', error);
      setHasError(true);
      toast({
        title: "Error Loading Video",
        description: "Failed to process video URL. Please try again later.",
        variant: "destructive",
      });
      return url;
    }
  };

  const embedUrl = getEmbedUrl(video.url, video.platform);

  useEffect(() => {
    const handleIframeLoad = () => {
      const loadTime = Date.now() - loadStartTime.current;
      console.log(`Video iframe loaded`, {
        platform: video.platform,
        loadTime: `${loadTime}ms`,
        timestamp: new Date().toISOString()
      });
      setIsLoading(false);
      setHasError(false);
    };

    const handleIframeError = () => {
      console.error(`Failed to load video iframe`, {
        platform: video.platform,
        url: embedUrl,
        timestamp: new Date().toISOString()
      });
      setHasError(true);
      setIsLoading(false);
      toast({
        title: "Video Load Error",
        description: `Failed to load ${video.title || 'video'}. Please try again later.`,
        variant: "destructive",
      });
    };

    const iframe = iframeRef.current;
    if (iframe) {
      iframe.addEventListener('load', handleIframeLoad);
      iframe.addEventListener('error', handleIframeError);
    }

    return () => {
      if (iframe) {
        iframe.removeEventListener('load', handleIframeLoad);
        iframe.removeEventListener('error', handleIframeError);
      }
    };
  }, [video.platform, video.title, embedUrl]);

  const getAspectRatio = () => {
    switch (video.platform.toLowerCase()) {
      case 'tiktok':
        return 9/16;
      case 'instagram':
        return 4/5;
      default:
        return 16/9;
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
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
                <div className="animate-pulse text-muted-foreground">Loading...</div>
              </div>
            )}
            {hasError && (
              <div className="absolute inset-0 flex items-center justify-center bg-destructive/10">
                <div className="flex flex-col items-center gap-2 text-destructive">
                  <AlertTriangle className="h-6 w-6" />
                  <span className="text-sm">Failed to load video</span>
                </div>
              </div>
            )}
            <iframe
              ref={iframeRef}
              src={embedUrl}
              className={`w-full h-full transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={video.title || "Video player"}
            />
          </AspectRatio>
        </Card>
      </div>
    </div>
  );
}