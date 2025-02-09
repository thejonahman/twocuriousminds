import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Youtube, Instagram } from "lucide-react";
import { SiTiktok } from "react-icons/si";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Category {
  id: number;
  name: string;
  description: string | null;
}

interface Preferences {
  preferredCategories: number[];
  excludedCategories: number[];
  preferredPlatforms: string[];
}

export default function ProfileWizard() {
  const [step, setStep] = useState(1);
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [excludedCategories, setExcludedCategories] = useState<number[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Query to fetch categories
  const { data: categories = [], isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    queryFn: async () => {
      const res = await fetch('/api/categories');
      if (!res.ok) throw new Error('Failed to fetch categories');
      return res.json();
    },
  });

  // Query to fetch existing preferences
  const { data: existingPreferences, isLoading: preferencesLoading } = useQuery<Preferences>({
    queryKey: ["/api/preferences"],
    enabled: !!user,
    queryFn: async () => {
      const res = await fetch('/api/preferences');
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error('Failed to fetch preferences');
      }
      return res.json();
    },
  });

  // Effect to check for existing preferences and redirect if found
  useEffect(() => {
    if (!preferencesLoading && existingPreferences) {
      const hasPreferences = (
        (existingPreferences.preferredCategories?.length ?? 0) > 0 ||
        (existingPreferences.excludedCategories?.length ?? 0) > 0 ||
        (existingPreferences.preferredPlatforms?.length ?? 0) > 0
      );

      if (hasPreferences) {
        toast({
          title: "Preferences Already Set",
          description: "Your viewing preferences are already configured.",
        });
        navigate("/");
      }
    }
  }, [existingPreferences, preferencesLoading, navigate, toast]);

  const mutation = useMutation({
    mutationFn: async (preferences: Preferences) => {
      const res = await apiRequest("POST", "/api/preferences", preferences);
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || 'Failed to save preferences');
      }
      const data = await res.json();
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Preferences saved",
        description: "Your profile has been set up successfully!",
      });
      navigate("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // If still loading preferences or categories, show loading state
  if (preferencesLoading || categoriesLoading) {
    return (
      <div className="container max-w-2xl py-8">
        <Card>
          <CardHeader>
            <CardTitle>Loading</CardTitle>
            <CardDescription>Please wait while we load your preferences...</CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={100} className="w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const platforms = [
    { id: "youtube", name: "YouTube", icon: <Youtube className="h-4 w-4" /> },
    { id: "tiktok", name: "TikTok", icon: <SiTiktok className="h-4 w-4" /> },
    { id: "instagram", name: "Instagram", icon: <Instagram className="h-4 w-4" /> },
  ];

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      mutation.mutate({
        preferredCategories: selectedCategories,
        excludedCategories,
        preferredPlatforms: selectedPlatforms,
      });
    }
  };

  const toggleCategory = (categoryId: number, type: "preferred" | "excluded") => {
    if (type === "preferred") {
      setSelectedCategories(prev =>
        prev.includes(categoryId)
          ? prev.filter(id => id !== categoryId)
          : [...prev, categoryId]
      );
      setExcludedCategories(prev => prev.filter(id => id !== categoryId));
    } else {
      setExcludedCategories(prev =>
        prev.includes(categoryId)
          ? prev.filter(id => id !== categoryId)
          : [...prev, categoryId]
      );
      setSelectedCategories(prev => prev.filter(id => id !== categoryId));
    }
  };

  const togglePlatform = (platformId: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(platformId)
        ? prev.filter(id => id !== platformId)
        : [...prev, platformId]
    );
  };

  return (
    <div className="container max-w-2xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>Set Up Your Profile</CardTitle>
          <CardDescription>
            Let's personalize your experience{user?.username ? `, ${user.username}` : ''}
          </CardDescription>
          <Progress value={step * 33.33} className="mt-2" />
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-medium">What content interests you?</h3>
              <div className="grid grid-cols-2 gap-2">
                {categories.map((category) => (
                  <div key={category.id} className="flex items-center gap-2">
                    <Badge
                      variant={selectedCategories.includes(category.id) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleCategory(category.id, "preferred")}
                    >
                      {category.name}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-medium">Any topics you want to avoid?</h3>
              <div className="grid grid-cols-2 gap-2">
                {categories.map((category) => (
                  <div key={category.id} className="flex items-center gap-2">
                    <Badge
                      variant={excludedCategories.includes(category.id) ? "destructive" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleCategory(category.id, "excluded")}
                    >
                      {category.name}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-medium">Which platforms do you prefer?</h3>
              <div className="flex gap-2">
                {platforms.map((platform) => (
                  <Badge
                    key={platform.id}
                    variant={selectedPlatforms.includes(platform.id) ? "default" : "outline"}
                    className="cursor-pointer gap-2"
                    onClick={() => togglePlatform(platform.id)}
                  >
                    {platform.icon}
                    {platform.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          <Button 
            onClick={handleNext} 
            disabled={mutation.isPending}
            className={step === 1 ? "ml-auto" : ""}
          >
            {step === 3 ? "Finish" : "Next"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}