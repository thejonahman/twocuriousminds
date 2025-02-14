import { useState, useEffect, useRef } from "react";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2, AlertTriangle, Loader2 } from "lucide-react";
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
  const [retryCount, setRetryCount] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadStartTime = useRef(performance.now());
  const maxRetries = 3;

  const getEmbedUrl = (url: string, platform: string) => {
    try {
      console.log(`Generating embed URL for platform: ${platform}`, {
        originalUrl: url,
        timestamp: new Date().toISOString(),
        retryAttempt: retryCount + 1
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
          console.warn(`Unsupported platform: ${platform}`, {
            url,
            timestamp: new Date().toISOString()
          });
          return url;
      }
    } catch (error) {
      console.error('Error parsing video URL:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        platform,
        url,
        timestamp: new Date().toISOString()
      });
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
      const loadTime = performance.now() - loadStartTime.current;
      console.log(`Video iframe loaded successfully`, {
        platform: video.platform,
        loadTime: `${loadTime.toFixed(2)}ms`,
        retryCount,
        timestamp: new Date().toISOString()
      });
      setIsLoading(false);
      setHasError(false);
      // Reset retry count on successful load
      setRetryCount(0);
    };

    const handleIframeError = () => {
      const currentRetryCount = retryCount + 1;
      console.error(`Failed to load video iframe`, {
        platform: video.platform,
        url: embedUrl,
        attempt: currentRetryCount,
        maxRetries,
        timestamp: new Date().toISOString(),
        performance: {
          totalTime: performance.now() - loadStartTime.current,
          retryDelay: currentRetryCount * 1000
        }
      });

      if (currentRetryCount < maxRetries) {
        setRetryCount(currentRetryCount);
        console.log(`Retrying video load... (Attempt ${currentRetryCount}/${maxRetries})`);

        // Reset iframe src to trigger reload
        const iframe = iframeRef.current;
        if (iframe) {
          setTimeout(() => {
            iframe.src = `${embedUrl}?retry=${currentRetryCount}&t=${Date.now()}`;
          }, currentRetryCount * 1000); // Exponential backoff
        }
      } else {
        setHasError(true);
        setIsLoading(false);
        toast({
          title: "Video Load Error",
          description: `Failed to load ${video.title || 'video'} after ${maxRetries} attempts. Please try again later.`,
          variant: "destructive",
        });
      }
    };

    const iframe = iframeRef.current;
    if (iframe) {
      iframe.addEventListener('load', handleIframeLoad);
      iframe.addEventListener('error', handleIframeError);
    }

    // Log component mount
    console.log(`VideoPlayer mounted for ${video.platform} video`, {
      timestamp: new Date().toISOString(),
      platform: video.platform,
      hasIframe: !!iframe
    });

    return () => {
      // Cleanup event listeners and log unmount
      if (iframe) {
        iframe.removeEventListener('load', handleIframeLoad);
        iframe.removeEventListener('error', handleIframeError);
      }
      console.log(`VideoPlayer unmounted for ${video.platform} video`, {
        timestamp: new Date().toISOString(),
        totalMountTime: performance.now() - loadStartTime.current
      });
    };
  }, [video.platform, video.title, embedUrl, retryCount, video.url]);

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
          <AspectRatio ratio={getAspectRatio(video.platform)}>
            {(isLoading || retryCount > 0) && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/50 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  {retryCount > 0 && (
                    <span className="text-xs text-muted-foreground">
                      Retry attempt {retryCount}/{maxRetries}
                    </span>
                  )}
                </div>
              </div>
            )}
            {hasError && (
              <div className="absolute inset-0 flex items-center justify-center bg-destructive/10">
                <div className="flex flex-col items-center gap-2 text-destructive">
                  <AlertTriangle className="h-6 w-6" />
                  <span className="text-sm">Failed to load video</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setHasError(false);
                      setIsLoading(true);
                      setRetryCount(0);
                      if (iframeRef.current) {
                        iframeRef.current.src = embedUrl;
                      }
                    }}
                    className="mt-2"
                  >
                    Try Again
                  </Button>
                </div>
              </div>
            )}
            <iframe
              ref={iframeRef}
              src={embedUrl}
              className={`w-full h-full transition-opacity duration-300 ${
                isLoading || hasError ? 'opacity-0' : 'opacity-100'
              }`}
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

function getAspectRatio(platform: string): number {
  switch (platform.toLowerCase()) {
    case 'tiktok':
      return 9/16;
    case 'instagram':
      return 4/5;
    default:
      return 16/9;
  }
}