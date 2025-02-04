import { pgTable, text, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  email: text("email").notNull(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const thumbnails = pgTable("thumbnails", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  platform: varchar("platform", { length: 20 }).notNull(), // youtube, tiktok, instagram
  videoUrl: text("video_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  category: varchar("category", { length: 50 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  userId: serial("user_id").references(() => users.id),
});

export const thumbnailRelations = relations(thumbnails, ({ one }) => ({
  user: one(users, {
    fields: [thumbnails.userId],
    references: [users.id],
  }),
}));

export const userRelations = relations(users, ({ many }) => ({
  thumbnails: many(thumbnails),
}));

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertThumbnailSchema = createInsertSchema(thumbnails);
export const selectThumbnailSchema = createSelectSchema(thumbnails);

export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;
export type InsertThumbnail = typeof thumbnails.$inferInsert;
export type SelectThumbnail = typeof thumbnails.$inferSelect;