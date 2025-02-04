import { useQuery } from "@tanstack/react-query";
import { VideoGrid } from "@/components/video-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

  // Effect to scroll to the subcategory
  useEffect(() => {
    if (initialSubcategoryId && videos) {
      const element = document.getElementById(`subcategory-${initialSubcategoryId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [initialSubcategoryId, videos]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-2/3 bg-muted rounded-lg" />
          <div className="h-4 w-1/2 bg-muted rounded-lg" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="aspect-video bg-muted rounded-xl" />
            ))}
          </div>
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

  // Group videos by category and subcategory
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

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary/80 to-primary bg-clip-text text-transparent">
          Ski Technique Library
        </h1>
        <p className="text-muted-foreground text-lg">
          Browse through expert ski instruction videos and tutorials
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by technique, difficulty level, or terrain..."
          className="pl-9 pr-9 h-12 text-base shadow-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {searchQuery ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              Search Results
              <Badge variant="secondary" className="ml-2">
                {filteredVideos?.length} tutorials
              </Badge>
            </h2>
          </div>
          <VideoGrid videos={filteredVideos || []} />
        </div>
      ) : (
        <Tabs 
          defaultValue={initialCategoryId || sortedCategories[0]?.[0]} 
          className="space-y-6"
        >
          <TabsList className="h-auto flex-wrap p-1 bg-muted/50 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            {sortedCategories.map(([id, category]) => (
              <TabsTrigger 
                key={id} 
                value={id} 
                className="text-base py-2.5 px-4 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                {category.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {sortedCategories.map(([id, category]) => (
            <TabsContent key={id} value={id} className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-[240px,1fr] gap-8">
                <aside className="lg:border-r lg:pr-6">
                  <div className="lg:sticky lg:top-6 space-y-4">
                    <h2 className="font-semibold text-lg">Skill Areas</h2>
                    <div className="space-y-1">
                      {Object.entries(category.subcategories)
                        .sort(([,a], [,b]) => {
                          if (a.displayOrder !== undefined && b.displayOrder !== undefined) {
                            return a.displayOrder - b.displayOrder;
                          }
                          return a.name.localeCompare(b.name);
                        })
                        .map(([subId, subcategory]) => (
                          <button
                            key={subId}
                            onClick={() => document.getElementById(`subcategory-${subId}`)?.scrollIntoView({ behavior: 'smooth' })}
                            className="w-full text-left px-4 py-2.5 rounded-lg hover:bg-accent transition-colors flex items-center justify-between group"
                          >
                            <span className="text-sm">{subcategory.name}</span>
                            <Badge variant="outline" className="group-hover:bg-primary/10">
                              {subcategory.videos.length}
                            </Badge>
                          </button>
                      ))}
                    </div>
                  </div>
                </aside>

                <div className="space-y-10">
                  {Object.entries(category.subcategories)
                    .sort(([,a], [,b]) => {
                      if (a.displayOrder !== undefined && b.displayOrder !== undefined) {
                        return a.displayOrder - b.displayOrder;
                      }
                      return a.name.localeCompare(b.name);
                    })
                    .map(([subId, subcategory]) => (
                      <div key={subId} id={`subcategory-${subId}`} className="scroll-mt-6">
                        <div className="flex items-center gap-3 mb-6">
                          <h2 className="text-xl font-semibold">{subcategory.name}</h2>
                          <Badge variant="secondary">
                            {subcategory.videos.length} tutorials
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