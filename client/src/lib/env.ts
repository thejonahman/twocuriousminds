/** Safe environment variable access */
export const env = {
  MODE: import.meta.env.MODE || 'development',
  VITE_API_URL: import.meta.env.VITE_API_URL || '',
  APP_URL: import.meta.env.VITE_APP_URL || window.location.origin,
} as const;
