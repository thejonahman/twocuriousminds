import { ReactNode, createContext, useContext, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

export interface User {
  id: number;
  username: string;
  email: string;
  isAdmin?: boolean;
}

interface LoginData {
  username: string;
  password: string;
}

interface RegisterData extends LoginData {
  email: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  login: (username: string, password: string) => Promise<void>;
  loginMutation: ReturnType<typeof useMutation<User, Error, LoginData>>;
  logoutMutation: ReturnType<typeof useMutation<void, Error>>;
  registerMutation: ReturnType<typeof useMutation<User, Error, RegisterData>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/user"],
    retry: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const loginMutation = useMutation<User, Error, LoginData>({
    mutationFn: async (credentials) => {
      const res = await apiRequest("POST", "/api/login", credentials);
      if (!res.ok) {
        const contentType = res.headers.get('content-type');
        let errorMessage;

        if (contentType?.includes('application/json')) {
          const errorData = await res.json();
          errorMessage = errorData.message || errorData.error;
        } else {
          errorMessage = await res.text();
        }
        throw new Error(errorMessage || 'Login failed');
      }
      return res.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/user"], user);
      toast({
        title: "Welcome back!",
        description: `Logged in as ${user.username}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation<void, Error>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/logout");
      if (!res.ok) {
        throw new Error(await res.text());
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      queryClient.clear();
      toast({
        title: "Logged out",
        description: "See you next time!",
      });
    },
    onError: (error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation<User, Error, RegisterData>({
    mutationFn: async (newUser) => {
      const res = await apiRequest("POST", "/api/register", newUser);
      if (!res.ok) {
        const contentType = res.headers.get('content-type');
        let errorMessage;

        if (contentType?.includes('application/json')) {
          const errorData = await res.json();
          errorMessage = errorData.message || errorData.error;
        } else {
          errorMessage = await res.text();
        }
        throw new Error(errorMessage || 'Registration failed');
      }
      return res.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/user"], user);
      toast({
        title: "Welcome!",
        description: "Your account has been created successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const login = async (username: string, password: string): Promise<void> => {
    try {
      await loginMutation.mutateAsync({ username, password });

      const pendingInvite = sessionStorage.getItem('pendingInvite');
      if (pendingInvite) {
        try {
          const { inviteCode, videoId } = JSON.parse(pendingInvite);
          sessionStorage.removeItem('pendingInvite');

          if (inviteCode && videoId) {
            setLocation(`/join-group/${inviteCode}?videoId=${videoId}`);
            return;
          }
        } catch (error) {
          console.error('[Auth] Error processing pending invite:', error);
          sessionStorage.removeItem('pendingInvite');
        }
      }

      setLocation("/");
    } catch (error) {
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
        user: user || null,
        isLoading,
        error: null,
        login,
        loginMutation,
        logoutMutation,
        registerMutation
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