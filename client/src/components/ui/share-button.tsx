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

  // Ensure the URL is absolute
  const absoluteUrl = new URL(url, window.location.origin).toString();

  const handleNativeShare = async () => {
    try {
      if (typeof navigator.share !== 'function') {
        throw new Error('Native sharing not supported');
      }
      await navigator.share({
        url: absoluteUrl,
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
      await navigator.clipboard.writeText(absoluteUrl);
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

  // Check for native sharing support
  const hasNativeShare = typeof navigator !== 'undefined' && 
                        typeof navigator.share === 'function';

  if (hasNativeShare) {
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