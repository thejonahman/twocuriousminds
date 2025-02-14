import { useAuth } from '@/hooks/use-auth';

export function useUser() {
  const { user, isLoading, error } = useAuth();
  
  return {
    user,
    isLoading,
    error,
    isAuthenticated: !!user,
  };
}
