import { useQuery } from "@tanstack/react-query";
import { VideoGrid } from "@/components/video-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import debounce from 'lodash/debounce';
import { ErrorBoundary } from "@/components/error-boundary";
import { toast } from "@/hooks/use-toast";
import { Video } from "@/lib/types";

interface CategoryData {
  name: string;
  subcategories: Record<string, {
    name: string;
    videos: Video[];
    displayOrder?: number;
  }>;
}

export default function Home() {
  console.log('Home component rendering');

  const [searchQuery, setSearchQuery] = useState("");
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const initialCategoryId = params.get('category');
  const initialSubcategoryId = params.get('subcategory');

  const isValidId = (id: string | null): boolean => {
    return id !== null && /^\d+$/.test(id);
  };

  const { data: videos = [], isLoading, error } = useQuery<Video[]>({
    queryKey: ["/api/videos"],
    retry: 3,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    onError: (error: Error) => {
      console.error('Failed to fetch videos:', error);
      toast({
        title: "Error",
        description: "Failed to load videos. Please try again later.",
        variant: "destructive",
      });
    },
    onSuccess: (data: Video[]) => {
      console.log('Videos fetched successfully:', {
        count: data.length,
        categories: Array.from(new Set(data.map(v => v.category.name))),
        subcategories: Array.from(new Set(data.map(v => v.subcategory?.name).filter(Boolean)))
      });
    }
  });

  const debouncedSearch = useCallback(
    debounce((query: string) => {
      console.log('Debounced search triggered:', query);
      setSearchQuery(query);
    }, 300),
    []
  );

  const filteredVideos = searchQuery
    ? videos.filter(video => {
        const searchTerms = searchQuery.toLowerCase().split(" ");
        const searchableText = `${video.title} ${video.description || ""} ${video.category.name} ${video.subcategory?.name || ""}`.toLowerCase();
        return searchTerms.every(term => searchableText.includes(term));
      })
    : videos;

  useEffect(() => {
    if (searchQuery) {
      console.log('Search query changed:', {
        query: searchQuery,
        resultsCount: filteredVideos.length,
        totalVideos: videos.length
      });
    }
  }, [searchQuery, filteredVideos.length, videos.length]);

  const handleCategoryChange = useCallback((categoryId: string) => {
    console.log('Category changed:', { categoryId });
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
    if (initialSubcategoryId && videos) {
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

  const videosByCategory: Record<string, CategoryData> | null = !searchQuery
    ? videos.reduce<Record<string, CategoryData>>((acc, video) => {
        try {
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
        } catch (error) {
          console.error('Error processing video:', error);
          return acc;
        }
      }, {})
    : null;

  const categories = [
    { id: "1", name: "Learn about ADHD", displayOrder: -1 },
    { id: "2", name: "Another Category", displayOrder: 1 },
  ];

  const sortedCategories = videosByCategory
    ? Object.entries(videosByCategory).sort(([,a], [,b]) => {
        const categoryA = categories.find(cat => cat.name === a.name);
        const categoryB = categories.find(cat => cat.name === b.name);
        const orderA = categoryA?.displayOrder ?? 0;
        const orderB = categoryB?.displayOrder ?? 0;
        return orderA !== orderB ? orderA - orderB : a.name.localeCompare(b.name);
      })
    : [];

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

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive">Error loading videos. Please try again later.</p>
      </div>
    );
  }

  if (!videos || videos.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No videos found</p>
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