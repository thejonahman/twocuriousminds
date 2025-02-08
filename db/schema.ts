import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull(),
  password: text("password").notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userPreferences = pgTable("user_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  preferredCategories: jsonb("preferred_categories").$type<number[]>().default([]),
  preferredPlatforms: jsonb("preferred_platforms").$type<string[]>().default([]),
  excludedCategories: jsonb("excluded_categories").$type<number[]>().default([]),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  isDeleted: boolean("is_deleted").default(false).notNull(),
  displayOrder: integer("display_order").default(0),
});

export const subcategories = pgTable("subcategories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  categoryId: integer("category_id").notNull().references(() => categories.id),
  displayOrder: integer("display_order").default(0),
  isDeleted: boolean("is_deleted").default(false).notNull(),
});

export const videos = pgTable("videos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  description: text("description"),
  categoryId: integer("category_id").notNull().references(() => categories.id),
  subcategoryId: integer("subcategory_id").references(() => subcategories.id),
  platform: text("platform").notNull(),
  watched: boolean("watched").default(false),
  isDeleted: boolean("is_deleted").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const discussionGroups = pgTable("discussion_groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  videoId: integer("video_id").references(() => videos.id),
  creatorId: integer("creator_id").notNull().references(() => users.id),
  isPrivate: boolean("is_private").default(true).notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const groupMembers = pgTable("group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => discussionGroups.id),
  userId: integer("user_id").notNull().references(() => users.id),
  role: text("role").notNull().default("member"),
  notificationsEnabled: boolean("notifications_enabled").default(true),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const groupMessages = pgTable("group_messages", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => discussionGroups.id),
  userId: integer("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const userNotifications = pgTable("user_notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  groupId: integer("group_id").notNull().references(() => discussionGroups.id),
  messageId: integer("message_id").references(() => groupMessages.id),
  type: text("type").notNull(),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userRelations = relations(users, ({ many }) => ({
  preferences: many(userPreferences),
  createdGroups: many(discussionGroups, { relationName: "creator" }),
  groupMemberships: many(groupMembers),
  groupMessages: many(groupMessages),
  notifications: many(userNotifications),
}));

export const discussionGroupRelations = relations(discussionGroups, ({ one, many }) => ({
  creator: one(users, {
    fields: [discussionGroups.creatorId],
    references: [users.id],
  }),
  video: one(videos, {
    fields: [discussionGroups.videoId],
    references: [videos.id],
  }),
  members: many(groupMembers),
  messages: many(groupMessages),
}));

export const groupMemberRelations = relations(groupMembers, ({ one }) => ({
  user: one(users, {
    fields: [groupMembers.userId],
    references: [users.id],
  }),
  group: one(discussionGroups, {
    fields: [groupMembers.groupId],
    references: [discussionGroups.id],
  }),
}));

export const videoRelations = relations(videos, ({ one }) => ({
  category: one(categories, {
    fields: [videos.categoryId],
    references: [categories.id],
  }),
  subcategory: one(subcategories, {
    fields: [videos.subcategoryId],
    references: [subcategories.id],
  }),
}));

export const categoryRelations = relations(categories, ({ many }) => ({
  videos: many(videos),
  subcategories: many(subcategories),
}));

export const subcategoryRelations = relations(subcategories, ({ one, many }) => ({
  category: one(categories, {
    fields: [subcategories.categoryId],
    references: [categories.id],
  }),
  videos: many(videos),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userPreferences.userId],
    references: [users.id],
  }),
}));


export const insertUserSchema = createInsertSchema(users, {
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(8),
  isAdmin: z.boolean().default(false),
});

export const selectUserSchema = createSelectSchema(users, {
  password: z.string().optional(),
});

export type SelectUser = z.infer<typeof selectUserSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;

export const insertUserPreferencesSchema = createInsertSchema(userPreferences);
export const selectUserPreferencesSchema = createSelectSchema(userPreferences);

export const insertDiscussionGroupSchema = createInsertSchema(discussionGroups, {
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  isPrivate: z.boolean().default(true),
});

export const insertGroupMemberSchema = createInsertSchema(groupMembers, {
  role: z.enum(["admin", "member"]).default("member"),
  notificationsEnabled: z.boolean().default(true),
});

export const insertGroupMessageSchema = createInsertSchema(groupMessages, {
  content: z.string().min(1, "Message content is required"),
});

export const insertUserNotificationSchema = createInsertSchema(userNotifications, {
  type: z.enum(["new_message", "group_invite"]),
});

export type InsertDiscussionGroup = z.infer<typeof insertDiscussionGroupSchema>;
export type InsertGroupMember = z.infer<typeof insertGroupMemberSchema>;
export type InsertGroupMessage = z.infer<typeof insertGroupMessageSchema>;
export type InsertUserNotification = z.infer<typeof insertUserNotificationSchema>;