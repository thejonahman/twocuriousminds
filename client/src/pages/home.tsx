import { useQuery } from "@tanstack/react-query";
import { VideoGrid } from "@/components/video-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";

interface Video {
  id: number;
  title: string;
  url: string;
  thumbnailUrl: string;
  platform: string;
  watched: boolean;
  description: string;
  category: {
    id: number;
    name: string;
  };
  subcategory: {
    id: number;
    name: string;
    displayOrder?: number;
  } | null;
}

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const search = useSearch();
  const params = new URLSearchParams(search);
  const initialCategoryId = params.get('category');
  const initialSubcategoryId = params.get('subcategory');

  const { data: videos, isLoading } = useQuery<Video[]>({
    queryKey: ["/api/videos"],
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-[300px]" />
          <Skeleton className="h-[300px]" />
          <Skeleton className="h-[300px]" />
        </div>
      </div>
    );
  }

  // Filter videos based on search query
  const filteredVideos = videos?.filter((video) => {
    if (!searchQuery) return true;

    const searchTerms = searchQuery.toLowerCase().split(" ");
    const searchableText = `${video.title} ${video.description || ""} ${video.category.name} ${video.subcategory?.name || ""}`.toLowerCase();

    return searchTerms.every(term => searchableText.includes(term));
  });

  // Group videos by category and subcategory (only when not searching)
  const videosByCategory = !searchQuery ? filteredVideos?.reduce((acc, video) => {
    const categoryId = video.category.id;
    if (!acc[categoryId]) {
      acc[categoryId] = {
        name: video.category.name,
        subcategories: {},
      };
    }

    if (video.subcategory) {
      const subcategoryId = video.subcategory.id;
      if (!acc[categoryId].subcategories[subcategoryId]) {
        acc[categoryId].subcategories[subcategoryId] = {
          name: video.subcategory.name,
          videos: [],
          displayOrder: video.subcategory.displayOrder,
        };
      }
      acc[categoryId].subcategories[subcategoryId].videos.push(video);
    }
    return acc;
  }, {} as Record<number, { 
    name: string; 
    subcategories: Record<number, { name: string; videos: Video[], displayOrder?: number }>;
  }>) : null;

  const sortedCategories = videosByCategory ? Object.entries(videosByCategory).sort(([,a], [,b]) => 
    a.name.localeCompare(b.name)
  ) : [];

  useEffect(() => {
    if (initialSubcategoryId) {
      const element = document.getElementById(`subcategory-${initialSubcategoryId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [initialSubcategoryId, videos]);


  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Ready to see yourself clearly?
        </h1>
        <p className="text-muted-foreground">
          Browse through the best handpicked videos
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search videos by title, topic, or category..."
          className="pl-9 pr-9"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {searchQuery ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Search Results
              <span className="ml-2 text-muted-foreground">
                ({filteredVideos?.length} videos)
              </span>
            </h2>
          </div>
          <VideoGrid videos={filteredVideos || []} />
        </div>
      ) : (
        <Tabs 
          defaultValue={initialCategoryId || sortedCategories[0]?.[0]} 
          className="space-y-4"
        >
          <TabsList className="h-auto flex-wrap">
            {sortedCategories.map(([id, category]) => (
              <TabsTrigger key={id} value={id} className="text-base py-2">
                {category.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {sortedCategories.map(([id, category]) => (
            <TabsContent key={id} value={id}>
              <div className="grid grid-cols-1 md:grid-cols-[200px,1fr] gap-6">
                <aside className="md:border-r pr-4">
                  <h2 className="font-semibold text-lg mb-2">Subcategories</h2>
                  <div className="space-y-1">
                    {Object.entries(category.subcategories)
                      .sort(([,a], [,b]) => {
                        // First try to sort by displayOrder if available
                        if (a.displayOrder !== undefined && b.displayOrder !== undefined) {
                          return a.displayOrder - b.displayOrder;
                        }
                        // Fall back to name-based sorting
                        return a.name.localeCompare(b.name);
                      })
                      .map(([subId, subcategory]) => (
                        <button
                          key={subId}
                          onClick={() => document.getElementById(`subcategory-${subId}`)?.scrollIntoView({ behavior: 'smooth' })}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent transition-colors flex items-center justify-between group"
                        >
                          <span>{subcategory.name}</span>
                          <Badge variant="outline" className="group-hover:bg-primary group-hover:text-primary-foreground">
                            {subcategory.videos.length}
                          </Badge>
                        </button>
                    ))}
                  </div>
                </aside>

                <div className="space-y-8">
                  {Object.entries(category.subcategories)
                    .sort(([,a], [,b]) => {
                      // First try to sort by displayOrder if available
                      if (a.displayOrder !== undefined && b.displayOrder !== undefined) {
                        return a.displayOrder - b.displayOrder;
                      }
                      // Fall back to name-based sorting
                      return a.name.localeCompare(b.name);
                    })
                    .map(([subId, subcategory]) => (
                      <div key={subId} id={`subcategory-${subId}`}>
                        <div className="flex items-center gap-2 mb-4">
                          <h2 className="text-xl font-semibold">{subcategory.name}</h2>
                          <Badge variant="secondary">
                            {subcategory.videos.length} videos
                          </Badge>
                        </div>
                        <VideoGrid videos={subcategory.videos} />
                      </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}