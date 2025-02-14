import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Video, VideoFormData, videoSchema, getVideoThumbnail, Category, Subcategory, getPlatformColor } from "@/types/video";

interface EditVideoFormProps {
  video: Video;
  onClose?: () => void;
  scrollPosition: number;
}

export function EditVideoForm({ video, onClose, scrollPosition }: EditVideoFormProps) {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const hasSubmitted = useRef(false);

  useEffect(() => {
    if (hasSubmitted.current && onClose) {
      window.scrollTo(0, scrollPosition);
    }
  }, [hasSubmitted, scrollPosition, onClose]);

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

  // Log form errors for debugging
  const formErrors = form.formState.errors;
  if (Object.keys(formErrors).length > 0) {
    console.log('Form validation errors:', formErrors);
  }

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
      try {
        console.log('Making PATCH request to /api/videos', { videoId: video.id, data });
        const thumbnailUrl = getVideoThumbnail(data.url, data.platform);
        console.log('Generated thumbnail URL:', thumbnailUrl);

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

        console.log('Response status:', response.status);
        return response.json();
      } catch (error) {
        console.error('Update video mutation error:', error);
        throw error;
      }
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
      if (onClose) {
        setTimeout(() => {
          onClose();
          setTimeout(() => {
            window.scrollTo(0, scrollPosition);
          }, 100);
        }, 500);
      }
    },
    onError: (error: Error) => {
      console.error('Update mutation error:', error);
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

  // Show loading state while categories are being fetched
  if (isCategoriesLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

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
              <div 
                className="flex aspect-video w-full items-center justify-center rounded-lg border" 
                style={{ 
                  backgroundColor: getPlatformColor(platform)
                }}
              >
                <span className="text-sm text-white">
                  {platform.toUpperCase()} Video
                </span>
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
          className="w-full relative"
          disabled={updateVideoMutation.isPending}
        >
          {updateVideoMutation.isPending ? (
            <div className="flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span>Updating...</span>
            </div>
          ) : (
            'Update Video'
          )}
        </Button>
      </form>
    </Form>
  );
}