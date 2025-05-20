import { glob } from "astro/loaders";
import { defineCollection } from "astro:content";
import { PreviewSchema } from "@korhq/unpreview";

const previews = defineCollection({
    loader: glob({
        pattern: "**/*.{md,mdx,json}",
        base: "src/previews",
    }),
    schema: PreviewSchema,
});

export const collections = { previews };
