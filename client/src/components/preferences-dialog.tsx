import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Settings, ThumbsDown, Youtube, Instagram } from "lucide-react";
import { SiTiktok } from "react-icons/si";
import { apiRequest } from "@/lib/queryClient";

interface Category {
  id: number;
  name: string;
}

interface PreferencesData {
  preferredCategories: number[];
  preferredPlatforms: string[];
  excludedCategories: number[];
}

export function PreferencesDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: categories } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: preferences } = useQuery<PreferencesData>({
    queryKey: ["/api/preferences"],
  });

  const platforms = [
    { id: "youtube", name: "YouTube", icon: <Youtube className="h-4 w-4 text-red-500" /> },
    { id: "tiktok", name: "TikTok", icon: <SiTiktok className="h-4 w-4" /> },
    { id: "instagram", name: "Instagram", icon: <Instagram className="h-4 w-4 text-pink-500" /> },
  ];

  const mutation = useMutation({
    mutationFn: async (data: PreferencesData) => {
      const res = await apiRequest("POST", "/api/preferences", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] }); // Refresh recommendations
      setOpen(false);
    },
  });

  const toggleCategory = (categoryId: number, type: "preferred" | "excluded") => {
    if (!preferences) return;

    const newPreferences = { ...preferences };
    if (type === "preferred") {
      if (newPreferences.preferredCategories.includes(categoryId)) {
        newPreferences.preferredCategories = newPreferences.preferredCategories.filter(id => id !== categoryId);
      } else {
        newPreferences.preferredCategories = [...newPreferences.preferredCategories, categoryId];
        // Remove from excluded if it was there
        newPreferences.excludedCategories = newPreferences.excludedCategories.filter(id => id !== categoryId);
      }
    } else {
      if (newPreferences.excludedCategories.includes(categoryId)) {
        newPreferences.excludedCategories = newPreferences.excludedCategories.filter(id => id !== categoryId);
      } else {
        newPreferences.excludedCategories = [...newPreferences.excludedCategories, categoryId];
        // Remove from preferred if it was there
        newPreferences.preferredCategories = newPreferences.preferredCategories.filter(id => id !== categoryId);
      }
    }

    mutation.mutate(newPreferences);
  };

  const togglePlatform = (platformId: string) => {
    if (!preferences) return;

    const newPreferences = { ...preferences };
    if (newPreferences.preferredPlatforms.includes(platformId)) {
      newPreferences.preferredPlatforms = newPreferences.preferredPlatforms.filter(id => id !== platformId);
    } else {
      newPreferences.preferredPlatforms = [...newPreferences.preferredPlatforms, platformId];
    }

    mutation.mutate(newPreferences);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Settings className="h-4 w-4" />
          <span className="sr-only">Preferences</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Content Preferences</DialogTitle>
          <DialogDescription>
            Customize your learning experience by selecting topics you're interested in and platforms you prefer.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-6">
          <div>
            <h3 className="font-medium mb-2">Content Categories</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Select categories you're interested in or want to exclude from recommendations.
            </p>
            <ScrollArea className="h-[300px] rounded-md border">
              <div className="p-4 grid gap-4">
                {categories?.map((category) => (
                  <div 
                    key={category.id} 
                    className={`p-3 rounded-lg transition-colors ${
                      preferences?.preferredCategories.includes(category.id)
                        ? 'bg-primary/10'
                        : preferences?.excludedCategories.includes(category.id)
                        ? 'bg-destructive/10'
                        : 'hover:bg-accent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Badge
                        variant={preferences?.preferredCategories.includes(category.id) ? "default" : "outline"}
                        className="text-base font-normal py-1.5"
                      >
                        {category.name}
                      </Badge>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`gap-2 ${
                            preferences?.preferredCategories.includes(category.id)
                              ? 'text-primary hover:text-primary'
                              : ''
                          }`}
                          onClick={() => toggleCategory(category.id, "preferred")}
                        >
                          {preferences?.preferredCategories.includes(category.id) ? "Selected" : "Select"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`gap-2 ${
                            preferences?.excludedCategories.includes(category.id)
                              ? 'text-destructive hover:text-destructive'
                              : ''
                          }`}
                          onClick={() => toggleCategory(category.id, "excluded")}
                        >
                          <ThumbsDown className="h-4 w-4" />
                          {preferences?.excludedCategories.includes(category.id) ? "Excluded" : "Exclude"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
          <div>
            <h3 className="font-medium mb-2">Preferred Platforms</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Choose which platforms you prefer to watch content from.
            </p>
            <div className="flex gap-3">
              {platforms.map((platform) => (
                <Button
                  key={platform.id}
                  variant={preferences?.preferredPlatforms.includes(platform.id) ? "default" : "outline"}
                  className="gap-2"
                  onClick={() => togglePlatform(platform.id)}
                >
                  {platform.icon}
                  {platform.name}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}