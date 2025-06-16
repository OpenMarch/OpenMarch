import { defineCollection } from "astro:content";
import { reactPreviewLoader } from "@korhq/undocs";

const previews = defineCollection({
    loader: reactPreviewLoader({ previewsDir: "src/previews" }),
});

export const collections = { previews };
