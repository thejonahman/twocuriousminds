import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalizes URLs by removing duplicate slashes and ensuring proper formatting
 * @param url - The URL to normalize
 * @returns Normalized URL string
 */
export function normalizeUrl(url: string): string {
  // If it's an absolute URL with protocol, preserve the double slash after protocol
  if (url.includes('://')) {
    const [protocol, rest] = url.split('://')
    return `${protocol}://${rest.replace(/\/+/g, '/')}`
  }

  // For relative URLs, simply replace multiple slashes with single slash
  return url.replace(/\/+/g, '/')
}