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
          // Handle different TikTok URL formats
          let tiktokId;
          if (url.includes('/video/')) {
            tiktokId = url.split('/video/')[1]?.split('?')[0];
          } else if (url.includes('/t/')) {
            tiktokId = url.split('/t/')[1]?.split('?')[0];
          }
          return tiktokId ? `https://www.tiktok.com/embed/v2/${tiktokId}` : url;
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
          sandbox="allow-same-origin allow-scripts allow-popups"
        />
      </AspectRatio>
    </Card>
  );
}