import { z } from "zod";

export const videoSchema = z.object({
  id: z.number(),
  title: z.string(),
  url: z.string(),
  thumbnailUrl: z.string().nullable(),
  platform: z.string(),
  watched: z.boolean(),
  description: z.string(),
  category: z.object({
    id: z.number(),
    name: z.string()
  }),
  subcategory: z.object({
    id: z.number(),
    name: z.string(),
    displayOrder: z.number().optional()
  }).nullable(),
  categoryId: z.number(),
  subcategoryId: z.number().optional()
});

export type Video = z.infer<typeof videoSchema>;
