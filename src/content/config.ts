import { z, defineCollection } from "astro:content";
import { docsSchema } from "@astrojs/starlight/schema";

export const collections = {
    blog: defineCollection({
        type: "content",
        schema: z.object({
            title: z.string(),
            author: z.string(),
            date: z.date(),
            image: z.string(),
        }),
    }),
    docs: defineCollection({ schema: docsSchema() }),
};
