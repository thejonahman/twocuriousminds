import { useQuery } from "@tanstack/react-query";
import { VideoGrid } from "@/components/video-grid";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Video {
  id: number;
  title: string;
  url: string;
  thumbnailUrl: string;
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
        <Skeleton className="h-[200px] w-full" />
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
        unorganizedVideos: [],
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
    } else {
      acc[categoryId].unorganizedVideos.push(video);
    }
    return acc;
  }, {} as Record<number, { 
    name: string; 
    subcategories: Record<number, { name: string; videos: Video[] }>;
    unorganizedVideos: Video[];
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
        <TabsList className="h-auto flex-wrap">
          {sortedCategories.map(([id, category]) => (
            <TabsTrigger key={id} value={id} className="text-base py-2">
              {category.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {sortedCategories.map(([id, category]) => (
          <TabsContent key={id} value={id} className="space-y-6">
            <div className="grid gap-6">
              {/* Render subcategories in an accordion */}
              <Accordion type="multiple" className="space-y-4">
                {Object.entries(category.subcategories).map(([subId, subcategory]) => (
                  <AccordionItem key={subId} value={subId} className="border rounded-lg">
                    <AccordionTrigger className="px-4 hover:no-underline">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold">
                          {subcategory.name}
                        </span>
                        <Badge variant="secondary">
                          {subcategory.videos.length} videos
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <VideoGrid videos={subcategory.videos} />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>

              {/* Render videos without subcategories if any */}
              {category.unorganizedVideos.length > 0 && (
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold">Other Videos</h2>
                  <VideoGrid videos={category.unorganizedVideos} />
                </div>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}