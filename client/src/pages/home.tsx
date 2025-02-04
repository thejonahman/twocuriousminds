import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ThumbnailCard } from "@/components/thumbnail/thumbnail-card";
import { Input } from "@/components/ui/input";
import { SelectThumbnail } from "@db/schema";

export default function Home() {
  const [search, setSearch] = useState("");
  
  const { data: thumbnails, isLoading } = useQuery<SelectThumbnail[]>({
    queryKey: ["/api/thumbnails"],
  });

  const filteredThumbnails = thumbnails?.filter(thumb => 
    thumb.title.toLowerCase().includes(search.toLowerCase()) ||
    thumb.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="container mx-auto py-8">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Educational Content Thumbnails
          </h1>
          <Input
            placeholder="Search thumbnails..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div 
                key={i}
                className="h-[300px] rounded-lg bg-muted animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredThumbnails?.map((thumbnail) => (
              <ThumbnailCard key={thumbnail.id} thumbnail={thumbnail} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
