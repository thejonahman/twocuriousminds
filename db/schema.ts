import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";

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

export const recommendationPreferences = pgTable("recommendation_preferences", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  preferredCategories: jsonb("preferred_categories").$type<number[]>().default([]),
  preferredPlatforms: jsonb("preferred_platforms").$type<string[]>().default([]),
  excludedCategories: jsonb("excluded_categories").$type<number[]>().default([]),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Define relations
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
export const insertVideoSchema = createInsertSchema(videos);
export const selectVideoSchema = createSelectSchema(videos);
export const insertCategorySchema = createInsertSchema(categories);
export const selectCategorySchema = createSelectSchema(categories);
export const insertSubcategorySchema = createInsertSchema(subcategories);
export const selectSubcategorySchema = createSelectSchema(subcategories);
export const insertRecommendationPreferencesSchema = createInsertSchema(recommendationPreferences);
export const selectRecommendationPreferencesSchema = createSelectSchema(recommendationPreferences);