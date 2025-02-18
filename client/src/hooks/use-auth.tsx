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
  login: (username: string, password: string) => Promise<void>;
  loginMutation: any;
  logoutMutation: any;
  registerMutation: any;
}

interface LoginData {
  username: string;
  password: string;
}

interface RegisterData extends LoginData {
  email: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // Use the full API path for the auth endpoint
  const { data: userData, isLoading } = useQuery<User>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const user = userData || null;

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      console.log('[Auth] Attempting login with:', { username: credentials.username });
      try {
        // Use full API path for login
        const res = await apiRequest("POST", "/api/auth/login", credentials);
        if (!res.ok) {
          const contentType = res.headers.get('content-type');
          let errorMessage;

          if (contentType?.includes('application/json')) {
            const errorData = await res.json();
            errorMessage = errorData.message || errorData.error;
          } else {
            errorMessage = await res.text();
          }

          console.error('[Auth] Login failed:', errorMessage);
          throw new Error(errorMessage || 'Login failed');
        }

        const data = await res.json();
        console.log('[Auth] Login successful:', data);
        return data;
      } catch (error) {
        console.error('[Auth] Login error:', error);
        throw error;
      }
    },
    onSuccess: (user: User) => {
      queryClient.setQueryData(["/api/auth/me"], user);
      toast({
        title: "Welcome back!",
        description: `Logged in as ${user.username}`,
      });
    },
    onError: (error: Error) => {
      console.error('[Auth] Login mutation error:', error);
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
      try {
        // Use full API path for registration
        const res = await apiRequest("POST", "/api/auth/register", newUser);
        if (!res.ok) {
          const contentType = res.headers.get('content-type');
          let errorMessage;

          if (contentType?.includes('application/json')) {
            const errorData = await res.json();
            errorMessage = errorData.message || errorData.error;
          } else {
            errorMessage = await res.text();
          }

          console.error('[Auth] Registration failed:', errorMessage);
          throw new Error(errorMessage || 'Registration failed');
        }

        const data = await res.json();
        console.log('[Auth] Registration successful:', data);
        return data;
      } catch (error) {
        console.error('[Auth] Registration error:', error);
        throw error;
      }
    },
    onSuccess: (user: User) => {
      queryClient.setQueryData(["/api/auth/me"], user);
      toast({
        title: "Welcome!",
        description: "Your account has been created successfully.",
      });
    },
    onError: (error: Error) => {
      console.error('[Auth] Registration mutation error:', error);
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      try {
        // Use full API path for logout
        const res = await apiRequest("POST", "/api/auth/logout");
        if (!res.ok) {
          const error = await res.text();
          console.error('[Auth] Logout failed:', error);
          throw new Error(error || 'Logout failed');
        }
      } catch (error) {
        console.error('[Auth] Logout error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.clear();
      toast({
        title: "Logged out",
        description: "See you next time!",
      });
    },
    onError: (error: Error) => {
      console.error('[Auth] Logout mutation error:', error);
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const login = async (username: string, password: string) => {
    try {
      console.log('[Auth] Starting login process for:', username);
      await loginMutation.mutateAsync({ username, password });

      const pendingInvite = sessionStorage.getItem('pendingInvite');
      if (pendingInvite) {
        try {
          const { inviteCode, videoId } = JSON.parse(pendingInvite);
          console.log('[Auth] Found pending invite:', { inviteCode, videoId });
          sessionStorage.removeItem('pendingInvite');

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

      console.log('[Auth] No pending invite, navigating to home');
      setLocation("/");
    } catch (error) {
      console.error('[Auth] Login process error:', error);
      throw error;
    }
  };

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