import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";

interface ProtectedRouteProps {
  path: string;
  component: () => JSX.Element;
  adminRequired?: boolean;
}

export function ProtectedRoute({
  path,
  component: Component,
  adminRequired = false,
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Route path={path}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-border" />
        </div>
      </Route>
    );
  }

  // Store navigation data before redirecting to auth
  if (!user) {
    const pathParts = window.location.pathname.split('/');
    const searchParams = new URLSearchParams(window.location.search);
    const videoId = searchParams.get('videoId');

    if (pathParts.includes('join-group')) {
      const joinGroupIndex = pathParts.indexOf('join-group');
      if (joinGroupIndex > 0 && pathParts[joinGroupIndex + 1] && videoId) {
        sessionStorage.setItem('targetType', 'join-group');
        sessionStorage.setItem('targetId', videoId);
        sessionStorage.setItem('inviteCode', pathParts[joinGroupIndex + 1]);
        console.log('Storing join-group navigation data:', {
          type: 'join-group',
          videoId,
          inviteCode: pathParts[joinGroupIndex + 1],
          fullPath: window.location.pathname + window.location.search
        });
      }
    } else if (pathParts.includes('group')) {
      const groupIndex = pathParts.indexOf('group');
      if (groupIndex > 0 && pathParts[groupIndex + 1]) {
        sessionStorage.setItem('targetType', 'group');
        sessionStorage.setItem('targetId', pathParts[groupIndex + 1]);
        console.log('Storing navigation data:', {
          type: 'group',
          id: pathParts[groupIndex + 1],
          fullPath: window.location.pathname
        });
      }
    }
  }

  // Check for user authentication and admin status if required
  if (!user || (adminRequired && !user.isAdmin)) {
    return (
      <Route path={path}>
        <Redirect to={!user ? "/auth" : "/"} />
      </Route>
    );
  }

  return <Route path={path} component={Component} />;
}