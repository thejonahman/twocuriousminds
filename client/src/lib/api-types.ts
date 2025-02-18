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

// Group member schema with isDeleted flag
export const groupMemberSchema = z.object({
  id: z.number(),
  userId: z.number(),
  groupId: z.number(),
  role: z.string(),
  joinedAt: z.string().datetime().nullish(),
  lastReadAt: z.string().datetime().nullish(),
  isDeleted: z.boolean().default(false),
  user: z.object({
    username: z.string()
  })
});

// Group schema with isDeleted flag
export const groupSchema = baseEntitySchema.extend({
  name: z.string(),
  description: z.string().nullable(),
  videoId: z.number(),
  creatorId: z.number(),
  isPrivate: z.boolean(),
  inviteCode: z.string(),
  isDeleted: z.boolean().default(false),
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
  isDeleted: true,
});

// API response types
export type Message = z.infer<typeof messageSchema>;
export type Group = z.infer<typeof groupSchema>;
export type GroupMember = z.infer<typeof groupMemberSchema>;
export type LastActiveGroup = z.infer<typeof lastActiveGroupSchema>;

// Utility function to validate API responses with enhanced error logging
export function validateApiResponse<T>(schema: z.ZodType<T>, data: unknown): T {
  try {
    console.log('[API Validation] Validating response:', {
      schema: schema._def.typeName,
      hasData: !!data,
      timestamp: new Date().toISOString()
    });

    const result = schema.parse(data);

    console.log('[API Validation] Validation successful:', {
      schema: schema._def.typeName,
      resultType: typeof result,
      timestamp: new Date().toISOString()
    });

    return result;
  } catch (error) {
    console.error('[API Validation] Validation error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      schema: schema._def.typeName,
      data: JSON.stringify(data).slice(0, 200) + '...',
      timestamp: new Date().toISOString()
    });
    throw new Error('Invalid API response format');
  }
}