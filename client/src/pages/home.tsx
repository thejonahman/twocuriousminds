import { useQuery } from "@tanstack/react-query";
import { VideoGrid } from "@/components/video-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface Video {
  id: number;
  title: string;
  url: string;
  thumbnailUrl: string;
  platform: string;
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
    return <Skeleton className="w-full h-[200px] rounded-lg" />;
  }

  // Group videos by category and subcategory
  const videosByCategory = videos?.reduce((acc, video) => {
    const categoryId = video.category.id;
    if (!acc[categoryId]) {
      acc[categoryId] = {
        name: video.category.name,
        subcategories: {},
        videos: [],
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
      acc[categoryId].videos.push(video);
    }
    return acc;
  }, {} as Record<number, { name: string; subcategories: Record<number, { name: string; videos: Video[] }>; videos: Video[] }>);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Discover Educational Content
        </h1>
        <p className="text-muted-foreground">
          Explore curated short-form videos on various topics
        </p>
      </div>

      <Tabs defaultValue={Object.keys(videosByCategory || {})[0]}>
        <TabsList className="w-full h-auto flex-wrap">
          {Object.entries(videosByCategory || {}).map(([id, category]) => (
            <TabsTrigger key={id} value={id} className="text-base">
              {category.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {Object.entries(videosByCategory || {}).map(([id, category]) => (
          <TabsContent key={id} value={id} className="space-y-8">
            {Object.entries(category.subcategories).map(([subId, subcategory]) => (
              <div key={subId} className="space-y-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold">{subcategory.name}</h2>
                  <Badge variant="secondary">
                    {subcategory.videos.length} videos
                  </Badge>
                </div>
                <VideoGrid videos={subcategory.videos} />
              </div>
            ))}
            {category.videos.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold">Other Videos</h2>
                <VideoGrid videos={category.videos} />
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}