import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { VideoPlayer } from "@/components/video-player";
import { RecommendationSidebar } from "@/components/recommendation-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { DelphiBubble } from "@/components/delphi-bubble";

export default function Video() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { data: video, isLoading } = useQuery<{
    id: number;
    title: string;
    description: string;
    url: string;
    platform: string;
    categoryId: number;
    category: {
      id: number;
      name: string;
    };
    subcategoryId: number | undefined;
    subcategory: {
      id: number;
      name: string;
    } | null;
  }>({
    queryKey: [`/api/videos/${id}`],
  });

  const handleBack = () => {
    // Navigate back with category and subcategory information
    if (video?.category) {
      setLocation(`/?category=${video.category.id}${video.subcategory ? `&subcategory=${video.subcategory.id}` : ''}`);
    } else {
      setLocation('/');
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,300px] gap-6">
        <Skeleton className="w-full h-[500px] rounded-lg" />
        <Skeleton className="w-full h-[500px] rounded-lg" />
      </div>
    );
  }

  if (!video) {
    return <div>Video not found</div>;
  }

  return (
    <div className="space-y-6">
      <button 
        onClick={handleBack}
        className="mb-4 text-sm text-muted-foreground hover:text-foreground flex items-center gap-2"
      >
        ← Back to {video.category.name}
        {video.subcategory && ` / ${video.subcategory.name}`}
      </button>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,300px] gap-6">
        <div className="space-y-6">
          <VideoPlayer video={video} />
          <div>
            <h1 className="text-2xl font-bold">{video.title}</h1>
            <p className="text-muted-foreground">{video.description}</p>
          </div>
          <DelphiBubble videoId={video.id} />
        </div>
        <div className="lg:sticky lg:top-4">
          <RecommendationSidebar 
            currentVideoId={video.id}
            categoryId={video.categoryId}
            subcategoryId={video.subcategoryId}
          />
        </div>
      </div>
    </div>
  );
}