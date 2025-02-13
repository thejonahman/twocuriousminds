import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardHeader, CardContent, CardFooter, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useState } from 'react';
import { Plus } from 'lucide-react';
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

const subtopicSchema = z.object({
  name: z.string().min(1, "Subtopic name is required"),
});

type VideoFormData = z.infer<typeof videoSchema>;
type SubtopicFormData = z.infer<typeof subtopicSchema>;

interface Category {
  id: number;
  name: string;
  parentId: number | null;
  description: string | null;
}

export function AdminVideoForm() {
  const queryClient = useQueryClient();
  const [newSubtopicDialogOpen, setNewSubtopicDialogOpen] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false);

  const videoForm = useForm<VideoFormData>({
    resolver: zodResolver(videoSchema),
    defaultValues: {
      platform: "youtube",
      description: "",
    },
  });

  const subtopicForm = useForm<SubtopicFormData>({
    resolver: zodResolver(subtopicSchema),
    defaultValues: {
      name: "",
    },
  });

  const selectedCategoryId = videoForm.watch("categoryId");

  const { data: categories, isLoading: isCategoriesLoading, error: categoriesError } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    staleTime: 30000,
    retry: 2,
    onError: (error) => {
      console.error('Error loading categories:', error);
      toast({
        title: "Error",
        description: "Failed to load categories. Please try again.",
        variant: "destructive",
      });
    }
  });

  const { data: subcategories = [], isLoading: isSubcategoriesLoading, error: subcategoriesError } = useQuery<Category[]>({
    queryKey: [`/api/categories/${selectedCategoryId}/subcategories`],
    enabled: !!selectedCategoryId && selectedCategoryId !== "",
    staleTime: 30000,
    retry: 2,
    onError: (error) => {
      console.error('Error loading subcategories:', error);
      toast({
        title: "Error",
        description: "Failed to load subcategories. Please try again.",
        variant: "destructive",
      });
    }
  });

  const addVideoMutation = useMutation({
    mutationFn: async (data: VideoFormData) => {
      const formattedData = {
        ...data,
        thumbnailUrl,
        categoryId: parseInt(data.categoryId),
        subcategoryId: data.subcategoryId ? parseInt(data.subcategoryId) : undefined
      };

      const response = await fetch('/api/videos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formattedData),
        credentials: 'include'
      });

      if (!response.ok) {
        const text = await response.text();
        try {
          const errorData = JSON.parse(text);
          throw new Error(errorData.message || "Failed to add video");
        } catch (e) {
          throw new Error(`Server error: ${text}`);
        }
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      videoForm.reset();
      setThumbnailUrl(null);
      toast({
        title: "Success",
        description: "Video added successfully",
      });
    },
    onError: (error: Error) => {
      console.error('Video submission error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to add video",
        variant: "destructive",
      });
    },
  });

  const addSubtopicMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          parentId: parseInt(selectedCategoryId)
        }),
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to add subtopic");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: [`/api/categories/${selectedCategoryId}/subcategories`] 
      });
      subtopicForm.reset();
      setNewSubtopicDialogOpen(false);
      toast({
        title: "Success",
        description: "Subtopic added successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const generateThumbnailMutation = useMutation({
    mutationFn: async ({ title, description }: { title: string; description?: string }) => {
      const response = await fetch("/api/thumbnails/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          description,
          url: videoForm.getValues("url"),
          platform: videoForm.getValues("platform")
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to generate thumbnail");
      }

      return response.json();
    },
    onSuccess: (data) => {
      setThumbnailUrl(data.thumbnailUrl);
      setIsGeneratingThumbnail(false);
      toast({
        title: "Success",
        description: "Thumbnail generated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to generate thumbnail",
        description: error.message,
        variant: "destructive",
      });
      setIsGeneratingThumbnail(false);
    },
  });

  const handleAddSubtopic = async (data: SubtopicFormData) => {
    if (!selectedCategoryId) {
      toast({
        title: "Error",
        description: "Please select a main category first",
        variant: "destructive"
      });
      return;
    }

    try {
      await addSubtopicMutation.mutateAsync(data.name.trim());
    } catch (error) {
      console.error('Error adding subtopic:', error);
    }
  };

  const handleGenerateThumbnail = async () => {
    const title = videoForm.getValues("title");
    const description = videoForm.getValues("description");

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

  const onSubmit = async (data: VideoFormData) => {
    if (!data.categoryId) {
      toast({
        title: "Error",
        description: "Please select a category",
        variant: "destructive"
      });
      return;
    }

    try {
      await addVideoMutation.mutateAsync(data);
    } catch (error) {
      console.error('Form submission error:', error);
    }
  };

  const renderCategorySelect = () => {
    if (isCategoriesLoading) {
      return <Skeleton className="h-10 w-full" />;
    }

    if (categoriesError) {
      return <div className="text-destructive">Failed to load categories</div>;
    }

    return (
      <Select
        onValueChange={(value) => {
          videoForm.setValue("categoryId", value);
          videoForm.setValue("subcategoryId", "");
        }}
        value={videoForm.watch("categoryId")}
      >
        <FormControl>
          <SelectTrigger>
            <SelectValue placeholder="Select category" />
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
    );
  };

  const renderSubcategorySelect = () => {
    if (isSubcategoriesLoading) {
      return <Skeleton className="h-10 w-full" />;
    }

    if (subcategoriesError) {
      return <div className="text-destructive">Failed to load subcategories</div>;
    }

    return (
      <Select
        onValueChange={value => videoForm.setValue("subcategoryId", value)}
        value={videoForm.watch("subcategoryId")}
      >
        <FormControl>
          <SelectTrigger>
            <SelectValue placeholder="Select subcategory" />
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
    );
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Add New Video</CardTitle>
      </CardHeader>
      <Form {...videoForm}>
        <form onSubmit={videoForm.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <FormField
              control={videoForm.control}
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
              control={videoForm.control}
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

            <div className="space-y-2">
              <FormLabel>Thumbnail</FormLabel>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                {thumbnailUrl && (
                  <div className="relative w-40 h-24 bg-muted rounded-lg overflow-hidden shrink-0">
                    <img
                      src={thumbnailUrl}
                      alt="Generated thumbnail"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleGenerateThumbnail}
                  disabled={isGeneratingThumbnail}
                  className="w-full sm:w-auto"
                >
                  {isGeneratingThumbnail ? "Generating..." : "Generate Thumbnail"}
                </Button>
              </div>
            </div>

            <FormField
              control={videoForm.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL</FormLabel>
                  <FormControl>
                    <Input placeholder="Paste video URL" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-end gap-2">
              <FormField
                control={videoForm.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Category</FormLabel>
                    {renderCategorySelect()}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {selectedCategoryId && (
              <div className="flex items-end gap-2">
                <FormField
                  control={videoForm.control}
                  name="subcategoryId"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel className="flex items-center justify-between">
                        <span>Subcategory (Optional)</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => setNewSubtopicDialogOpen(true)}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add New
                        </Button>
                      </FormLabel>
                      {renderSubcategorySelect()}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <FormField
              control={videoForm.control}
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
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              className="w-full"
              disabled={addVideoMutation.isPending}
            >
              {addVideoMutation.isPending ? "Adding..." : "Add Video"}
            </Button>
          </CardFooter>
        </form>
      </Form>

      <Dialog open={newSubtopicDialogOpen} onOpenChange={setNewSubtopicDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Subtopic</DialogTitle>
          </DialogHeader>
          <Form {...subtopicForm}>
            <form onSubmit={subtopicForm.handleSubmit(handleAddSubtopic)}>
              <div className="grid gap-4 py-4">
                <FormField
                  control={subtopicForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subtopic Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter subtopic name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button 
                  type="submit"
                  disabled={addSubtopicMutation.isPending}
                >
                  {addSubtopicMutation.isPending ? "Adding..." : "Add Subtopic"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}