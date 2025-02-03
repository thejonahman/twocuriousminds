import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Settings } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface Category {
  id: number;
  name: string;
}

interface Platform {
  id: string;
  name: string;
  icon: JSX.Element;
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
    { id: "youtube", name: "YouTube" },
    { id: "tiktok", name: "TikTok" },
    { id: "instagram", name: "Instagram" },
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
          <DialogTitle>Recommendation Preferences</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          <div>
            <h3 className="font-medium mb-3">Content Categories</h3>
            <ScrollArea className="h-[200px] rounded-md border p-4">
              <div className="grid grid-cols-2 gap-2">
                {categories?.map((category) => (
                  <div key={category.id} className="flex items-center gap-2">
                    <Badge
                      variant={preferences?.preferredCategories.includes(category.id) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleCategory(category.id, "preferred")}
                    >
                      {category.name}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={preferences?.excludedCategories.includes(category.id) ? "text-destructive" : ""}
                      onClick={() => toggleCategory(category.id, "excluded")}
                    >
                      {preferences?.excludedCategories.includes(category.id) ? "Excluded" : "Exclude"}
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
          <div>
            <h3 className="font-medium mb-3">Platforms</h3>
            <div className="flex gap-2">
              {platforms.map((platform) => (
                <Badge
                  key={platform.id}
                  variant={preferences?.preferredPlatforms.includes(platform.id) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => togglePlatform(platform.id)}
                >
                  {platform.name}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
