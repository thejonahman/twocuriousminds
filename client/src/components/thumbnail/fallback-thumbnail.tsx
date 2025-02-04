import { cn } from "@/lib/utils";
import { gradientMap } from "@/lib/thumbnail-utils";

interface FallbackThumbnailProps {
  title: string;
  platform: string;
  category: string;
}

export function FallbackThumbnail({ title, platform, category }: FallbackThumbnailProps) {
  const gradient = gradientMap[category.toLowerCase()] || gradientMap.default;

  return (
    <div className={cn("w-full h-full flex items-center justify-center p-6", gradient)}>
      <div className="text-center">
        <h3 className="text-xl font-bold text-white mb-2 line-clamp-2">
          {title}
        </h3>
        <p className="text-white/80 text-sm capitalize">
          {platform} • {category}
        </p>
      </div>
    </div>
  );
}
