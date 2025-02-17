import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const registerSchema = loginSchema.extend({
  email: z.string().email("Invalid email address"),
});

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [, navigate] = useLocation();
  const { user, loginMutation, registerMutation } = useAuth();
  const { toast } = useToast();
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    if (!user) return;

    const joinGroup = async (inviteCode: string, videoId: string) => {
      setIsJoining(true);
      try {
        console.log('Attempting to join group:', { inviteCode, videoId });
        const response = await fetch(`/api/groups/invite/${inviteCode}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Join group error response:', errorText);
          throw new Error(errorText || 'Failed to join group');
        }

        const data = await response.json();
        console.log('Join group response:', data);

        if (!data.group?.id) {
          throw new Error('Invalid response from server: missing group ID');
        }

        // Clear any stored invite data
        sessionStorage.removeItem('pendingInvite');
        navigate(`/video/${videoId}/group/${data.group.id}`);
      } catch (error) {
        console.error('Error joining group:', error);
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Could not join the group. Please try again.",
          variant: "destructive",
        });
        navigate(`/video/${videoId}`);
      } finally {
        setIsJoining(false);
      }
    };

    // Check for pending invite after successful authentication
    const pendingInviteStr = sessionStorage.getItem('pendingInvite');
    if (pendingInviteStr) {
      try {
        const { inviteCode, videoId } = JSON.parse(pendingInviteStr);
        if (inviteCode && videoId) {
          joinGroup(inviteCode, videoId);
          return;
        }
      } catch (error) {
        console.error('Error handling pending invite:', error);
        toast({
          title: "Error",
          description: "Invalid invite link data",
          variant: "destructive",
        });
        navigate('/');
      }
    } else if (!isJoining) {
      navigate('/');
    }
  }, [user, navigate, toast, isJoining]);

  const form = useForm<LoginValues | RegisterValues>({
    resolver: zodResolver(isLogin ? loginSchema : registerSchema),
    defaultValues: {
      username: "",
      password: "",
      ...(isLogin ? {} : { email: "" }),
    },
  });

  const onSubmit = async (values: LoginValues | RegisterValues) => {
    try {
      if (isLogin) {
        await loginMutation.mutateAsync(values as LoginValues);
      } else {
        await registerMutation.mutateAsync(values as RegisterValues);
      }
    } catch (error) {
      console.error('Auth error:', error);
      toast({
        title: "Authentication Error",
        description: error instanceof Error ? error.message : "Failed to authenticate",
        variant: "destructive",
      });
    }
  };

  if (user && isJoining) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Joining discussion group...</span>
      </div>
    );
  }

  if (user) {
    return null;
  }

  return (
    <div className="grid lg:grid-cols-2 gap-8 items-center max-w-5xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>{isLogin ? "Welcome Back" : "Create Account"}</CardTitle>
          <CardDescription>
            {isLogin
              ? "Ready to join the discussion? Sign in to continue."
              : "Ready to join the discussion? Create an account to start participating."}
          </CardDescription>
        </CardHeader>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                {...form.register("username")}
              />
              {form.formState.errors.username && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.username.message}
                </p>
              )}
            </div>
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  {...form.register("email")}
                />
                {form.formState.errors.email && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button
              type="submit"
              className="w-full"
              disabled={loginMutation.isPending || registerMutation.isPending}
            >
              {(loginMutation.isPending || registerMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isLogin ? "Sign In" : "Sign Up"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setIsLogin(!isLogin)}
            >
              {isLogin
                ? "Don't have an account? Sign up"
                : "Already have an account? Sign in"}
            </Button>
          </CardFooter>
        </form>
      </Card>
      <div className="space-y-4">
        <h2 className="text-3xl font-bold">Join the Discussion</h2>
        <p className="text-muted-foreground">
          Join our community to participate in group discussions, share insights, and connect with others.
        </p>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Features</h3>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>Real-time group discussions</li>
            <li>Share discussions with friends</li>
            <li>Seamless video integration</li>
            <li>Rich media sharing</li>
          </ul>
        </div>
      </div>
    </div>
  );
}