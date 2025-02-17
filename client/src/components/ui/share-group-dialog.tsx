import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Mail, Share2, Check, Users, MessageSquare } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface ShareGroupDialogProps {
  url: string;
  groupName: string;
  videoTitle?: string;
  memberCount: number;
  messageCount: number;
}

export function ShareGroupDialog({ url, groupName, videoTitle, memberCount, messageCount }: ShareGroupDialogProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const dialogId = `share-dialog-${groupName.toLowerCase().replace(/\s+/g, '-')}`;
  const descriptionId = `${dialogId}-description`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Link copied! 🎉",
        description: "Share it with friends to join the discussion instantly!",
      });
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Please try again or copy the URL manually.",
        variant: "destructive",
      });
    }
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(`Join our video discussion: ${groupName} 🎥`);
    const body = encodeURIComponent(
      `Hey! 👋\n\n` +
      `I've started an interesting discussion about ${videoTitle ? `"${videoTitle}"` : 'this video'} and would love to hear your thoughts!\n\n` +
      `Already ${memberCount} member${memberCount !== 1 ? 's' : ''} have shared ${messageCount} message${messageCount !== 1 ? 's' : ''}.\n\n` +
      `Click to join the conversation instantly (no sign-up required): ${url}`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Share2 className="h-4 w-4" />
          Share Group
        </Button>
      </DialogTrigger>
      <DialogContent 
        className="sm:max-w-md"
        aria-describedby={descriptionId}
        aria-labelledby={dialogId}
      >
        <DialogHeader>
          <DialogTitle id={dialogId} className="flex items-center gap-2">
            Share Discussion Group
          </DialogTitle>
          <DialogDescription id={descriptionId} className="space-y-2">
            <p>
              Invite others to join "{groupName}"
              {videoTitle && <span> discussing "{videoTitle}"</span>}
            </p>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1" aria-label={`${memberCount} members`}>
                <Users className="h-4 w-4" />
                {memberCount} member{memberCount !== 1 ? 's' : ''}
              </div>
              <div className="flex items-center gap-1" aria-label={`${messageCount} messages`}>
                <MessageSquare className="h-4 w-4" />
                {messageCount} message{messageCount !== 1 ? 's' : ''}
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <div className="grid flex-1 gap-2">
              <div 
                className="bg-muted rounded-md p-3 text-sm break-all relative group cursor-pointer"
                role="textbox"
                aria-label="Sharing URL"
                aria-readonly="true"
                onClick={handleCopy}
              >
                {url}
                <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-md" />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button 
            variant="secondary" 
            className="flex-1 gap-2" 
            onClick={handleEmail}
            aria-label="Share via email"
          >
            <Mail className="h-4 w-4" />
            Share via Email
          </Button>
          <Button 
            onClick={handleCopy} 
            className="flex-1 gap-2"
            aria-label={copied ? "Link copied to clipboard" : "Copy link to clipboard"}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy Link
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}