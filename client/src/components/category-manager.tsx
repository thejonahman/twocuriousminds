import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface Category {
  id: number;
  name: string;
  displayOrder?: number;
}

interface Subcategory {
  id: number;
  name: string;
  categoryId: number;
  displayOrder?: number;
}

export function CategoryManager() {
  const queryClient = useQueryClient();
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newSubcategoryName, setNewSubcategoryName] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);

  const { data: categories = [], isLoading: isCategoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    staleTime: 30000,
  });

  const { data: subcategories = [], isLoading: isSubcategoriesLoading } = useQuery<Subcategory[]>({
    queryKey: [`/api/categories/${selectedCategoryId}/subcategories`],
    enabled: !!selectedCategoryId,
    staleTime: 30000,
  });

  const addCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest("POST", "/api/categories", { name });
      if (!response.ok) {
        throw new Error("Failed to add category");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      setNewCategoryName("");
      toast({
        title: "Success",
        description: "Category added successfully",
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

  const addSubcategoryMutation = useMutation({
    mutationFn: async ({ name, categoryId }: { name: string; categoryId: number }) => {
      const response = await apiRequest("POST", `/api/categories/${categoryId}/subcategories`, { name });
      if (!response.ok) {
        throw new Error("Failed to add subcategory");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/categories/${selectedCategoryId}/subcategories`] });
      setNewSubcategoryName("");
      toast({
        title: "Success",
        description: "Subcategory added successfully",
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

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/categories/${id}`);
      if (!response.ok) {
        throw new Error("Failed to delete category");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({
        title: "Success",
        description: "Category deleted successfully",
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

  const deleteSubcategoryMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/subcategories/${id}`);
      if (!response.ok) {
        throw new Error("Failed to delete subcategory");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/categories/${selectedCategoryId}/subcategories`] });
      toast({
        title: "Success",
        description: "Subcategory deleted successfully",
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

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    addCategoryMutation.mutate(newCategoryName);
  };

  const handleAddSubcategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubcategoryName.trim() || !selectedCategoryId) return;
    addSubcategoryMutation.mutate({
      name: newSubcategoryName,
      categoryId: selectedCategoryId,
    });
  };

  if (isCategoriesLoading) {
    return <div>Loading categories...</div>;
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Categories Section */}
      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAddCategory} className="flex gap-2">
            <Input
              placeholder="New category name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
            />
            <Button type="submit" disabled={addCategoryMutation.isPending}>
              {addCategoryMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Add"
              )}
            </Button>
          </form>

          <div className="space-y-2">
            {categories.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between p-2 rounded hover:bg-accent"
              >
                <button
                  className="flex-1 text-left"
                  onClick={() => setSelectedCategoryId(category.id)}
                >
                  {category.name}
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteCategoryMutation.mutate(category.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Subcategories Section */}
      <Card>
        <CardHeader>
          <CardTitle>Subcategories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAddSubcategory} className="flex gap-2">
            <Input
              placeholder={selectedCategoryId ? "New subcategory name" : "Select a category first"}
              value={newSubcategoryName}
              onChange={(e) => setNewSubcategoryName(e.target.value)}
              disabled={!selectedCategoryId}
            />
            <Button type="submit" disabled={!selectedCategoryId || addSubcategoryMutation.isPending}>
              {addSubcategoryMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Add"
              )}
            </Button>
          </form>

          <div className="space-y-2">
            {selectedCategoryId ? (
              isSubcategoriesLoading ? (
                <div>Loading subcategories...</div>
              ) : subcategories.length === 0 ? (
                <div className="text-muted-foreground">No subcategories yet</div>
              ) : (
                subcategories
                  .filter((sub) => sub.categoryId === selectedCategoryId)
                  .map((subcategory) => (
                    <div
                      key={subcategory.id}
                      className="flex items-center justify-between p-2 rounded hover:bg-accent"
                    >
                      <span>{subcategory.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteSubcategoryMutation.mutate(subcategory.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
              )
            ) : (
              <div className="text-muted-foreground">Select a category to manage subcategories</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}