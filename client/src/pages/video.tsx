import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { VideoPlayer } from "@/components/video-player";
import { ChatInterface } from "@/components/chat-interface";
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
      <DelphiBubble />
    </div>
  );
}