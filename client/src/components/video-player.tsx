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
          } else {
            // For shortened URLs or any other format, use the blockquote embed
            return `https://www.tiktok.com/embed?url=${encodeURIComponent(url)}`;
          }
        case 'instagram':
          // For Instagram, extract the post ID and use proper embed format
          const match = url.match(/\/(p|reel|share)\/([^/?]+)/);
          if (match) {
            const [, type, id] = match;
            return `https://www.instagram.com/${type}/${id}/embed`;
          }
          return url;
        default:
          return url;
      }
    } catch (error) {
      console.error('Error parsing video URL:', error);
      return url;
    }
  };

  const embedUrl = getEmbedUrl(video.url, video.platform);
  console.log('Generated embed URL:', embedUrl); // Debug log

  return (
    <Card className="overflow-hidden">
      <AspectRatio ratio={16 / 9}>
        <iframe
          src={embedUrl}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
        />
      </AspectRatio>
    </Card>
  );
}