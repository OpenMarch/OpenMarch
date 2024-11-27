import { z, defineCollection } from "astro:content";

const blog = defineCollection({
    type: "content",
    schema: z.object({
        title: z.string(),
        author: z.string(),
        summary: z.string(),
        date: z.string(),
        image: z.string(),
    }),
});

const docs = defineCollection({
    type: "content",
    schema: z.object({
        title: z.string(),
        directory: z.boolean().optional(),
        defaultOpen: z.boolean().optional(),
    }),
});

export const collections = {
    blog: blog,
    docs: docs,
};
