import { z } from "zod";

// Define subcategory schema separately for reuse
export const subcategorySchema = z.object({
  id: z.number(),
  name: z.string(),
  displayOrder: z.number().optional(),
});

// Define category schema separately for reuse
export const categorySchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  displayOrder: z.number().optional(),
  isDeleted: z.boolean().default(false)
});

// Main video schema with enhanced validation
export const videoSchema = z.object({
  id: z.number(),
  title: z.string().min(1, "Title is required"),
  url: z.string().url("Invalid URL format"),
  thumbnailUrl: z.string().nullable(),
  platform: z.enum(["youtube", "tiktok", "instagram"]),
  watched: z.boolean(),
  description: z.string(),
  category: categorySchema,
  subcategory: subcategorySchema.nullable(),
  categoryId: z.number(),
  customThumbnail: z.boolean(),
  subcategoryId: z.number().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  isDeleted: z.boolean().default(false)
});

// Export types inferred from schemas
export type Video = z.infer<typeof videoSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Subcategory = z.infer<typeof subcategorySchema>;

// API Response types with generics for better type safety
export type ApiResponse<T> = {
  data: T;
  error?: string;
  message?: string;
  statusCode?: number;
};

// Utility type for handling API errors
export type ApiError = {
  message: string;
  statusCode: number;
  details?: unknown;
};

// Video mutation types
export type VideoMutationData = Omit<Video, 'id' | 'watched' | 'createdAt' | 'updatedAt' | 'isDeleted'>;
export type VideoUpdateData = Partial<VideoMutationData>;

// Type for organizing videos by category
export interface CategoryData {
  name: string;
  subcategories: Record<string, {
    name: string;
    videos: Video[];
    displayOrder?: number;
  }>;
}

export type VideosByCategory = Record<string, CategoryData>;

// Type guard functions for runtime type checking
export const isVideo = (value: unknown): value is Video => {
  try {
    videoSchema.parse(value);
    return true;
  } catch {
    return false;
  }
};

export const isApiError = (error: unknown): error is ApiError => {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    'statusCode' in error
  );
};

// Pagination types for API responses
export interface PaginatedResponse<T> extends ApiResponse<T> {
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

// Group and user related types
export interface GroupMember {
  id: number;
  username: string;
  userId: number;
}

export interface DiscussionGroup {
  id: number;
  name: string;
  inviteCode: string;
  videoId: number | null;
  members: GroupMember[];
}

export const discussionGroupSchema = z.object({
  id: z.number(),
  name: z.string(),
  inviteCode: z.string(),
  videoId: z.number().nullable(),
  members: z.array(z.object({
    id: z.number(),
    username: z.string(),
    userId: z.number(),
  }))
});