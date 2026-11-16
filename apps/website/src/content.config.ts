import { defineCollection } from "astro:content";
import { z } from "astro/zod";
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
        // The user guide's own fields (docs/conventions/user-docs.md): the kind of page, and
        // what in the app it describes, so a change to that code can find the pages to check.
        schema: docsSchema({
            extend: z.object({
                type: z
                    .enum(["tutorial", "how-to", "concept", "reference"])
                    .optional(),
                covers: z.array(z.string()).optional(),
            }),
        }),
    }),
    legal: defineCollection({
        loader: glob({
            pattern: "{privacy,terms,refunds}/index.md",
            base: "./src/content",
        }),
        schema: z.object({
            title: z.string(),
            description: z.string().optional(),
            lastUpdated: z.string(),
        }),
    }),
};
