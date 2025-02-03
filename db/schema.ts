import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userPreferences = pgTable("user_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  preferredCategories: jsonb("preferred_categories").$type<number[]>().default([]),
  preferredPlatforms: jsonb("preferred_platforms").$type<string[]>().default([]),
  excludedCategories: jsonb("excluded_categories").$type<number[]>().default([]),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
});

export const subcategories = pgTable("subcategories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  categoryId: integer("category_id").references(() => categories.id),
  displayOrder: integer("display_order").default(0),
});

export const videos = pgTable("videos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  description: text("description"),
  categoryId: integer("category_id").references(() => categories.id),
  subcategoryId: integer("subcategory_id").references(() => subcategories.id),
  platform: text("platform").notNull(),
  watched: boolean("watched").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userRelations = relations(users, ({ one }) => ({
  preferences: one(userPreferences, {
    fields: [users.id],
    references: [userPreferences.userId],
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

export const subcategoryRelations = relations(subcategories, ({ one }) => ({
  category: one(categories, {
    fields: [subcategories.categoryId],
    references: [categories.id],
  }),
}));

// Create Zod schemas
export const insertUserSchema = createInsertSchema(users, {
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(8),
});

export const selectUserSchema = createSelectSchema(users, {
  password: z.string().optional(),
});

export type SelectUser = z.infer<typeof selectUserSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;

export const insertUserPreferencesSchema = createInsertSchema(userPreferences);
export const selectUserPreferencesSchema = createSelectSchema(userPreferences);