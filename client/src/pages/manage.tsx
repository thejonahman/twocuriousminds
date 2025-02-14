import { useQuery } from "@tanstack/react-query";
import { AdminVideoForm } from "@/components/admin-video-form";
import { VideoGrid } from "@/components/video-grid";
import { Video } from "@/lib/types";
import { useLocation } from "wouter";

export default function ManagePage() {
  const [location] = useLocation();
  const params = new URLSearchParams(location.split('?')[1]);
  const highlightVideoId = parseInt(params.get('highlight') || '0') || undefined;

  const { data: videos = [] } = useQuery<Video[]>({
    queryKey: ["/api/videos"],
    staleTime: 30000,
  });

  return (
    <div className="container py-6 space-y-8">
      <h1 className="text-3xl font-bold">Manage Videos</h1>
      <AdminVideoForm />
      <div className="mt-8">
        <h2 className="text-2xl font-semibold mb-4">Video Library</h2>
        <VideoGrid videos={videos} showEditButton highlightVideoId={highlightVideoId} />
      </div>
    </div>
  );
}
