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
  console.log('Platform:', video.platform, 'URL:', video.url, 'Embed URL:', embedUrl);

  return (
    <div className="flex justify-center w-full">
      <Card className={`overflow-hidden ${video.platform.toLowerCase() === 'tiktok' ? 'w-[325px]' : 'w-full max-w-[800px]'}`}>
        <AspectRatio ratio={video.platform.toLowerCase() === 'tiktok' ? 9/16 : 16/9}>
          <iframe
            src={embedUrl}
            className="w-full h-full"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </AspectRatio>
      </Card>
    </div>
  );
}