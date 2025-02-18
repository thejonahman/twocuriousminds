import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    try {
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorJson = await res.json();
        throw new Error(errorJson.message || errorJson.error || `${res.status}: ${res.statusText}`);
      }
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

  // Always ensure URL has /api prefix
  const apiUrl = url.startsWith('/api/') ? url : `/api${url}`;

  const requestHeaders: Record<string, string> = {
    Accept: "application/json",
    ...headers
  };

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

  console.log(`[API] Making ${method} request to ${apiUrl}`, {
    headers: requestHeaders,
    body: data ? (isFormData ? '(FormData)' : JSON.stringify(data)) : undefined,
  });

  try {
    const res = await fetch(apiUrl, config);
    console.log(`[API] Response from ${apiUrl}:`, {
      status: res.status,
      statusText: res.statusText,
      contentType: res.headers.get('content-type'),
      url: res.url
    });

    if (!res.ok) {
      const contentType = res.headers.get('content-type');
      let errorMessage;

      if (contentType?.includes('application/json')) {
        const errorJson = await res.json();
        errorMessage = errorJson.message || errorJson.error;
      } else {
        errorMessage = await res.text();
      }

      console.error(`[API] Error response from ${apiUrl}:`, {
        status: res.status,
        message: errorMessage
      });
    }

    return res;
  } catch (error) {
    console.error('[API] Request error:', {
      url: apiUrl,
      method,
      error
    });
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey[0] as string;
    // Always ensure URL has /api prefix
    const apiUrl = url.startsWith('/api/') ? url : `/api${url}`;

    try {
      console.log(`[Query] Fetching ${apiUrl}`);
      const res = await fetch(apiUrl, {
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        }
      });

      if (res.status === 401) {
        console.log(`[Query] 401 response for ${apiUrl}, behavior:`, unauthorizedBehavior);
        if (unauthorizedBehavior === "returnNull") {
          return null;
        }
      }

      await throwIfResNotOk(res);
      const data = await res.json();
      console.log(`[Query] Success response from ${apiUrl}:`, {
        status: res.status,
        dataType: typeof data
      });
      return data;
    } catch (error) {
      console.error(`[Query] Error for ${apiUrl}:`, error);
      throw error;
    }
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