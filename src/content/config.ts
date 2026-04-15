import { defineCollection, z } from "astro:content";

const activities = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    date: z.date(),
    author: z.string().optional(),
    tags: z.array(z.string()).default([]),
    description: z.string().optional(),
    thumbnail: z.string().optional(),
  }),
});

export const collections = { activities };
