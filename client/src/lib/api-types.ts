import { z } from "zod";

// Base schemas for common fields
const baseEntitySchema = z.object({
  id: z.number(),
  createdAt: z.string().datetime(),
});

// Message schemas
export const messageSchema = baseEntitySchema.extend({
  content: z.string(),
  userId: z.number(),
  user: z.object({
    username: z.string(),
  }),
});

export const videoMessageSchema = messageSchema.extend({
  videoId: z.number(),
});

export const groupMessageSchema = messageSchema.extend({
  groupId: z.number(),
});

// Group schemas
export const groupSchema = baseEntitySchema.extend({
  name: z.string(),
  description: z.string().nullable(),
  videoId: z.number().nullable(),
  creatorId: z.number(),
  isPrivate: z.boolean(),
  inviteCode: z.string(),
});

// WebSocket message schemas
export const wsMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("new_message"),
    data: videoMessageSchema,
  }),
  z.object({
    type: z.literal("new_group_message"),
    data: groupMessageSchema,
  }),
  z.object({
    type: z.literal("group_created"),
    data: groupSchema,
  }),
  z.object({
    type: z.literal("group_joined"),
    data: groupSchema,
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
  }),
]);

// API response types
export type Message = z.infer<typeof messageSchema>;
export type VideoMessage = z.infer<typeof videoMessageSchema>;
export type GroupMessage = z.infer<typeof groupMessageSchema>;
export type Group = z.infer<typeof groupSchema>;
export type WSMessage = z.infer<typeof wsMessageSchema>;

// Utility function to validate API responses
export function validateApiResponse<T>(schema: z.ZodType<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    console.error('API Response validation error:', error);
    throw new Error('Invalid API response format');
  }
}
