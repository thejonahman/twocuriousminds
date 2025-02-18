import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

export function useAuth() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<{
    id: number;
    username: string;
    email: string;
    isAdmin?: boolean;
  }>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep unused data for 10 minutes
  });

  const login = async (email: string, password: string) => {
    try {
      console.log('[Auth] Attempting login for:', email);

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('[Auth] Login failed:', errorData);
        throw new Error("Login failed");
      }

      // Invalidate auth query to refresh user data
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });

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

  return { user, login, isLoading };
}