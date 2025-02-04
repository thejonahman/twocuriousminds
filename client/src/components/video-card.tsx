import { Card, CardContent } from "./ui/card";
import { AspectRatio } from "./ui/aspect-ratio";

interface VideoCardProps {
  title: string;
  thumbnailUrl: string;
  category: string;
}

export function VideoCard({ title, thumbnailUrl, category }: VideoCardProps) {
  return (
    <Card className="overflow-hidden group cursor-pointer hover:shadow-lg transition-shadow">
      <CardContent className="p-3">
        <AspectRatio ratio={16 / 9} className="bg-muted">
          <img
            src={thumbnailUrl}
            alt={title}
            className="object-cover w-full h-full rounded-md"
            loading="lazy"
          />
        </AspectRatio>
        <div className="mt-3">
          <div className="text-xs font-semibold text-muted-foreground mb-1">
            {category}
          </div>
          <h3 className="font-medium leading-snug line-clamp-2">{title}</h3>
        </div>
      </CardContent>
    </Card>
  );
}
