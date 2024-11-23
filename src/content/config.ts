import { z, defineCollection } from "astro:content";

const blogCollection = defineCollection({
    type: "content",
    schema: z.object({
        title: z.string(),
        author: z.string(),
        summary: z.string(),
        date: z.string(),
        image: z.string(),
    }),
});

export const collections = {
    blog: blogCollection,
};
