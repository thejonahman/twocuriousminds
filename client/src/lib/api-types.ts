import { z } from "zod";

// Base schemas for common fields
const baseEntitySchema = z.object({
  id: z.number(),
  createdAt: z.string().datetime().nullish(),
});

// User schema for group members
const userSchema = z.object({
  id: z.number(),
  username: z.string(),
});

// Video schema for group reference
const videoSchema = z.object({
  id: z.number(),
  title: z.string(),
  url: z.string(),
  platform: z.string(),
});

// Message schemas 
export const messageSchema = baseEntitySchema.extend({
  content: z.string(),
  userId: z.number(),
  groupId: z.number(),
  user: z.object({
    username: z.string()
  }),
  updatedAt: z.string().datetime().nullish(),
});

// Group member schema with role validation
export const groupMemberSchema = z.object({
  id: z.number(),
  userId: z.number(),
  groupId: z.number(),
  role: z.enum(["admin", "member"]).default("admin"),
  joinedAt: z.string().datetime().nullish(),
  lastReadAt: z.string().datetime().nullish(),
  user: z.object({
    username: z.string()
  })
});

// Group schema
export const groupSchema = baseEntitySchema.extend({
  name: z.string(),
  description: z.string().nullable(),
  videoId: z.number(),
  creatorId: z.number(),
  isPrivate: z.boolean(),
  inviteCode: z.string(),
  members: z.array(groupMemberSchema).optional(),
  video: videoSchema.optional(),
  updatedAt: z.string().datetime().nullish(),
});

// Last active group schema
export const lastActiveGroupSchema = groupSchema.pick({
  id: true,
  name: true,
  videoId: true,
  updatedAt: true,
});

// API response types
export type Message = z.infer<typeof messageSchema>;
export type Group = z.infer<typeof groupSchema>;
export type GroupMember = z.infer<typeof groupMemberSchema>;
export type LastActiveGroup = z.infer<typeof lastActiveGroupSchema>;

// Utility function to validate API responses
export function validateApiResponse<T>(schema: z.ZodType<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    console.error('API Response validation error:', error);
    throw new Error('Invalid API response format');
  }
}