import { videos } from "@/lib/videos";
import { VideoCard } from "@/components/video-card";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4">
        <div className="space-y-8">
          {/* Startups Section */}
          <section>
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              Startups
              <span className="text-sm text-muted-foreground font-normal">
                {videos.filter(v => v.category === 'Startups').length} videos
              </span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {videos
                .filter(video => video.category === 'Startups')
                .map(video => (
                  <VideoCard
                    key={video.id}
                    title={video.title}
                    thumbnailUrl={video.thumbnailUrl}
                    category={video.category}
                  />
                ))}
            </div>
          </section>

          {/* General Section */}
          <section>
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              General
              <span className="text-sm text-muted-foreground font-normal">
                {videos.filter(v => v.category === 'General').length} videos
              </span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {videos
                .filter(video => video.category === 'General')
                .map(video => (
                  <VideoCard
                    key={video.id}
                    title={video.title}
                    thumbnailUrl={video.thumbnailUrl}
                    category={video.category}
                  />
                ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
