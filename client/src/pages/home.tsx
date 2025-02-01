import { useQuery } from "@tanstack/react-query";
import { VideoGrid } from "@/components/video-grid";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const { data: videos, isLoading } = useQuery({
    queryKey: ["/api/videos"],
  });

  if (isLoading) {
    return <Skeleton className="w-full h-[200px] rounded-lg" />;
  }

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
      <VideoGrid videos={videos} />
    </div>
  );
}
