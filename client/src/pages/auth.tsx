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

  useEffect(() => {
    if (user) {
      navigate("/profile/wizard");
    }
  }, [user, navigate]);

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
      // Error is handled by the mutation callbacks
    }
  };

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
              ? "Ready to see yourself clearly? Sign in to continue your journey."
              : "Ready to see yourself clearly? Create an account to start your journey."}
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
        <h2 className="text-3xl font-bold">Two Curious Minds</h2>
        <p className="text-muted-foreground">
          Ready to see yourself clearly? Join us on a journey of self-discovery and personal growth.
        </p>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Features</h3>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>Personalized content recommendations</li>
            <li>Multi-platform content discovery</li>
            <li>Smart learning paths</li>
            <li>Content preferences management</li>
          </ul>
        </div>
      </div>
    </div>
  );
}