import { ReactNode, createContext, useContext, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

interface User {
  id: number;
  username: string;
  email: string;
  isAdmin?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  login: (email: string, password: string) => Promise<void>;
  loginMutation: any;
  logoutMutation: any;
  registerMutation: any;
}

interface LoginData {
  email: string;
  password: string;
}

interface RegisterData extends LoginData {
  username: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: userData, isLoading } = useQuery<User>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep unused data for 10 minutes
  });

  // Ensure user is properly typed as User | null
  const user = userData || null;

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      console.log('[Auth] Attempting login for:', credentials.email);
      const res = await apiRequest("POST", "/api/auth/login", credentials);
      if (!res.ok) {
        const error = await res.text();
        console.error('[Auth] Login failed:', error);
        throw new Error(error || 'Login failed');
      }
      return res.json();
    },
    onSuccess: (user: User) => {
      console.log('[Auth] Login successful:', user);
      queryClient.setQueryData(["/api/auth/me"], user);
      toast({
        title: "Welcome back!",
        description: `Logged in as ${user.username}`,
      });
    },
    onError: (error: Error) => {
      console.error('[Auth] Login error:', error);
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (newUser: RegisterData) => {
      console.log('[Auth] Attempting registration:', { username: newUser.username });
      const res = await apiRequest("POST", "/api/auth/register", newUser);
      if (!res.ok) {
        const error = await res.text();
        console.error('[Auth] Registration failed:', error);
        throw new Error(error || 'Registration failed');
      }
      return res.json();
    },
    onSuccess: (user: User) => {
      console.log('[Auth] Registration successful:', user);
      queryClient.setQueryData(["/api/auth/me"], user);
      toast({
        title: "Welcome!",
        description: "Your account has been created successfully.",
      });
    },
    onError: (error: Error) => {
      console.error('[Auth] Registration error:', error);
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/logout");
      if (!res.ok) {
        throw new Error('Logout failed');
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.clear(); // Clear all queries on logout
      toast({
        title: "Logged out",
        description: "See you next time!",
      });
    },
    onError: (error: Error) => {
      console.error('[Auth] Logout error:', error);
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const login = async (email: string, password: string) => {
    try {
      await loginMutation.mutateAsync({ email, password });

      // Check for pending invite after successful login
      const pendingInvite = sessionStorage.getItem('pendingInvite');
      if (pendingInvite) {
        try {
          const { inviteCode, videoId } = JSON.parse(pendingInvite);
          console.log('[Auth] Found pending invite:', { inviteCode, videoId });
          sessionStorage.removeItem('pendingInvite');

          // Ensure we have both required parameters before redirecting
          if (inviteCode && videoId) {
            const joinUrl = `/join-group/${inviteCode}?videoId=${videoId}`;
            console.log('[Auth] Redirecting to pending invite:', joinUrl);
            setLocation(joinUrl);
            return;
          } else {
            console.error('[Auth] Invalid pending invite data:', { inviteCode, videoId });
          }
        } catch (error) {
          console.error('[Auth] Error processing pending invite:', error);
          sessionStorage.removeItem('pendingInvite');
        }
      }

      // Default navigation if no pending invite or if invite processing fails
      console.log('[Auth] No pending invite, navigating to home');
      setLocation("/");
    } catch (error) {
      console.error('[Auth] Login error:', error);
      throw error;
    }
  };

  // Clear stored navigation data on unmount
  useEffect(() => {
    return () => {
      sessionStorage.removeItem('pendingInvite');
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        error: null,
        login,
        loginMutation,
        logoutMutation,
        registerMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}