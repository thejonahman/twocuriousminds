import { useQuery } from "@tanstack/react-query";
import { VideoGrid } from "@/components/video-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Video {
  id: number;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  platform: string;
  watched: boolean;
  category: {
    id: number;
    name: string;
  };
  subcategory: {
    id: number;
    name: string;
  } | null;
}

export default function Home() {
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

  // Group videos by category and subcategory
  const videosByCategory = videos?.reduce((acc, video) => {
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
        };
      }
      acc[categoryId].subcategories[subcategoryId].videos.push(video);
    }
    return acc;
  }, {} as Record<number, { 
    name: string; 
    subcategories: Record<number, { name: string; videos: Video[] }>;
  }>);

  const sortedCategories = Object.entries(videosByCategory || {}).sort(([,a], [,b]) => 
    a.name.localeCompare(b.name)
  );

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Educational Content Library
        </h1>
        <p className="text-muted-foreground">
          Browse through our curated collection of educational videos
        </p>
      </div>

      <Tabs defaultValue={sortedCategories[0]?.[0]} className="space-y-4">
        {/* Category tabs at the top */}
        <TabsList className="h-auto flex-wrap">
          {sortedCategories.map(([id, category]) => (
            <TabsTrigger key={id} value={id} className="text-base py-2">
              {category.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Content for each category */}
        {sortedCategories.map(([id, category]) => (
          <TabsContent key={id} value={id} className="space-y-6">
            <div className="grid md:grid-cols-[300px,1fr] gap-6">
              {/* Subcategories sidebar */}
              <div className="space-y-4 border-r pr-4">
                <h2 className="font-semibold text-lg">Subcategories</h2>
                <ScrollArea className="h-[calc(100vh-200px)]">
                  <div className="space-y-2">
                    {Object.entries(category.subcategories)
                      .sort(([,a], [,b]) => a.name.localeCompare(b.name))
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
                </ScrollArea>
              </div>

              {/* Videos content area */}
              <div className="space-y-8">
                {Object.entries(category.subcategories)
                  .sort(([,a], [,b]) => a.name.localeCompare(b.name))
                  .map(([subId, subcategory]) => (
                    <div key={subId} id={`subcategory-${subId}`} className="space-y-4">
                      <div className="flex items-center gap-2">
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
    </div>
  );
}