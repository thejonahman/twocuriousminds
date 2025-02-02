import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Card } from "@/components/ui/card";

interface Video {
  url: string;
  platform: string;
}

export function VideoPlayer({ video }: { video: Video }) {
  const getEmbedUrl = (url: string, platform: string) => {
    try {
      switch (platform.toLowerCase()) {
        case 'youtube':
          const youtubeId = url.split('v=')[1]?.split('&')[0];
          return youtubeId ? `https://www.youtube.com/embed/${youtubeId}` : url;
        case 'tiktok':
          // First, clean the URL of any tracking parameters
          const cleanUrl = url.split('?')[0];
          // Handle both /video/ and /t/ formats
          if (cleanUrl.includes('/video/')) {
            const videoId = cleanUrl.split('/video/')[1];
            return `https://www.tiktok.com/embed/v2/${videoId}`;
          } else if (cleanUrl.includes('/t/')) {
            // For shortened URLs, we use a different embed format
            return `https://www.tiktok.com/embed?url=${encodeURIComponent(url)}`;
          }
          return `https://www.tiktok.com/embed?url=${encodeURIComponent(url)}`;
        case 'instagram':
          // For Instagram, we'll use their oEmbed endpoint
          const instagramUrl = new URL(url);
          return `https://www.instagram.com/embed${instagramUrl.pathname}`;
        default:
          return url;
      }
    } catch (error) {
      console.error('Error parsing video URL:', error);
      return url;
    }
  };

  return (
    <Card className="overflow-hidden">
      <AspectRatio ratio={16 / 9}>
        <iframe
          src={getEmbedUrl(video.url, video.platform)}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
        />
      </AspectRatio>
    </Card>
  );
}