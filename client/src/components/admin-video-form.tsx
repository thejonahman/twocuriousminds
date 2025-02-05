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
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useState } from 'react';
import { Plus } from 'lucide-react';

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
  platform: z.enum(["youtube", "tiktok", "instagram"]),
});

type VideoFormData = z.infer<typeof videoSchema>;

interface NewTopicFormData {
  name: string;
  parentCategoryId?: string;
}

export function AdminVideoForm() {
  const queryClient = useQueryClient();
  const [newTopicDialogOpen, setNewTopicDialogOpen] = useState(false);
  const [newSubtopicDialogOpen, setNewSubtopicDialogOpen] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [newSubtopicName, setNewSubtopicName] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false);

  const form = useForm<VideoFormData>({
    resolver: zodResolver(videoSchema),
    defaultValues: {
      platform: "youtube",
      description: "",
    },
  });

  const { data: categories } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ["/api/categories"],
  });

  const selectedCategoryId = form.watch("categoryId");

  const { data: subcategories } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: [`/api/categories/${selectedCategoryId}/subcategories`],
    enabled: !!selectedCategoryId,
  });

  const addTopicMutation = useMutation({
    mutationFn: async (data: NewTopicFormData) => {
      const response = await apiRequest("POST", "/api/categories", {
        name: data.name,
        parentCategoryId: data.parentCategoryId ? parseInt(data.parentCategoryId) : undefined,
      });
      if (!response.ok) throw new Error("Failed to create topic");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      if (selectedCategoryId) {
        queryClient.invalidateQueries({
          queryKey: [`/api/categories/${selectedCategoryId}/subcategories`]
        });
      }
      toast({ title: "Success", description: "Topic added successfully" });
      setNewTopicDialogOpen(false);
      setNewSubtopicDialogOpen(false);
      setNewTopicName("");
      setNewSubtopicName("");
    },
  });

  const generateThumbnailMutation = useMutation({
    mutationFn: async ({ title, description }: { title: string; description?: string }) => {
      const response = await apiRequest("POST", "/api/thumbnails/generate", {
        title,
        description,
      });
      if (!response.ok) throw new Error("Failed to generate thumbnail");
      return response.json();
    },
    onSuccess: (data) => {
      setThumbnailUrl(data.imageUrl);
      setIsGeneratingThumbnail(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate thumbnail",
        variant: "destructive",
      });
      setIsGeneratingThumbnail(false);
    },
  });

  const addVideoMutation = useMutation({
    mutationFn: async (data: VideoFormData) => {
      try {
        const formData = new FormData();
        // Convert IDs to numbers
        formData.append('categoryId', String(parseInt(data.categoryId)));
        if (data.subcategoryId) {
          formData.append('subcategoryId', String(parseInt(data.subcategoryId)));
        }

        // Add all other fields
        formData.append('title', data.title);
        formData.append('description', data.description || '');
        formData.append('url', data.url);
        formData.append('platform', data.platform);

        // Add the generated thumbnail URL if available
        if (thumbnailUrl) {
          formData.append('thumbnailUrl', thumbnailUrl);
        }

        const response = await fetch("/api/videos", {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Failed to add video");
        }

        return response.json();
      } catch (error) {
        console.error('Video submission error:', error);
        if (error instanceof Error) {
          throw error;
        }
        throw new Error("Failed to add video");
      }
    },
    onSuccess: () => {
      window.scrollTo(0, 0);
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      form.reset();
      setThumbnailUrl(null);
      toast({
        title: "Success",
        description: "Video added successfully",
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

  const handleGenerateThumbnail = async () => {
    const title = form.getValues("title");
    const description = form.getValues("description");
    if (!title) {
      toast({
        title: "Error",
        description: "Please enter a title first",
        variant: "destructive",
      });
      return;
    }
    setIsGeneratingThumbnail(true);
    generateThumbnailMutation.mutate({ title, description });
  };

  const onSubmit = (data: VideoFormData) => {
    addVideoMutation.mutate(data);
  };

  const handleAddTopic = () => {
    if (!newTopicName.trim()) return;
    addTopicMutation.mutate({ name: newTopicName });
  };

  const handleAddSubtopic = () => {
    if (!newSubtopicName.trim() || !selectedCategoryId) return;
    addTopicMutation.mutate({
      name: newSubtopicName,
      parentCategoryId: selectedCategoryId,
    });
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

            <div className="flex items-end gap-2">
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Topic</FormLabel>
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Dialog open={newTopicDialogOpen} onOpenChange={setNewTopicDialogOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" size="icon">
                    <Plus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Topic</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
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
            </div>

            <div className="flex items-end gap-2">
              <FormField
                control={form.control}
                name="subcategoryId"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Subtopic (Optional)</FormLabel>
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
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Subtopic</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
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
            </div>

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