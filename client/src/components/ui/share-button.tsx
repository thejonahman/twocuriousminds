import { Share2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ShareButtonProps {
  url: string;
  title?: string;
  text?: string;
  className?: string;
}

export function ShareButton({ url, title, text, className }: ShareButtonProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // Enhanced URL formatting to handle all edge cases
  const getShareableUrl = () => {
    const baseUrl = window.location.origin;
    // Clean the URL by removing protocol, domain, and normalizing slashes
    const cleanPath = url
      .replace(/^(?:https?:\/\/[^/]+)+/g, '') // Remove any protocol and domain
      .replace(/^\/+/, '')                     // Remove leading slashes
      .replace(/\/+/g, '/');                   // Normalize multiple slashes to single

    // Ensure proper URL construction
    return `${baseUrl}/${cleanPath}`;
  };

  const handleNativeShare = async () => {
    const shareableUrl = getShareableUrl();
    try {
      await navigator.share({
        url: shareableUrl,
        title,
        text,
      });
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

  const handleCopy = async () => {
    try {
      const shareableUrl = getShareableUrl();
      await navigator.clipboard.writeText(shareableUrl);
      setCopied(true);
      toast({
        title: "Link copied!",
        description: "The link has been copied to your clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Couldn't copy link",
        description: "Please try copying the link manually.",
        variant: "destructive",
      });
    }
  };

  // Only show native sharing if it's available in the browser
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className={className}>
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={handleNativeShare}>
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleCopy}>
            {copied ? (
              <Check className="h-4 w-4 mr-2" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            Copy Link
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Fallback to copy-only button
  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={handleCopy}
    >
      {copied ? (
        <Check className="h-4 w-4 mr-2" />
      ) : (
        <Copy className="h-4 w-4 mr-2" />
      )}
      Copy Link
    </Button>
  );
}