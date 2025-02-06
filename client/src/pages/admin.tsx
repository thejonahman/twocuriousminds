import { useQuery } from "@tanstack/react-query";
import { AdminVideoForm } from "@/components/admin-video-form";
import { VideoGrid } from "@/components/video-grid";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import { Video } from "@/lib/types";

interface User {
  id: number;
  username: string;
  email: string;
  isAdmin: boolean;
}

export function AdminPage(): JSX.Element {
  const [, setLocation] = useLocation();

  // Check if user is admin
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/user"],
    retry: false,
  });

  // Redirect non-admin users
  if (!isLoading && (!user || !user.isAdmin)) {
    setLocation("/");
    return <></>;
  }

  const { data: videos } = useQuery<Video[]>({
    queryKey: ["/api/videos"],
    enabled: !!user?.isAdmin,
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Admin Dashboard</CardTitle>
          <CardDescription>
            Manage videos and content from this dashboard
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="add">
        <TabsList>
          <TabsTrigger value="add">Add New Video</TabsTrigger>
          <TabsTrigger value="manage">Manage Videos</TabsTrigger>
        </TabsList>

        <TabsContent value="add" className="space-y-4">
          <AdminVideoForm />
        </TabsContent>

        <TabsContent value="manage">
          {videos && <VideoGrid videos={videos} showEditButton={true} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}