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
import { useRef } from 'react';

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
  platform: z.enum(["youtube", "tiktok", "instagram"])
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
      const thumbnailUrl = getVideoThumbnail(data.url, data.platform);

      const payload = {
        ...data,
        categoryId: parseInt(data.categoryId),
        subcategoryId: data.subcategoryId ? parseInt(data.subcategoryId) : null,
        thumbnailUrl
      };

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

  const onSubmit = (data: VideoFormData) => {
    updateVideoMutation.mutate(data);
  };

  // Watch URL and platform changes to preview the thumbnail
  const url = form.watch("url");
  const platform = form.watch("platform");
  const thumbnailUrl = url && platform ? getVideoThumbnail(url, platform) : null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" ref={formRef}>
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

        <FormItem>
          <FormLabel>Thumbnail Preview</FormLabel>
          <div className="flex flex-col gap-4">
            {thumbnailUrl ? (
              <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-muted">
                <img
                  src={thumbnailUrl}
                  alt="Video thumbnail"
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="flex aspect-video w-full items-center justify-center rounded-lg border bg-muted">
                <span className="text-sm text-muted-foreground">Enter a valid video URL to see thumbnail</span>
              </div>
            )}
          </div>
        </FormItem>

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