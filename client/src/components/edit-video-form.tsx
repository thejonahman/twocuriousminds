import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Image as ImageIcon } from "lucide-react";
import { useRef, useState } from 'react';

interface Category {
  id: number;
  name: string;
}

interface Subcategory {
  id: number;
  name: string;
  displayOrder?: number;
}

interface Video {
  id: number;
  title: string;
  description?: string;
  url: string;
  categoryId: number;
  subcategoryId?: number;
  platform: string;
  thumbnailUrl: string | null;
  category: Category;
  subcategory: Subcategory | null;
}

interface EditVideoFormProps {
  video: Video;
  onClose?: () => void;
  scrollPosition: number;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const videoSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  url: z.string().url("Must be a valid URL")
    .refine((url) => {
      return (
        url.includes("youtube.com") ||
        url.includes("youtu.be") ||
        url.includes("tiktok.com") ||
        url.includes("instagram.com")
      );
    }, "Must be a YouTube, TikTok, or Instagram URL"),
  categoryId: z.string().min(1, "Category is required"),
  subcategoryId: z.string().optional(),
  platform: z.enum(["youtube", "tiktok", "instagram"]),
  thumbnail: z
    .instanceof(FileList)
    .optional()
    .refine((files) => !files || files.length === 0 || files.length === 1, "Please upload a single file")
    .refine(
      (files) => !files || files.length === 0 || files[0].size <= MAX_FILE_SIZE,
      "Max file size is 5MB"
    )
    .refine(
      (files) => !files || files.length === 0 || ACCEPTED_IMAGE_TYPES.includes(files[0].type),
      "Only .jpg, .jpeg, .png and .webp files are accepted"
    ),
});

type VideoFormData = z.infer<typeof videoSchema>;

function getVideoThumbnail(url: string, platform: string): string {
  // If it's a YouTube video, use the YouTube thumbnail API
  if (platform === "youtube") {
    const videoId = url.includes("youtu.be")
      ? url.split("/").pop()
      : new URL(url).searchParams.get("v");
    return videoId
      ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      : generatePlaceholder(platform);
  }

  // For other platforms, use a simple placeholder
  return generatePlaceholder(platform);
}

function generatePlaceholder(platform: string): string {
  const bgColors: Record<string, string> = {
    youtube: "#FF0000",
    tiktok: "#00F2EA",
    instagram: "#833AB4"
  };

  // Create a simple colored rectangle with text
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');

  if (!ctx) return '';

  // Fill background
  ctx.fillStyle = bgColors[platform] || "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Add text
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 48px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${platform.toUpperCase()} Video`, canvas.width / 2, canvas.height / 2);

  return canvas.toDataURL('image/png');
}

export function EditVideoForm({ video, onClose, scrollPosition }: EditVideoFormProps) {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const hasSubmitted = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(video.thumbnailUrl);

  const form = useForm<VideoFormData>({
    resolver: zodResolver(videoSchema),
    defaultValues: {
      title: video.title,
      description: video.description || "",
      url: video.url,
      categoryId: String(video.categoryId),
      subcategoryId: video.subcategoryId ? String(video.subcategoryId) : undefined,
      platform: video.platform as "youtube" | "tiktok" | "instagram",
    }
  });

  const { data: categories = [], isLoading: isCategoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    staleTime: 30000,
  });

  const selectedCategoryId = form.watch("categoryId");

  const { data: subcategories = [], isLoading: isSubcategoriesLoading } = useQuery<Subcategory[]>({
    queryKey: [`/api/categories/${selectedCategoryId}/subcategories`],
    enabled: !!selectedCategoryId,
    staleTime: 30000,
  });

  const updateVideoMutation = useMutation({
    mutationFn: async (data: VideoFormData) => {
      let thumbnailUrl = getVideoThumbnail(data.url, data.platform);

      // Handle custom thumbnail upload if provided
      if (data.thumbnail && data.thumbnail.length > 0) {
        const formData = new FormData();
        formData.append("thumbnail", data.thumbnail[0]);

        const uploadResponse = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadResponse.ok) {
          throw new Error("Failed to upload thumbnail");
        }

        const { url } = await uploadResponse.json();
        thumbnailUrl = url;
      }

      const payload = {
        ...data,
        categoryId: parseInt(data.categoryId),
        subcategoryId: data.subcategoryId ? parseInt(data.subcategoryId) : null,
        thumbnailUrl
      };

      // Remove the thumbnail field as it's already processed
      delete (payload as any).thumbnail;

      const response = await apiRequest("PATCH", `/api/videos/${video.id}`, payload);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update video");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/videos"],
        refetchType: "active"
      });

      toast({
        title: "Success",
        description: "Video updated successfully",
      });
      hasSubmitted.current = true;
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleThumbnailChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setPreviewUrl(video.thumbnailUrl);
    }
  };

  const onSubmit = (data: VideoFormData) => {
    updateVideoMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" ref={formRef}>
        <FormField
          control={form.control}
          name="thumbnail"
          render={({ field: { onChange, value, ...field } }) => (
            <FormItem>
              <FormLabel>Custom Thumbnail</FormLabel>
              <FormControl>
                <div className="space-y-4">
                  <AspectRatio ratio={16 / 9} className="bg-muted">
                    <div className="h-full w-full relative">
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt="Thumbnail preview"
                          className="object-cover w-full h-full rounded-md"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full w-full border-2 border-dashed border-muted-foreground/25 rounded-md">
                          <ImageIcon className="h-8 w-8 text-muted-foreground/25" />
                        </div>
                      )}
                    </div>
                  </AspectRatio>
                  <Input
                    type="file"
                    accept={ACCEPTED_IMAGE_TYPES.join(",")}
                    onChange={(e) => {
                      handleThumbnailChange(e);
                      onChange(e.target.files);
                    }}
                    ref={fileInputRef}
                    {...field}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Enter video title" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (Optional)</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Enter video description" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>URL</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Video URL" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="categoryId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Topic</FormLabel>
              <div className="flex gap-2">
                {isCategoriesLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value);
                      form.setValue("subcategoryId", "");
                    }}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select topic" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={String(category.id)}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="subcategoryId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Subtopic (Optional)</FormLabel>
              <div className="flex gap-2">
                {isSubcategoriesLoading && selectedCategoryId ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={!selectedCategoryId}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={selectedCategoryId ? "Select subtopic" : "Select a topic first"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {subcategories.map((subcategory) => (
                        <SelectItem key={subcategory.id} value={String(subcategory.id)}>
                          {subcategory.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="platform"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Platform</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select platform" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="youtube">YouTube</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="w-full"
          disabled={updateVideoMutation.isPending}
        >
          {updateVideoMutation.isPending ? "Updating..." : "Update Video"}
        </Button>
      </form>
    </Form>
  );
}