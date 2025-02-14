import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardHeader, CardContent, CardFooter, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Image as ImageIcon } from "lucide-react";
import { useState, useRef } from "react";

// Type definitions
interface Category {
  id: number;
  name: string;
}

interface Subcategory {
  id: number;
  name: string;
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

function getVideoThumbnail(url: string, platform: string): string | null {
  if (platform === "youtube") {
    const videoId = url.includes("youtu.be")
      ? url.split("/").pop()
      : new URL(url).searchParams.get("v");
    return videoId
      ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      : null;
  }
  return null;
}

export function AdminVideoForm() {
  const queryClient = useQueryClient();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  });

  const addVideoMutation = useMutation({
    mutationFn: async (data: VideoFormData) => {
      try {
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

        const response = await apiRequest("POST", "/api/videos", payload);
        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.message || errorData?.error || "Failed to add video");
        }

        return response.json();
      } catch (error) {
        console.error('Video mutation error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      form.reset();
      setPreviewUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      toast({
        title: "Success",
        description: "Video added successfully",
      });
    },
    onError: (error: Error) => {
      console.error('Video mutation error handler:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to add video",
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
      setPreviewUrl(null);
    }
  };

  const onSubmit = (data: VideoFormData) => {
    console.log('Form submitted with data:', data);
    addVideoMutation.mutate(data);
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Add New Video</CardTitle>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="thumbnail"
              render={({ field: { onChange, value, ...field } }) => (
                <FormItem>
                  <FormLabel>Custom Thumbnail (Optional)</FormLabel>
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