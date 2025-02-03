import { useState } from "react";
import { useNavigate } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export default function ProfileWizard() {
  const [step, setStep] = useState(1);
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [excludedCategories, setExcludedCategories] = useState<number[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: categories } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const mutation = useMutation({
    mutationFn: async (preferences: {
      preferredCategories: number[];
      excludedCategories: number[];
      preferredPlatforms: string[];
    }) => {
      const res = await apiRequest("POST", "/api/preferences", preferences);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Preferences saved",
        description: "Your profile has been set up successfully!",
      });
      navigate("/");
    },
  });

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
            Let's personalize your experience, {user?.username}
          </CardDescription>
          <Progress value={step * 33.33} className="mt-2" />
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-medium">What content interests you?</h3>
              <div className="grid grid-cols-2 gap-2">
                {categories?.map((category) => (
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
                {categories?.map((category) => (
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
          <Button onClick={handleNext} disabled={mutation.isPending}>
            {step === 3 ? "Finish" : "Next"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
