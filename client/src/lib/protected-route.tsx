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

  // Store the current URL before redirecting to auth
  if (!user) {
    // Store the full URL including search params
    sessionStorage.setItem('returnUrl', window.location.pathname + window.location.search);
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