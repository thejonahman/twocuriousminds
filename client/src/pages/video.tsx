import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { VideoPlayer } from "@/components/video-player";
import { RecommendationSidebar } from "@/components/recommendation-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { DelphiBubble } from "@/components/delphi-bubble";

export default function Video() {
  const { id } = useParams();
  const { data: video, isLoading } = useQuery<{
    id: number;
    title: string;
    description: string;
    url: string;
    platform: string;
    categoryId: number;
    subcategoryId: number | undefined;
  }>({
    queryKey: [`/api/videos/${id}`],
  });

  if (isLoading) {
    return <Skeleton className="w-full h-[500px] rounded-lg" />;
  }

  if (!video) {
    return <div>Video not found</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr,300px] gap-6">
      <div className="space-y-6">
        <VideoPlayer video={video} />
        <div>
          <h1 className="text-2xl font-bold">{video.title}</h1>
          <p className="text-muted-foreground">{video.description}</p>
        </div>
        <DelphiBubble />
      </div>
      <RecommendationSidebar 
        currentVideoId={video.id}
        categoryId={video.categoryId}
        subcategoryId={video.subcategoryId}
      />
    </div>
  );
}