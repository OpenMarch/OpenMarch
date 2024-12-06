// @ts-check
import { defineConfig } from "astro/config";

import react from "@astrojs/react";

import tailwind from "@astrojs/tailwind";

import mdx from "@astrojs/mdx";

import sitemap from "@astrojs/sitemap";

import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
    integrations: [
        react(),
        tailwind({applyBaseStyles: false}),
        starlight({
            title: "OpenMarch",
            logo: {
                light: "./public/openmarch-black.svg",
                dark: "./public/openmarch-white.svg",
                replacesTitle: true,
            },
            social: {
                discord: "https://discord.gg/eTsQ98uZzq",
                github: "https://github.com/OpenMarch/OpenMarch",
                patreon: "https://www.patreon.com/c/openmarch",
                youtube: "https://www.youtube.com/@OpenMarchApp",
            },
            editLink: {
                baseUrl: "https://github.com/OpenMarch/website/tree/main/",
            },
            disable404Route: true,
            favicon: "./public/favicon.png",
            customCss: [
                "@fontsource/dm-sans/400.css",
                "@fontsource/dm-sans/600.css",
                "@fontsource/dm-mono/400.css",
                "./src/styles/starlight.css",
            ],
            sidebar: [
                {
                    label: "Guides",
                    autogenerate: { directory: "guides" },
                },
            ],
        }),
        mdx(),
        sitemap(),
    ],
    site: "https://openmarch.com",
    devToolbar: {
        enabled: false,
    },
});
