import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect, useCallback, useRef } from 'react';
import { EyeOff, Plus, Upload, RefreshCw } from 'lucide-react';

interface Video {
  id: number;
  title: string;
  description?: string;
  url: string;
  categoryId: number;
  subcategoryId?: number;
  platform: string;
  thumbnailUrl: string | null;
  category: {
    id: number;
    name: string;
  };
  subcategory: {
    id: number;
    name: string;
    displayOrder?: number;
  } | null;
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

export function EditVideoForm({ video, onClose, scrollPosition }: EditVideoFormProps) {
  const queryClient = useQueryClient();
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(video.thumbnailUrl || null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false);
  const [isUploadingThumbnail, setIsUploadingThumbnail] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hideTopicDialogOpen, setHideTopicDialogOpen] = useState(false);
  const [hideSubtopicDialogOpen, setHideSubtopicDialogOpen] = useState(false);
  const [newTopicDialogOpen, setNewTopicDialogOpen] = useState(false);
  const [newSubtopicDialogOpen, setNewSubtopicDialogOpen] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [newSubtopicName, setNewSubtopicName] = useState("");
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

  const generateThumbnailMutation = useMutation({
    mutationFn: async () => {
      setIsGeneratingThumbnail(true);
      const formData = {
        url: form.getValues("url"),
        platform: form.getValues("platform"),
        title: form.getValues("title"),
        description: form.getValues("description") || ""
      };

      console.log('Sending thumbnail generation request:', formData);

      const response = await apiRequest("POST", `/api/thumbnails/generate`, formData);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to generate thumbnail");
      }

      const data = await response.json();
      return data.thumbnailUrl;
    },
    onSuccess: (thumbnailUrl) => {
      setThumbnailUrl(thumbnailUrl);
      toast({
        title: "Success",
        description: "Thumbnail generated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsGeneratingThumbnail(false);
    }
  });

  const uploadThumbnailMutation = useMutation({
    mutationFn: async (file: File) => {
      setIsUploadingThumbnail(true);
      const formData = new FormData();
      formData.append('thumbnail', file);

      const response = await fetch(`/api/videos/${video.id}/thumbnail`, {
        method: 'PATCH',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to upload thumbnail");
      }

      const data = await response.json();
      return data.thumbnailUrl;
    },
    onSuccess: (thumbnailUrl) => {
      setThumbnailUrl(thumbnailUrl);
      toast({
        title: "Success",
        description: "Thumbnail uploaded successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsUploadingThumbnail(false);
    }
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadThumbnailMutation.mutate(file);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

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

  const toggleCategoryVisibilityMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      const response = await apiRequest("PATCH", `/api/categories/${categoryId}/visibility`, {
        isHidden: true
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to hide category");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({
        title: "Success",
        description: "Topic hidden successfully"
      });
      form.setValue("categoryId", "");
      form.setValue("subcategoryId", "");
      setHideTopicDialogOpen(false);
      setHideSubtopicDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const toggleSubcategoryVisibilityMutation = useMutation({
    mutationFn: async (subcategoryId: string) => {
      const response = await apiRequest("PATCH", `/api/subcategories/${subcategoryId}/visibility`, {
        isHidden: true
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to hide subcategory");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/categories/${form.getValues("categoryId")}/subcategories`]
      });
      toast({
        title: "Success",
        description: "Subtopic hidden successfully"
      });
      form.setValue("subcategoryId", "");
      setHideTopicDialogOpen(false);
      setHideSubtopicDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const addTopicMutation = useMutation({
    mutationFn: async (data: { name: string; isSubcategory?: boolean; parentId?: number }) => {
      const response = await apiRequest("POST", "/api/categories", {
        name: data.name,
        parentId: data.parentId,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create category");
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      if (selectedCategoryId) {
        queryClient.invalidateQueries({
          queryKey: [`/api/categories/${selectedCategoryId}/subcategories`]
        });
      }

      if (data.isSubcategory) {
        form.setValue("subcategoryId", String(data.id));
      } else {
        form.setValue("categoryId", String(data.id));
        form.setValue("subcategoryId", "");
      }

      toast({
        title: "Success",
        description: `${data.isSubcategory ? "Subtopic" : "Topic"} added successfully`
      });

      setNewTopicDialogOpen(false);
      setNewSubtopicDialogOpen(false);
      setNewTopicName("");
      setNewSubtopicName("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const updateVideoMutation = useMutation({
    mutationFn: async (data: VideoFormData) => {
      const response = await apiRequest("PATCH", `/api/videos/${video.id}`, data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update video");
      }
      return response.json();
    },
    onSuccess: () => {
      // More specific query invalidation
      queryClient.invalidateQueries({ 
        queryKey: ["/api/videos"],
        exact: true
      });
      // Invalidate the specific video
      queryClient.invalidateQueries({ 
        queryKey: [`/api/videos/${video.id}`],
        exact: true
      });
      // Don't invalidate categories unless necessary
      if (form.formState.dirtyFields.categoryId || form.formState.dirtyFields.subcategoryId) {
        queryClient.invalidateQueries({ 
          queryKey: ["/api/categories"],
          exact: true
        });
      }
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

  const handleHideTopic = () => {
    const categoryId = form.getValues("categoryId");
    if (categoryId) {
      toggleCategoryVisibilityMutation.mutate(categoryId);
    }
  };

  const handleHideSubtopic = () => {
    const subcategoryId = form.getValues("subcategoryId");
    if (subcategoryId) {
      toggleSubcategoryVisibilityMutation.mutate(subcategoryId);
    }
  };

  const handleAddTopic = () => {
    if (!newTopicName || newTopicName.trim().length === 0) {
      toast({
        title: "Error",
        description: "Topic name is required",
        variant: "destructive"
      });
      return;
    }

    addTopicMutation.mutate({
      name: newTopicName.trim(),
      isSubcategory: false
    });
  };

  const handleAddSubtopic = () => {
    if (!newSubtopicName || newSubtopicName.trim().length === 0) {
      toast({
        title: "Error",
        description: "Subtopic name is required",
        variant: "destructive"
      });
      return;
    }

    if (!selectedCategoryId) {
      toast({
        title: "Error",
        description: "Please select a topic first",
        variant: "destructive"
      });
      return;
    }

    addTopicMutation.mutate({
      name: newSubtopicName.trim(),
      isSubcategory: true,
      parentId: parseInt(selectedCategoryId)
    });
  };

  const onSubmit = useCallback(async (data: VideoFormData) => {
    try {
      setIsSubmitting(true);
      await updateVideoMutation.mutateAsync(data);
    } catch (error) {
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
      const timeoutId = setTimeout(() => {
        window.scrollTo({
          top: scrollPosition,
          behavior: 'instant'
        });
        if (onClose) {
          onClose();
        }
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [isSubmitting, scrollPosition, onClose]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" ref={formRef}>
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
          <FormItem>
            <FormLabel>Thumbnail</FormLabel>
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
                  <span className="text-sm text-muted-foreground">No thumbnail</span>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => generateThumbnailMutation.mutate()}
                  disabled={isGeneratingThumbnail}
                  className="flex-1"
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${isGeneratingThumbnail ? 'animate-spin' : ''}`} />
                  {isGeneratingThumbnail ? 'Generating...' : 'Generate Thumbnail'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleUploadClick}
                  disabled={isUploadingThumbnail}
                  className="flex-1"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {isUploadingThumbnail ? 'Uploading...' : 'Upload Custom'}
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />
              </div>
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
                      <SelectContent position="popper" className="z-[60]">
                        {categories?.map((category) => (
                          <SelectItem key={category.id} value={String(category.id)}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  <Dialog open={newTopicDialogOpen} onOpenChange={setNewTopicDialogOpen}>
                    <DialogTrigger asChild>
                      <Button type="button" variant="outline" size="icon">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                        <DialogTitle>Add New Topic</DialogTitle>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <FormItem>
                          <FormLabel>Topic Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter topic name"
                              value={newTopicName}
                              onChange={(e) => setNewTopicName(e.target.value)}
                            />
                          </FormControl>
                        </FormItem>
                      </div>
                      <DialogFooter>
                        <Button type="button" onClick={handleAddTopic}>
                          Add Topic
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <AlertDialog open={hideTopicDialogOpen} onOpenChange={setHideTopicDialogOpen}>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="text-muted-foreground hover:text-muted-foreground/90"
                        disabled={!field.value}
                      >
                        <EyeOff className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Hide Topic</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to hide this topic? This will also hide all subtopics. Hidden items can be restored later by an administrator.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleHideTopic}>
                          Hide
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
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
                      <SelectContent position="popper" className="z-[60]">
                        {subcategories?.map((subcategory) => (
                          <SelectItem key={subcategory.id} value={String(subcategory.id)}>
                            {subcategory.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  <Dialog open={newSubtopicDialogOpen} onOpenChange={setNewSubtopicDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={!selectedCategoryId}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                        <DialogTitle>Add New Subtopic</DialogTitle>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <FormItem>
                          <FormLabel>Subtopic Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter subtopic name"
                              value={newSubtopicName}
                              onChange={(e) => setNewSubtopicName(e.target.value)}
                            />
                          </FormControl>
                        </FormItem>
                      </div>
                      <DialogFooter>
                        <Button type="button" onClick={handleAddSubtopic}>
                          Add Subtopic
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <AlertDialog open={hideSubtopicDialogOpen} onOpenChange={setHideSubtopicDialogOpen}>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="text-muted-foreground hover:text-muted-foreground/90"
                        disabled={!field.value}
                      >
                        <EyeOff className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Hide Subtopic</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to hide this subtopic? Hidden items can be restored later by an administrator.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleHideSubtopic}>
                          Hide
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
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
                  <SelectContent position="popper" className="z-[60]">
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

        <div className="pt-4 border-t">
          <Button
            type="submit"
            className="w-full relative"
            disabled={isSubmitting || updateVideoMutation.isPending}
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
  );
}