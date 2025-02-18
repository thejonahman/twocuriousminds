import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardContent, CardFooter, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Loader2 } from 'lucide-react';
import { VideoFormData, videoSchema, getVideoThumbnail, Category, Subcategory } from "@/types/video";
import { ThumbnailUpload } from "./thumbnail-upload";

async function uploadThumbnail(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('thumbnail', file);

  const response = await fetch('/api/upload/thumbnail', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Failed to upload thumbnail');
  }

  const data = await response.json();
  return data.url;
}

export function AdminVideoForm() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const form = useForm<VideoFormData>({
    resolver: zodResolver(videoSchema),
    defaultValues: {
      platform: "youtube",
      description: "",
    },
  });

  // Log form errors for debugging
  const formErrors = form.formState.errors;
  if (Object.keys(formErrors).length > 0) {
    console.log('Form validation errors:', formErrors);
  }

  // Fetch categories
  const { data: categories = [], isLoading: isCategoriesLoading, error: categoriesError } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    staleTime: 30000,
    retry: 3,
  });

  if (categoriesError) {
    console.error('Error fetching categories:', categoriesError);
  }

  // Watch selected category to fetch subcategories
  const selectedCategoryId = form.watch("categoryId");
  const selectedPlatform = form.watch("platform");
  const videoUrl = form.watch("url");

  // Log current form values for debugging
  console.log('Current form values:', {
    categoryId: selectedCategoryId,
    platform: selectedPlatform,
    url: videoUrl
  });

  // Fetch subcategories based on selected category
  const { data: subcategories = [], isLoading: isSubcategoriesLoading, error: subcategoriesError } = useQuery<Subcategory[]>({
    queryKey: [`/api/categories/${selectedCategoryId}/subcategories`],
    enabled: !!selectedCategoryId,
    staleTime: 30000,
    retry: 3,
  });

  if (subcategoriesError) {
    console.error('Error fetching subcategories:', subcategoriesError);
  }

  // Sort subcategories by displayOrder if available, then by name
  const sortedSubcategories = [...subcategories].sort((a, b) => {
    if (a.displayOrder !== undefined && b.displayOrder !== undefined) {
      return a.displayOrder - b.displayOrder;
    }
    return a.name.localeCompare(b.name);
  });

  const addVideoMutation = useMutation({
    mutationFn: async (data: VideoFormData) => {
      try {
        console.log('Starting video submission:', data);

        // Handle thumbnail upload if provided
        let thumbnailUrl = data.thumbnailFile 
          ? await uploadThumbnail(data.thumbnailFile)
          : data.thumbnailUrl || getVideoThumbnail(data.url, data.platform);

        console.log('Generated/Uploaded thumbnail URL:', thumbnailUrl);

        const payload = {
          ...data,
          categoryId: parseInt(data.categoryId),
          subcategoryId: data.subcategoryId ? parseInt(data.subcategoryId) : null,
          thumbnailUrl,
          customThumbnail: !!data.thumbnailFile || !!data.thumbnailUrl
        };

        // Remove the file from the payload as it's already uploaded
        delete (payload as any).thumbnailFile;

        console.log('Sending POST request to /api/videos with payload:', payload);

        const response = await apiRequest("POST", '/api/videos', payload);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Failed to add video");
        }

        console.log('Response status:', response.status);
        return response.json();
      } catch (error) {
        console.error('Video submission error:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('Video added successfully:', data);
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      form.reset();
      toast({
        title: "Success",
        description: "Video added successfully",
      });
      setLocation(`/admin/manage?highlight=${data.id}`);
    },
    onError: (error: Error) => {
      console.error('Mutation error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to add video",
        variant: "destructive",
      });
    }
  });

  const onSubmit = (data: VideoFormData) => {
    console.log('Form submitted with data:', data);
    addVideoMutation.mutate(data);
  };

  // Show loading state while categories are being fetched
  if (isCategoriesLoading) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Add New Video</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Add New Video</CardTitle>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <CardContent className="space-y-4">
            {/* Title field */}
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

            {/* Description field */}
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

            {/* URL field */}
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

            {/* Thumbnail Upload field */}
            <FormField
              control={form.control}
              name="thumbnailFile"
              render={({ field: { onChange, value, ...field } }) => (
                <FormItem>
                  <FormLabel>Thumbnail</FormLabel>
                  <FormControl>
                    <ThumbnailUpload
                      onUploadComplete={(url: string) => {
                        form.setValue("thumbnailUrl", url, { shouldValidate: true });
                        form.setValue("customThumbnail", true, { shouldValidate: true });
                      }}
                      currentThumbnail={form.getValues("thumbnailUrl")}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Category selection */}
            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Topic</FormLabel>
                  <div className="flex gap-2">
                    {isCategoriesLoading ? (
                      <Skeleton className="h-10 w-full" />
                    ) : categoriesError ? (
                      <div className="text-sm text-destructive">Failed to load topics. Please try again.</div>
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

            {/* Subcategory selection */}
            <FormField
              control={form.control}
              name="subcategoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subtopic (Optional)</FormLabel>
                  <div className="flex gap-2">
                    {isSubcategoriesLoading && selectedCategoryId ? (
                      <Skeleton className="h-10 w-full" />
                    ) : subcategoriesError ? (
                      <div className="text-sm text-destructive">Failed to load subtopics. Please try again.</div>
                    ) : (
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={!selectedCategoryId || sortedSubcategories.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                !selectedCategoryId
                                  ? "Select a topic first"
                                  : sortedSubcategories.length === 0
                                    ? "No subtopics available"
                                    : "Select subtopic"
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sortedSubcategories.map((subcategory) => (
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

            {/* Platform selection */}
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
              className="w-full relative"
              disabled={addVideoMutation.isPending}
            >
              {addVideoMutation.isPending ? (
                <div className="flex items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span>Adding...</span>
                </div>
              ) : (
                'Add Video'
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}