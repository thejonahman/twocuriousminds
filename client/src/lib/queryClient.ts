import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    try {
      // First try to get JSON error
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorJson = await res.json();
        throw new Error(errorJson.message || `${res.status}: ${res.statusText}`);
      }
      // Fallback to text error
      const text = (await res.text()) || res.statusText;
      throw new Error(`${res.status}: ${text}`);
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error(`${res.status}: ${res.statusText}`);
    }
  }
}

interface ApiRequestOptions {
  headers?: Record<string, string>;
  isFormData?: boolean;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
  options: ApiRequestOptions = {}
): Promise<Response> {
  const { headers = {}, isFormData = false } = options;

  const requestHeaders: Record<string, string> = {
    Accept: "application/json",
    ...headers
  };

  // Only set Content-Type for non-FormData requests
  if (!isFormData && data) {
    requestHeaders["Content-Type"] = "application/json";
  }

  const config: RequestInit = {
    method,
    headers: requestHeaders,
    credentials: "include",
  };

  if (data) {
    config.body = isFormData ? data as FormData : JSON.stringify(data);
  }

  console.log(`Making ${method} request to ${url}`, { headers: requestHeaders, isFormData });

  const res = await fetch(url, config);
  console.log(`Response status: ${res.status}`);

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 0,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});