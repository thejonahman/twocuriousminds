import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { VideoPlayer } from "@/components/video-player";
import { RecommendationSidebar } from "@/components/recommendation-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { DelphiBubble } from "@/components/delphi-bubble";
import { DiscussionGroup } from "@/components/discussion-group";
import { Button } from "@/components/ui/button";
import { Share2, Link, Mail, Copy, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

export default function Video() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

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

  // Scroll to top whenever the video ID changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  const handleBack = () => {
    if (video?.category) {
      setLocation(`/?category=${video.category.id}${video.subcategory ? `&subcategory=${video.subcategory.id}` : ''}`);
    } else {
      setLocation('/');
    }
  };

  const handleShare = async (type: string) => {
    const shareUrl = window.location.href;

    switch (type) {
      case 'copy':
        try {
          await navigator.clipboard.writeText(shareUrl);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
          toast({
            title: "Link copied!",
            description: "The video link has been copied to your clipboard.",
          });
        } catch (err) {
          toast({
            title: "Failed to copy",
            description: "Please try again or copy the URL manually.",
            variant: "destructive",
          });
        }
        break;
      case 'email':
        window.location.href = `mailto:?subject=Check out this video&body=I thought you might like this video: ${shareUrl}`;
        break;
      case 'twitter':
        window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(`Check out this video: ${video?.title}`)}`);
        break;
      case 'linkedin':
        window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`);
        break;
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
        className="flex items-center gap-3 px-4 py-2.5 text-sm rounded-lg hover:bg-accent transition-colors group"
      >
        <svg
          className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-muted-foreground group-hover:text-foreground transition-colors">
          Back to{" "}
          <span className="font-medium text-foreground">
            {video.category.name}
            {video.subcategory && (
              <>
                <span className="mx-1.5 text-muted-foreground">/</span>
                <span className="font-medium text-foreground">
                  {video.subcategory.name}
                </span>
              </>
            )}
          </span>
        </span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,300px] gap-8">
        <div className="space-y-8">
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <VideoPlayer video={video} />
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">{video.title}</h1>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="ml-2">
                      <Share2 className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleShare('copy')}>
                      {copied ? (
                        <Check className="mr-2 h-4 w-4" />
                      ) : (
                        <Copy className="mr-2 h-4 w-4" />
                      )}
                      Copy link
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleShare('email')}>
                      <Mail className="mr-2 h-4 w-4" />
                      Share via email
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleShare('twitter')}>
                      <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                      Share on Twitter
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleShare('linkedin')}>
                      <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                      </svg>
                      Share on LinkedIn
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <p className="text-muted-foreground">{video.description}</p>
            </div>
          </div>
          <DelphiBubble videoId={video.id} />
          <div className="rounded-xl border bg-card shadow-sm">
            <DiscussionGroup videoId={video.id} />
          </div>
        </div>

        <div className="lg:sticky lg:top-4 space-y-4">
          <div className="rounded-xl border bg-accent/5 p-6">
            <RecommendationSidebar
              currentVideoId={video.id}
              categoryId={video.categoryId}
              subcategoryId={video.subcategoryId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}