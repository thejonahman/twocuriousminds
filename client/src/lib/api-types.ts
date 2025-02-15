import { z } from "zod";

// Base schemas for common fields
const baseEntitySchema = z.object({
  id: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
});

// User schema for group members
export const groupMemberSchema = z.object({
  id: z.number(),
  username: z.string(),
  userId: z.number(),
});

// User schema for messages
const messageUserSchema = z.object({
  id: z.number(),
  username: z.string(),
});

// Message schemas with strict typing
export const messageSchema = baseEntitySchema.extend({
  content: z.string(),
  userId: z.number(),
  user: messageUserSchema,
});

export const videoMessageSchema = messageSchema.extend({
  videoId: z.number(),
});

export const groupMessageSchema = messageSchema.extend({
  groupId: z.number(),
});

// Group schemas
export const discussionGroupSchema = baseEntitySchema.extend({
  name: z.string(),
  description: z.string().nullable(),
  videoId: z.number().nullable(),
  inviteCode: z.string(),
  creatorId: z.number(),
  isPrivate: z.boolean(),
  members: z.array(groupMemberSchema),
  messages: z.array(groupMessageSchema).optional(),
});

// Types exported from schemas
export type Message = z.infer<typeof messageSchema>;
export type VideoMessage = z.infer<typeof videoMessageSchema>;
export type GroupMessage = z.infer<typeof groupMessageSchema>;
export type GroupMember = z.infer<typeof groupMemberSchema>;
export type DiscussionGroup = z.infer<typeof discussionGroupSchema>;

// Input message schemas (for sending to WebSocket)
export const wsInputMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message"),
    videoId: z.number(),
    content: z.string(),
  }),
  z.object({
    type: z.literal("group_message"),
    groupId: z.number(),
    content: z.string(),
  }),
  z.object({
    type: z.literal("create_group"),
    name: z.string(),
    videoId: z.number(),
    description: z.string().optional(),
  }),
]);

// WebSocket response message schemas
export const wsMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("connected"),
    message: z.string(),
  }),
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
    data: discussionGroupSchema,
  }),
  z.object({
    type: z.literal("group_joined"),
    data: discussionGroupSchema,
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
  }),
]);

export type WSMessage = z.infer<typeof wsMessageSchema>;
export type WSInputMessage = z.infer<typeof wsInputMessageSchema>;

// Utility function to validate API responses
export function validateApiResponse<T>(schema: z.ZodType<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    console.error('API Response validation error:', error);
    throw new Error('Invalid API response format');
  }
}

// Utility function to validate WebSocket input messages
export function validateWSInput(data: unknown): WSInputMessage {
  try {
    return wsInputMessageSchema.parse(data);
  } catch (error) {
    console.error('WebSocket input validation error:', error);
    throw new Error('Invalid WebSocket message format');
  }
}

// Utility function to validate WebSocket output messages
export function validateWSOutput(data: unknown): WSMessage {
  try {
    return wsMessageSchema.parse(data);
  } catch (error) {
    console.error('WebSocket output validation error:', error);
    throw new Error('Invalid WebSocket message format');
  }
}