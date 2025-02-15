import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { VideoGrid } from "@/components/video-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Search, X, AlertTriangle } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import debounce from 'lodash/debounce';
import { ErrorBoundary } from "@/components/error-boundary";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Video } from "@/lib/types";

interface CategoryDetails {
  name: string;
  subcategories: Record<string, SubcategoryDetails>;
}

interface SubcategoryDetails {
  name: string;
  videos: Video[];
  displayOrder?: number;
}

type VideosByCategory = Record<string, CategoryDetails>;

export default function Home() {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const initialCategoryId = params.get('category');
  const initialSubcategoryId = params.get('subcategory');

  const isValidId = (id: string | null): boolean => {
    return id !== null && /^\d+$/.test(id);
  };

  const { 
    data: videos = [], 
    isLoading, 
    error,
    refetch 
  } = useQuery<Video[], Error>({
    queryKey: ["/api/videos"] as const,
    retry: 3,
    refetchOnWindowFocus: false,
    refetchOnMount: true
  });

  const debouncedSearch = useCallback(
    debounce((query: string) => {
      setSearchQuery(query);
    }, 300),
    []
  );

  const filteredVideos = videos.filter((video: Video) => {
    const searchTerms = searchQuery.toLowerCase().split(" ");
    const searchableText = `${video.title} ${video.description || ""} ${video.category.name} ${video.subcategory?.name || ""}`.toLowerCase();
    return searchTerms.every(term => searchableText.includes(term));
  });

  const handleCategoryChange = useCallback((categoryId: string) => {
    if (!isValidId(categoryId)) {
      console.warn('Invalid category ID:', categoryId);
      return;
    }

    try {
      const newParams = new URLSearchParams(search);
      newParams.set('category', categoryId);
      newParams.delete('subcategory');
      setLocation(`/?${newParams.toString()}`);
    } catch (error) {
      console.error('Error updating category:', error);
      toast({
        title: "Error",
        description: "Failed to update category. Please try again.",
        variant: "destructive",
      });
    }
  }, [search, setLocation]);

  const handleSubtopicClick = useCallback((categoryId: string, subcategoryId: string) => {
    if (!isValidId(categoryId) || !isValidId(subcategoryId)) return;

    const newParams = new URLSearchParams(search);
    newParams.set('category', categoryId);
    newParams.set('subcategory', subcategoryId);
    setLocation(`/?${newParams.toString()}`);
  }, [search, setLocation]);

  useEffect(() => {
    if (initialSubcategoryId && videos.length > 0) {
      try {
        const element = document.getElementById(`subcategory-${initialSubcategoryId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      } catch (error) {
        console.error('Error scrolling to subcategory:', error);
      }
    }
  }, [initialSubcategoryId, videos]);

  const videosByCategory = !searchQuery
    ? videos.reduce<VideosByCategory>((acc, video) => {
        const categoryId = String(video.category.id);
        if (!acc[categoryId]) {
          acc[categoryId] = {
            name: video.category.name,
            subcategories: {},
          };
        }

        if (video.subcategory) {
          const subcategoryId = String(video.subcategory.id);
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
      }, {})
    : null;

  const sortedCategories = videosByCategory
    ? Object.entries(videosByCategory).sort(([,a], [,b]) => {
        const orderA = a.name === 'Learn about ADHD' ? -1 : 0;
        const orderB = b.name === 'Learn about ADHD' ? -1 : 0;
        return orderA !== orderB ? orderA - orderB : a.name.localeCompare(b.name);
      })
    : [];

  if (isLoading) {
    return (
      <div className="space-y-8 animate-in fade-in-50">
        <div className="space-y-4">
          <div className="h-10 w-2/3 bg-muted rounded-lg animate-pulse" />
          <div className="h-5 w-1/2 bg-muted rounded-lg animate-pulse" />
          <div className="h-12 w-full bg-muted rounded-lg animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-video bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Failed to load videos</h2>
        </div>
        <p className="text-sm">
          {error instanceof Error ? error.message : "An unexpected error occurred while loading videos."}
        </p>
        <Button 
          variant="destructive"
          onClick={() => refetch()}
          className="w-full justify-center"
        >
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="space-y-12">
        <div className="space-y-6 text-center max-w-3xl mx-auto pt-8">
          <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-br from-primary/90 via-primary to-primary/80 bg-clip-text text-transparent">
            Ready to see yourself clearly?
          </h1>
          <p className="text-muted-foreground text-xl">
            Browse through the best handpicked videos
          </p>
        </div>

        <div className="relative max-w-2xl mx-auto transform transition-all duration-300 hover:scale-[1.02]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground/60" />
          <Input
            defaultValue={searchQuery}
            onChange={(e) => debouncedSearch(e.target.value)}
            placeholder="Search videos by title, topic, or category..."
            className="pl-12 py-7 text-lg bg-background/50 border-2 border-muted/30 hover:border-primary/30 focus:border-primary/50 transition-all duration-300 shadow-lg hover:shadow-xl rounded-2xl"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                debouncedSearch("");
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Search Results */}
        {searchQuery ? (
          <div className="space-y-8">
            <div className="flex items-center justify-between border-b pb-4">
              <h2 className="text-2xl font-semibold flex items-center gap-2">
                Search Results
                <Badge variant="secondary" className="ml-2">
                  {filteredVideos.length} videos
                </Badge>
              </h2>
            </div>
            <VideoGrid videos={filteredVideos} />
          </div>
        ) : (
          <Tabs
            defaultValue={initialCategoryId || sortedCategories[0]?.[0]}
            className="space-y-10"
            onValueChange={handleCategoryChange}
          >
            <div className="space-y-8">
              <div className="text-center">
                <h2 className="text-3xl font-bold bg-gradient-to-br from-primary/90 to-primary bg-clip-text text-transparent">
                  Explore Topics
                </h2>
              </div>
              <div className="sticky top-0 z-10 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 py-3 backdrop-blur-lg bg-background/80 border-b">
                <TabsList className="h-auto flex-wrap justify-start w-full p-1.5 bg-muted/50 backdrop-blur supports-[backdrop-filter]:bg-background/60 rounded-xl">
                  {sortedCategories.map(([id, category]) => (
                    <TabsTrigger
                      key={id}
                      value={id}
                      className="text-base py-3 px-5 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-md rounded-lg transition-all duration-200"
                    >
                      {category.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </div>

            {sortedCategories.map(([categoryId, category]) => (
              <TabsContent key={categoryId} value={categoryId} className="space-y-10">
                <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-10">
                  <aside className="lg:border-r lg:pr-8">
                    <div className="lg:sticky lg:top-24 space-y-6">
                      <div className="pb-4 border-b">
                        <h2 className="font-semibold text-xl text-foreground/90">Subtopics</h2>
                      </div>
                      <div className="space-y-2">
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
                              onClick={() => handleSubtopicClick(categoryId, subId)}
                              className={`w-full text-left px-5 py-3.5 rounded-xl hover:bg-accent/50 hover:shadow-sm transition-all duration-200 flex items-center justify-between group ${
                                initialSubcategoryId === subId ? 'bg-accent/50 shadow-sm' : ''
                              }`}
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

                  <div className="space-y-14">
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
                          className={`scroll-mt-24 space-y-8 p-8 rounded-2xl bg-accent/5 border border-accent/10 hover:border-accent/20 transition-colors shadow-sm hover:shadow-md ${
                            initialSubcategoryId === subId ? 'ring-2 ring-primary/20' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3 pb-6 border-b">
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
    </ErrorBoundary>
  );
}