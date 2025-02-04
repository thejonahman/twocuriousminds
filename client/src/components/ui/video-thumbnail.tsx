import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface VideoThumbnailProps {
  title: string
  category: string
  imageSrc: string
  className?: string
}

export function VideoThumbnail({ title, category, imageSrc, className }: VideoThumbnailProps) {
  return (
    <Card className={cn("overflow-hidden group hover:shadow-lg transition-shadow", className)}>
      <AspectRatio ratio={16 / 9} className="bg-muted">
        <img
          src={imageSrc}
          alt={`Thumbnail for ${title}`}
          className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      </AspectRatio>
      <CardHeader className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm line-clamp-2">{title}</CardTitle>
          <Badge variant="secondary" className="shrink-0">
            {category}
          </Badge>
        </div>
      </CardHeader>
    </Card>
  )
}
