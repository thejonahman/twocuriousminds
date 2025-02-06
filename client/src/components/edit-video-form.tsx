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
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const hasSubmitted = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (filePreview) {
      setThumbnailUrl(filePreview);
    }
  }, [filePreview]);

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
      const response = await apiRequest("PATCH", `/api/videos/${video.id}`, {
        ...data,
        thumbnailPreview: thumbnailUrl ? true : false
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update video");
      }

      const videoData = await response.json();

      return videoData;
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
      toast({
        title: "Error",
        description: error.message,
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

  const handleThumbnailChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "Image file size must be less than 5MB",
        variant: "destructive",
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    try {
      setIsGeneratingThumbnail(true);

      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);

      const formData = new FormData();
      formData.append('thumbnail', file);

      const response = await fetch(`/api/videos/${video.id}/thumbnail`, {
        method: 'PATCH',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload thumbnail');
      }

      const updatedVideo = await response.json();
      setThumbnailUrl(updatedVideo.thumbnailUrl);

      toast({
        title: "Success",
        description: "Thumbnail updated successfully",
      });
    } catch (error) {
      console.error('Thumbnail upload error:', error);
      toast({
        title: "Error",
        description: "Failed to upload thumbnail",
        variant: "destructive",
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setFilePreview(null);
    } finally {
      setIsGeneratingThumbnail(false);
    }
  }, [video.id]);

  const onSubmit = useCallback(async (data: VideoFormData) => {
    try {
      setIsSubmitting(true);
      await updateVideoMutation.mutateAsync(data);
    } catch (error) {
      console.error('Form submission error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
  }, [updateVideoMutation]);

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

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)', zIndex: 50 }}>
      <div className="w-full max-w-2xl bg-background rounded-lg shadow-lg overflow-hidden">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-[85vh]">
            <div className="flex-1 overflow-y-auto">
              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <FormLabel>Thumbnail</FormLabel>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="relative w-40 h-24 bg-muted rounded-lg overflow-hidden shrink-0">
                      {thumbnailUrl ? (
                        <img
                          src={thumbnailUrl}
                          alt="Video thumbnail"
                          className="w-full h-full object-cover"
                          style={{ opacity: isGeneratingThumbnail ? 0.5 : 1 }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          No thumbnail
                        </div>
                      )}
                      {isGeneratingThumbnail && (
                        <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                          <Skeleton className="h-full w-full" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleGenerateThumbnail}
                        disabled={isGeneratingThumbnail}
                        className="w-full sm:w-auto"
                      >
                        {isGeneratingThumbnail ? "Generating..." : "Generate Thumbnail"}
                      </Button>
                      <div>
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={handleThumbnailChange}
                          disabled={isGeneratingThumbnail}
                          ref={fileInputRef}
                          className="cursor-pointer"
                        />
                        <p className="text-sm text-muted-foreground mt-1">
                          Or upload a custom thumbnail image (optional)
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
              </div>
            </div>

            <div className="border-t bg-background p-4 mt-auto">
              <Button
                type="submit"
                className="w-full relative"
                disabled={isSubmitting || updateVideoMutation.isPending || isGeneratingThumbnail}
              >
                <span className={isSubmitting ? 'invisible' : 'visible'}>
                  {isSubmitting ? "Updating..." : "Update Video"}
                </span>
                {isSubmitting && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    Updating...
                  </span>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}