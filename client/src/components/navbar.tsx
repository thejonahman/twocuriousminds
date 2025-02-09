import { Link } from "wouter";
import { Brain, User } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { PreferencesDialog } from "@/components/preferences-dialog";

export default function Navbar() {
  const { user, logoutMutation } = useAuth();

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between px-4">
        <Link href="/" className="flex items-center space-x-2">
          <Brain className="h-6 w-6 text-primary" />
          <span className="font-bold text-xl">Two Curious Minds</span>
        </Link>

        <div className="flex items-center space-x-2">
          {user ? (
            <>
              <PreferencesDialog />
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={() => logoutMutation.mutate()}
              >
                <User className="h-4 w-4" />
                {user.username}
              </Button>
            </>
          ) : (
            <Link href="/auth">
              <Button variant="default" size="sm">
                Sign In
              </Button>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}