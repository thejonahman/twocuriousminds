import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { VideoPlayer } from "@/components/video-player";
import { ChatInterface } from "@/components/chat-interface";
import { Skeleton } from "@/components/ui/skeleton";

export default function Video() {
  const { id } = useParams();
  const { data: video, isLoading } = useQuery({
    queryKey: [`/api/videos/${id}`],
  });

  if (isLoading) {
    return <Skeleton className="w-full h-[500px] rounded-lg" />;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <VideoPlayer video={video} />
        <div>
          <h1 className="text-2xl font-bold">{video.title}</h1>
          <p className="text-muted-foreground">{video.description}</p>
        </div>
      </div>
      <div className="lg:col-span-1">
        <ChatInterface videoId={video.id} />
      </div>
    </div>
  );
}
