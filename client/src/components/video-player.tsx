import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Card } from "@/components/ui/card";

interface Video {
  url: string;
  platform: string;
}

export function VideoPlayer({ video }: { video: Video }) {
  const getEmbedUrl = (url: string, platform: string) => {
    switch (platform) {
      case 'youtube':
        const youtubeId = url.split('v=')[1];
        return `https://www.youtube.com/embed/${youtubeId}`;
      case 'tiktok':
        const tiktokId = url.split('/video/')[1].split('?')[0];
        return `https://www.tiktok.com/embed/${tiktokId}`;
      case 'instagram':
        // Instagram requires oEmbed API for proper embedding
        return url;
      default:
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
        />
      </AspectRatio>
    </Card>
  );
}
