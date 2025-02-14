import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardHeader, CardContent, CardFooter, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

// Type definitions
interface Category {
  id: number;
  name: string;
}

interface Subcategory {
  id: number;
  name: string;
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

export function AdminVideoForm() {
  const queryClient = useQueryClient();
  const [newTopicDialogOpen, setNewTopicDialogOpen] = useState(false);
  const [newSubtopicDialogOpen, setNewSubtopicDialogOpen] = useState(false);
  const [deleteTopicDialogOpen, setDeleteTopicDialogOpen] = useState(false);
  const [deleteSubtopicDialogOpen, setDeleteSubtopicDialogOpen] = useState(false);
  const [selectedTopicToDelete, setSelectedTopicToDelete] = useState<string | null>(null);
  const [selectedSubtopicToDelete, setSelectedSubtopicToDelete] = useState<string | null>(null);
  const [newTopicName, setNewTopicName] = useState("");
  const [newSubtopicName, setNewSubtopicName] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false);
  const [currentVideoId, setCurrentVideoId] = useState<number | null>(null);

  const form = useForm<VideoFormData>({
    resolver: zodResolver(videoSchema),
    defaultValues: {
      platform: "youtube",
      description: "",
    },
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
    retry: false,
  });

  const addVideoMutation = useMutation({
    mutationFn: async (data: VideoFormData) => {
      const payload = {
        ...data,
        categoryId: parseInt(data.categoryId),
        subcategoryId: data.subcategoryId ? parseInt(data.subcategoryId) : null,
        thumbnailUrl
      };


      const response = await apiRequest("POST", "/api/videos", payload);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to add video");
      }

      const videoData = await response.json();
      setCurrentVideoId(videoData.id);
      return videoData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });

      form.reset();
      setThumbnailUrl(null);
      setCurrentVideoId(null);

      toast({
        title: "Success",
        description: "Video added successfully",
      });
    },
    onError: (error: Error) => {
      console.error('Video submission error:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const generateThumbnailMutation = useMutation({
    mutationFn: async ({ title, description }: { title: string; description?: string }) => {
      const response = await apiRequest("POST", "/api/thumbnails/generate", {
        title,
        description,
        url: form.getValues("url"),
        platform: form.getValues("platform")
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate thumbnail");
      }

      return response.json();
    },
    onSuccess: (data: { thumbnailUrl: string }) => {
      setThumbnailUrl(data.thumbnailUrl);
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
      if (!currentVideoId) {
        throw new Error("Please save the video first before uploading a custom thumbnail");
      }

      const formData = new FormData();
      formData.append('thumbnail', file);

      const response = await apiRequest(
        "PATCH",
        `/api/thumbnails/${currentVideoId}/thumbnail`,
        formData,
        { isFormData: true }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to upload thumbnail");
      }

      return response.json();
    },
    onSuccess: (data: { thumbnailUrl: string }) => {
      setThumbnailUrl(data.thumbnailUrl);
      toast({
        title: "Success",
        description: "Custom thumbnail uploaded successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "Error",
          description: "File size must be less than 5MB",
          variant: "destructive",
        });
        return;
      }
      uploadThumbnailMutation.mutate(file);
    }
  };

  const handleGenerateThumbnail = async () => {
    const title = form.getValues("title");
    const description = form.getValues("description");

    if (!title) {
      toast({
        title: "Error",
        description: "Please enter a title before generating a thumbnail",
        variant: "destructive"
      });
      return;
    }

    setIsGeneratingThumbnail(true);
    generateThumbnailMutation.mutate({ title, description });
  };

  const onSubmit = (data: VideoFormData) => {
    addVideoMutation.mutate(data);
  };

  const handleAddTopic = async () => {
    if (!newTopicName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a topic name",
        variant: "destructive"
      });
      return;
    }

    try {
      const response = await apiRequest("POST", "/api/categories", {
        name: newTopicName.trim()
      });

      if (!response.ok) {
        throw new Error("Failed to add topic");
      }

      const newCategory = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      setNewTopicDialogOpen(false);
      setNewTopicName("");

      toast({
        title: "Success",
        description: "Topic added successfully"
      });

      form.setValue("categoryId", String(newCategory.id));
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add topic",
        variant: "destructive"
      });
    }
  };

  const handleDeleteTopic = async () => {
    if (!selectedTopicToDelete) return;

    try {
      const response = await apiRequest("DELETE", `/api/categories/${selectedTopicToDelete}`);

      if (!response.ok) {
        throw new Error("Failed to delete topic");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      setDeleteTopicDialogOpen(false);
      setSelectedTopicToDelete(null);
      form.setValue("categoryId", "");
      form.setValue("subcategoryId", "");

      toast({
        title: "Success",
        description: "Topic deleted successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete topic",
        variant: "destructive"
      });
    }
  };


  const handleAddSubtopic = async () => {
    if (!newSubtopicName.trim() || !selectedCategoryId) {
      toast({
        title: "Error",
        description: "Please enter a subtopic name and select a topic",
        variant: "destructive"
      });
      return;
    }

    try {
      const response = await apiRequest("POST", `/api/categories/${selectedCategoryId}/subcategories`, {
        name: newSubtopicName.trim()
      });

      if (!response.ok) {
        throw new Error("Failed to add subtopic");
      }

      const newSubcategory = await response.json();
      queryClient.invalidateQueries({
        queryKey: [`/api/categories/${selectedCategoryId}/subcategories`]
      });
      setNewSubtopicDialogOpen(false);
      setNewSubtopicName("");

      toast({
        title: "Success",
        description: "Subtopic added successfully"
      });

      form.setValue("subcategoryId", String(newSubcategory.id));
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add subtopic",
        variant: "destructive"
      });
    }
  };

  const handleDeleteSubtopic = async () => {
    if (!selectedSubtopicToDelete || !selectedCategoryId) return;

    try {
      const response = await apiRequest(
        "DELETE",
        `/api/categories/${selectedCategoryId}/subcategories/${selectedSubtopicToDelete}`
      );

      if (!response.ok) {
        throw new Error("Failed to delete subtopic");
      }

      queryClient.invalidateQueries({
        queryKey: [`/api/categories/${selectedCategoryId}/subcategories`]
      });
      setDeleteSubtopicDialogOpen(false);
      setSelectedSubtopicToDelete(null);
      form.setValue("subcategoryId", "");

      toast({
        title: "Success",
        description: "Subtopic deleted successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete subtopic",
        variant: "destructive"
      });
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Add New Video</CardTitle>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
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
                <input
                  type="file"
                  onChange={handleFileChange}
                  accept="image/*"
                  className="max-w-xs"
                />
              </div>
            </div>

            <FormField
              control={form.control}
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

            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Topic</FormLabel>
                  <Select
                    onValueChange={field.onChange}
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
    </Card>
  );
}