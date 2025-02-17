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

// Group member schema
export const groupMemberSchema = z.object({
  id: z.number(),
  userId: z.number(),
  groupId: z.number(),
  role: z.string(),
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
});

// API response types
export type Message = z.infer<typeof messageSchema>;
export type Group = z.infer<typeof groupSchema>;
export type GroupMember = z.infer<typeof groupMemberSchema>;

// Utility function to validate API responses
export function validateApiResponse<T>(schema: z.ZodType<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    console.error('API Response validation error:', error);
    throw new Error('Invalid API response format');
  }
}