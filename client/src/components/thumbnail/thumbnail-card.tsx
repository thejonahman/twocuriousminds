import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { SelectThumbnail } from "@db/schema";
import { Badge } from "@/components/ui/badge";
import { FallbackThumbnail } from "./fallback-thumbnail";
import { PlatformIcon } from "./platform-icon";
import { formatDistanceToNow } from "date-fns";

interface ThumbnailCardProps {
  thumbnail: SelectThumbnail;
}

export function ThumbnailCard({ thumbnail }: ThumbnailCardProps) {
  return (
    <Card className="overflow-hidden group hover:shadow-lg transition-shadow">
      <CardContent className="p-0 relative aspect-video">
        {thumbnail.thumbnailUrl ? (
          <img
            src={thumbnail.thumbnailUrl}
            alt={thumbnail.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <FallbackThumbnail
            title={thumbnail.title}
            platform={thumbnail.platform}
            category={thumbnail.category}
          />
        )}
        <div className="absolute top-2 right-2">
          <PlatformIcon platform={thumbnail.platform} />
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2 w-full">
          <h3 className="font-semibold line-clamp-2 flex-1">{thumbnail.title}</h3>
        </div>
        <div className="flex items-center gap-2 w-full">
          <Badge variant="secondary">{thumbnail.category}</Badge>
          <span className="text-xs text-muted-foreground ml-auto">
            {formatDistanceToNow(new Date(thumbnail.createdAt), { addSuffix: true })}
          </span>
        </div>
      </CardFooter>
    </Card>
  );
}
