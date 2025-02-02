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
          // First try to extract video ID from various URL formats
          const tiktokUrl = new URL(url);
          const pathParts = tiktokUrl.pathname.split('/').filter(Boolean);

          // Handle /video/ format
          if (pathParts.includes('video')) {
            const videoIndex = pathParts.indexOf('video');
            if (videoIndex >= 0 && pathParts[videoIndex + 1]) {
              return `https://www.tiktok.com/embed/v2/${pathParts[videoIndex + 1]}`;
            }
          }

          // For shortened URLs (/t/ format) or any other format
          // use the URL embed format which has better compatibility
          return `https://www.tiktok.com/embed/discover?url=${encodeURIComponent(url)}`;

        case 'instagram':
          // For Instagram, extract the post ID and use proper embed format
          const match = url.match(/\/(p|reel|share)\/([^/?]+)/);
          if (match) {
            const [, type, id] = match;
            if (type === 'share') {
              // Handle special case for Instagram share URLs
              return `https://www.instagram.com/reel/${id}/embed`;
            }
            return `https://www.instagram.com/${type}/${id}/embed`;
          }
          return url;
        default:
          return url;
      }
    } catch (error) {
      console.error('Error parsing video URL:', error);
      // Fallback to direct URL embed for TikTok
      if (platform.toLowerCase() === 'tiktok') {
        return `https://www.tiktok.com/embed?url=${encodeURIComponent(url)}`;
      }
      return url;
    }
  };

  const embedUrl = getEmbedUrl(video.url, video.platform);
  console.log('Generated embed URL:', embedUrl); // Debug log

  // Calculate max width based on platform
  const getMaxWidth = () => {
    switch (video.platform.toLowerCase()) {
      case 'instagram':
        return 'max-w-[540px]'; // Instagram's recommended width
      case 'tiktok':
        return 'max-w-[325px]'; // TikTok's recommended width
      case 'youtube':
      default:
        return 'max-w-full'; // YouTube can be full width
    }
  };

  return (
    <div className="flex justify-center w-full">
      <Card className={`overflow-hidden ${getMaxWidth()}`}>
        <AspectRatio ratio={video.platform.toLowerCase() === 'tiktok' ? 16/20 : 16/9}>
          <iframe
            src={embedUrl}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          />
        </AspectRatio>
      </Card>
    </div>
  );
}