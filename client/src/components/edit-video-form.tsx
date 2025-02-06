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
import { useState, useEffect, useCallback, useRef } from 'react';
import { Skeleton } from "@/components/ui/skeleton";

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
  scrollPosition: number;
}

export function EditVideoForm({ video, onClose, scrollPosition }: EditVideoFormProps) {
  const queryClient = useQueryClient();
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(video.thumbnailUrl || null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false);
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

  useEffect(() => {
    if (hasSubmitted.current && !isSubmitting) {
      const restoreScroll = () => {
        try {
          window.scrollTo({
            top: scrollPosition,
            behavior: "instant"
          });

          const timeoutId = setTimeout(() => {
            if (onClose) {
              onClose();
            }
          }, 50);

          return () => clearTimeout(timeoutId);
        } catch (error) {
          console.error('Error restoring scroll position:', error);
        }
      };

      restoreScroll();
    }
  }, [isSubmitting, scrollPosition, onClose]);

  const { data: categories = [], isLoading: isCategoriesLoading } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ["/api/categories"],
    staleTime: 30000,
  });

  const selectedCategoryId = form.watch("categoryId");

  const { data: subcategories = [], isLoading: isSubcategoriesLoading } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: [`/api/categories/${selectedCategoryId}/subcategories`],
    enabled: !!selectedCategoryId,
    staleTime: 30000,
  });

  const generateThumbnailMutation = useMutation({
    mutationFn: async ({ title, description }: { title: string; description?: string }) => {
      const response = await fetch("/api/thumbnails/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title, description }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.message || "Failed to generate thumbnail");
      }

      return await response.json();
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
        // First update the video metadata
        const response = await apiRequest("PATCH", `/api/videos/${video.id}`, {
          ...data,
          thumbnailPreview: thumbnailUrl ? true : false
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Failed to update video");
        }

        const videoData = await response.json();

        // Only upload thumbnail if it's new or changed
        if (thumbnailUrl && thumbnailUrl !== video.thumbnailUrl) {
          try {
            const thumbnailResponse = await apiRequest("POST", `/api/videos/${video.id}/thumbnail`, {
              thumbnailUrl
            });

            if (!thumbnailResponse.ok) {
              const thumbnailError = await thumbnailResponse.json();
              throw new Error(thumbnailError.message || "Failed to upload thumbnail");
            }
          } catch (thumbnailError) {
            console.error('Thumbnail upload error:', thumbnailError);
            // Continue with the update even if thumbnail upload fails
            toast({
              title: "Warning",
              description: "Video updated but thumbnail upload failed",
              variant: "destructive",
            });
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
      hasSubmitted.current = true;
    },
    onError: (error: Error) => {
      console.error('Update mutation error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update video",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSubmitting(false);
    }
  });

  const handleGenerateThumbnail = useCallback(async () => {
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
  }, [form, generateThumbnailMutation]);

  const handleThumbnailChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
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

      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Error",
          description: "Please upload an image file",
          variant: "destructive",
        });
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          setThumbnailUrl(result);
          toast({
            title: "Success",
            description: "Thumbnail uploaded successfully",
          });
        }
      };
      reader.onerror = () => {
        toast({
          title: "Error",
          description: "Failed to read image file",
          variant: "destructive",
        });
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const onSubmit = useCallback(async (data: VideoFormData) => {
    try {
      setIsSubmitting(true);
      await updateVideoMutation.mutateAsync(data);
    } catch (error) {
      console.error('Form submission error:', error);
      setIsSubmitting(false);
    }
  }, [updateVideoMutation]);

  return (
    <Card className="max-h-[85vh] flex flex-col">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full" ref={formRef}>
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
                  <div className="relative">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleGenerateThumbnail}
                      disabled={isGeneratingThumbnail}
                      className="w-full sm:w-auto"
                    >
                      {isGeneratingThumbnail ? "Generating..." : "Generate Thumbnail"}
                    </Button>
                    {isGeneratingThumbnail && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                        <Skeleton className="h-9 w-32" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleThumbnailChange}
                      className="cursor-pointer"
                      disabled={isGeneratingThumbnail}
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                      Upload PNG, JPG or WebP (max 5MB)
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
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
                      <Input placeholder="Video URL" {...field} />
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
                          {categories?.map((category) => (
                            <SelectItem key={category.id} value={String(category.id)}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
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
                          {subcategories?.map((subcategory) => (
                            <SelectItem key={subcategory.id} value={String(subcategory.id)}>
                              {subcategory.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
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
            </div>
          </CardContent>

          <CardFooter className="border-t mt-auto">
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || isGeneratingThumbnail}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded-full animate-spin" />
                  Updating...
                </span>
              ) : (
                "Update Video"
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}