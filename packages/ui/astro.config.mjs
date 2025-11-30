// @ts-check
import { defineConfig } from "astro/config";

import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@astrojs/mdx";

// https://astro.build/config
export default defineConfig({
    output: "static",
    integrations: [react(), mdx()],

    // Configure for Cloudflare Pages deployment
    build: {
        inlineStylesheets: "auto",
    },

    vite: {
        plugins: [tailwindcss()],
        build: {
            // Ensure assets are properly handled
            assetsInlineLimit: 0,
        },
    },
});
