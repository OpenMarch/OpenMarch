import { z, defineCollection } from "astro:content";
import { docsSchema } from "@astrojs/starlight/schema";
import { docsLoader } from "@astrojs/starlight/loaders";
import { glob } from "astro/loaders";

export const collections = {
    blog: defineCollection({
        loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
        schema: ({ image }) =>
            z.object({
                title: z.string(),
                author: z.string(),
                date: z.date(),
                image: image(),
            }),
    }),
    docs: defineCollection({
        loader: docsLoader(),
        schema: docsSchema(),
    }),
};
