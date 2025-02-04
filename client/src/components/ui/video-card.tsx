import { Card, CardContent } from "@/components/ui/card"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { cn } from "@/lib/utils"
import type { Video } from "@/lib/videos"

interface VideoCardProps {
  video: Video;
  className?: string;
}

export function VideoCard({ video, className }: VideoCardProps) {
  return (
    <Card className={cn("overflow-hidden transition-all hover:scale-[1.02]", className)}>
      <CardContent className="p-0">
        <AspectRatio ratio={16 / 9}>
          <img 
            src={video.thumbnailUrl}
            alt={`Thumbnail for ${video.title}`}
            className="object-cover w-full h-full"
            loading="lazy"
          />
        </AspectRatio>
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              {video.category}
            </span>
          </div>
          <h3 className="text-lg font-semibold leading-tight">
            {video.title}
          </h3>
        </div>
      </CardContent>
    </Card>
  )
}
