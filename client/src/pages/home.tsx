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
      <div className="space-y-8">
        <div className="animate-pulse space-y-4">
          <div className="h-10 w-2/3 bg-muted rounded-lg" />
          <div className="h-5 w-1/2 bg-muted rounded-lg" />
          <div className="h-12 w-full bg-muted rounded-lg" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
      <div className="space-y-4 text-center max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary/80 to-primary bg-clip-text text-transparent">
          Ready to see yourself clearly?
        </h1>
        <p className="text-muted-foreground text-lg">
          Browse through the best handpicked videos
        </p>
      </div>

      <div className="relative max-w-2xl mx-auto transform transition-all duration-300 hover:scale-[1.02]">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search videos by title, topic, or category..."
          className="pl-11 py-6 text-lg bg-background/50 border-2 border-muted/30 hover:border-primary/30 focus:border-primary/50 transition-all duration-300 shadow-lg hover:shadow-xl rounded-2xl"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {searchQuery ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b pb-4">
            <h2 className="text-2xl font-semibold flex items-center gap-2">
              Search Results
              <Badge variant="secondary" className="ml-2">
                {filteredVideos?.length} videos
              </Badge>
            </h2>
          </div>
          <VideoGrid videos={filteredVideos || []} />
        </div>
      ) : (
        <Tabs 
          defaultValue={initialCategoryId || sortedCategories[0]?.[0]} 
          className="space-y-8"
        >
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-primary/90 to-primary bg-clip-text text-transparent">
                Explore Topics
              </h2>
              <p className="text-muted-foreground mt-2">
                Select a topic to dive deeper into specific areas
              </p>
            </div>
            <div className="sticky top-0 z-10 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 py-2 backdrop-blur-lg bg-background/80 border-b">
              <TabsList className="h-auto flex-wrap justify-start w-full p-1 bg-muted/50 backdrop-blur supports-[backdrop-filter]:bg-background/60 rounded-xl">
                {sortedCategories.map(([id, category]) => (
                  <TabsTrigger 
                    key={id} 
                    value={id} 
                    className="text-base py-2.5 px-4 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-md rounded-lg transition-all duration-200"
                  >
                    {category.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </div>

          {sortedCategories.map(([id, category]) => (
            <TabsContent key={id} value={id} className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-[240px,1fr] gap-8">
                <aside className="lg:border-r lg:pr-6">
                  <div className="lg:sticky lg:top-24 space-y-4">
                    <div className="pb-4 border-b">
                      <h2 className="font-semibold text-xl text-foreground/90">Subtopics</h2>
                    </div>
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
                            className="w-full text-left px-4 py-3 rounded-xl hover:bg-accent/50 hover:shadow-sm transition-all duration-200 flex items-center justify-between group"
                          >
                            <span className="text-sm font-medium">{subcategory.name}</span>
                            <Badge variant="secondary" className="bg-primary/5 group-hover:bg-primary/10 transition-colors">
                              {subcategory.videos.length}
                            </Badge>
                          </button>
                        ))}
                    </div>
                  </div>
                </aside>

                <div className="space-y-12">
                  {Object.entries(category.subcategories)
                    .sort(([,a], [,b]) => {
                      if (a.displayOrder !== undefined && b.displayOrder !== undefined) {
                        return a.displayOrder - b.displayOrder;
                      }
                      return a.name.localeCompare(b.name);
                    })
                    .map(([subId, subcategory]) => (
                      <div 
                        key={subId} 
                        id={`subcategory-${subId}`} 
                        className="scroll-mt-24 space-y-6 p-6 rounded-2xl bg-accent/5 border border-accent/10 hover:border-accent/20 transition-colors"
                      >
                        <div className="flex items-center gap-3 pb-4 border-b">
                          <h2 className="text-2xl font-semibold tracking-tight">{subcategory.name}</h2>
                          <Badge variant="secondary" className="bg-primary/10">
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