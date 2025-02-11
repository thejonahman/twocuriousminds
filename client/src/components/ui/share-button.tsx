import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface ShareButtonProps {
  url: string;
  title?: string;
  text?: string;
  className?: string;
}

export function ShareButton({ url, title, text, className }: ShareButtonProps) {
  const { toast } = useToast();

  const handleShare = async () => {
    // Ensure the URL is absolute
    const absoluteUrl = new URL(url, window.location.origin).toString();

    try {
      if (navigator.share) {
        // Use Native Share API if available
        await navigator.share({
          url: absoluteUrl,
          title,
          text,
        });
      } else {
        // Fallback to clipboard copy
        await navigator.clipboard.writeText(absoluteUrl);
        toast({
          title: "Link copied!",
          description: "The invite link has been copied to your clipboard.",
        });
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        toast({
          title: "Couldn't share link",
          description: "Please try copying the link manually.",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={handleShare}
    >
      <Share2 className="h-4 w-4 mr-2" />
      Share
    </Button>
  );
}
