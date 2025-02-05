import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect, useCallback, useMemo } from 'react';

// Form validation schema
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

interface Video {
  id: number;
  title: string;
  description?: string;
  url: string;
  categoryId: number;
  subcategoryId?: number;
  platform: string;
  thumbnailUrl?: string;
}

interface EditVideoFormProps {
  video: Video;
  onClose?: () => void;
}

export function EditVideoForm({ video, onClose }: EditVideoFormProps) {
  const queryClient = useQueryClient();
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(video.thumbnailUrl || null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDetectingPlatform, setIsDetectingPlatform] = useState(false);
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false);

  // Memoize initial form values
  const defaultValues = useMemo(() => ({
    title: video.title || '',
    description: video.description || "",
    url: video.url || '',
    categoryId: video.categoryId ? String(video.categoryId) : '',
    subcategoryId: video.subcategoryId ? String(video.subcategoryId) : undefined,
    platform: (video.platform || 'youtube') as "youtube" | "tiktok" | "instagram",
  }), [video]);

  const form = useForm<VideoFormData>({
    resolver: zodResolver(videoSchema),
    defaultValues,
  });

  // Reset form when video changes
  useEffect(() => {
    if (video) {
      form.reset(defaultValues);
      setThumbnailUrl(video.thumbnailUrl || null);
    }
  }, [video, form, defaultValues]);

  const { data: categories, isLoading: isCategoriesLoading } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ["/api/categories"],
  });

  const selectedCategoryId = form.watch("categoryId");

  const { data: subcategories, isLoading: isSubcategoriesLoading } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: [`/api/categories/${selectedCategoryId}/subcategories`],
    enabled: !!selectedCategoryId,
  });

  const generateThumbnailMutation = useMutation({
    mutationFn: async ({ title, description }: { title: string; description?: string }) => {
      console.log('Sending thumbnail generation request:', { title, description });

      const response = await fetch("/api/thumbnails/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title, description }),
      });

      const responseText = await response.text();
      console.log('Raw response:', responseText);

      if (!response.ok) {
        try {
          const errorData = JSON.parse(responseText);
          throw new Error(errorData.details || errorData.error || "Failed to generate thumbnail");
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError);
          throw new Error("Failed to generate thumbnail - server error");
        }
      }

      try {
        const responseData = JSON.parse(responseText);
        console.log('Thumbnail generation response:', responseData);
        return responseData;
      } catch (parseError) {
        console.error('Failed to parse success response:', parseError);
        throw new Error("Invalid response from server");
      }
    },
    onSuccess: (data) => {
      if (data?.imageUrl) {
        setThumbnailUrl(data.imageUrl);
        toast({
          title: "Success",
          description: "Thumbnail generated successfully",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to generate thumbnail",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsGeneratingThumbnail(false);
    }
  });

  const updateVideoMutation = useMutation({
    mutationFn: async (data: VideoFormData) => {
      try {
        setIsSubmitting(true);
        const response = await fetch(`/api/videos/${video.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...data,
            thumbnailPreview: thumbnailUrl ? true : false
          }),
          credentials: 'include',
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Failed to update video");
        }

        const videoData = await response.json();

        // If we have a new thumbnail, update it separately
        if (thumbnailUrl && thumbnailUrl !== video.thumbnailUrl) {
          const thumbnailResponse = await fetch(`/api/videos/${video.id}/thumbnail`, {
            method: "POST",
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ thumbnailUrl }),
            credentials: "include",
          });

          if (!thumbnailResponse.ok) {
            console.error('Failed to upload thumbnail');
          }
        }

        return videoData;
      } catch (error) {
        console.error('Video update error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      toast({
        title: "Success",
        description: "Video updated successfully",
      });
      if (onClose) {
        onClose();
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSubmitting(false);
    }
  });

  const handleGenerateThumbnail = async () => {
    const title = form.getValues("title");
    const description = form.getValues("description");

    if (!title || title.trim().length === 0) {
      toast({
        title: "Missing title",
        description: "Please enter a video title before generating a thumbnail",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingThumbnail(true);
    generateThumbnailMutation.mutate({
      title: title.trim(),
      description: description?.trim()
    });
  };

  const handleThumbnailChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "Error",
          description: "Image file size must be less than 5MB",
          variant: "destructive",
        });
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setThumbnailUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = async (data: VideoFormData) => {
    try {
      await updateVideoMutation.mutateAsync(data);
    } catch (error) {
      console.error('Form submission error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  if (isCategoriesLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center">
          <p>Loading...</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="max-h-[85vh] flex flex-col">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full">
          <CardContent className="space-y-4 overflow-y-auto flex-1">
            <div className="space-y-2">
              <FormLabel>Thumbnail</FormLabel>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                {thumbnailUrl && (
                  <div className="relative w-40 h-24 bg-muted rounded-lg overflow-hidden shrink-0">
                    <img
                      src={thumbnailUrl}
                      alt="Video thumbnail"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-2 w-full">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleGenerateThumbnail}
                    disabled={isGeneratingThumbnail}
                    className="w-full sm:w-auto"
                  >
                    {isGeneratingThumbnail ? "Generating..." : "Generate Thumbnail"}
                  </Button>
                  <div className="flex-1">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleThumbnailChange}
                      className="cursor-pointer"
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                      Or upload a custom thumbnail image (optional)
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter video title" {...field} />
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
                    <Input placeholder="Enter video description" {...field} />
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
                    <Input 
                      placeholder="Video URL" 
                      {...field} 
                      disabled={isDetectingPlatform}
                    />
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
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value);
                      form.setValue("subcategoryId", "");
                    }}
                    value={field.value}
                    disabled={isCategoriesLoading}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select topic" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories?.map((category) => (
                        <SelectItem key={category.id} value={String(category.id)}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={!selectedCategoryId || isSubcategoriesLoading}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={selectedCategoryId ? "Select subtopic" : "Select a topic first"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {subcategories?.map((subcategory) => (
                        <SelectItem key={subcategory.id} value={String(subcategory.id)}>
                          {subcategory.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                    disabled={isDetectingPlatform}
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
          </CardContent>

          <CardFooter>
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || updateVideoMutation.isPending || isDetectingPlatform || isGeneratingThumbnail}
            >
              {isSubmitting ? "Updating..." : "Update Video"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}