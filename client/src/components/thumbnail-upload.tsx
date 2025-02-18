import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { ImageIcon, UploadIcon, Loader2 } from "lucide-react";

interface ThumbnailUploadProps {
  onUploadComplete: (thumbnailUrl: string) => void;
  currentThumbnail?: string | null;
}

export function ThumbnailUpload({ onUploadComplete, currentThumbnail }: ThumbnailUploadProps) {
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a JPEG, PNG or WebP image",
        variant: "destructive"
      });
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 5MB",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('thumbnail', file);

      console.log('Uploading thumbnail:', {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size
      });

      const response = await fetch('/api/upload/thumbnail', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();
      console.log('Upload response:', data);

      if (!data.url) {
        throw new Error('No URL in upload response');
      }

      // Ensure URL starts with a forward slash
      const thumbnailUrl = data.url.startsWith('/') ? data.url : `/${data.url}`;
      onUploadComplete(thumbnailUrl);

      toast({
        title: "Upload successful",
        description: "Your thumbnail has been uploaded",
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "There was an error uploading your thumbnail",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
      // Reset the file input
      const fileInput = document.getElementById('thumbnail-upload') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4 border rounded-lg">
      {currentThumbnail ? (
        <div className="relative w-full aspect-video rounded-lg overflow-hidden">
          <img 
            src={currentThumbnail} 
            alt="Video thumbnail" 
            className="w-full h-full object-cover"
            onError={(e) => {
              console.error('Thumbnail load error:', e);
              const img = e.currentTarget;
              img.src = '/placeholder-thumbnail.png'; // Fallback image
            }}
          />
        </div>
      ) : (
        <div className="flex items-center justify-center w-full aspect-video bg-muted rounded-lg">
          <ImageIcon className="w-12 h-12 text-muted-foreground" />
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="hidden"
          id="thumbnail-upload"
          disabled={isUploading}
        />
        <label
          htmlFor="thumbnail-upload"
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer ${
            isUploading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {isUploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <UploadIcon className="w-4 h-4" />
              Upload Thumbnail
            </>
          )}
        </label>
      </div>
    </div>
  );
}