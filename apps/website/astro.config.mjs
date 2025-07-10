// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import starlight from "@astrojs/starlight";
import yeskunallumami from "@yeskunall/astro-umami";
import starlightImageZoom from "starlight-image-zoom";

import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
    redirects: {
        "/alexdumo": "/about/alexdumo",
        "/developers/contributing": "/developers/codebase",
    },
    integrations: [
        react(),
        starlight({
            plugins: [starlightImageZoom()],
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
                baseUrl:
                    "https://github.com/OpenMarch/OpenMarch/tree/main/apps/website/",
            },
            disable404Route: true,
            favicon: "./public/favicon.png",
            customCss: [
                "@fontsource/dm-sans/400.css",
                "@fontsource/dm-sans/600.css",
                "@fontsource/dm-mono/400.css",
                "./src/styles/starlight.css",
                "./src/styles/base.css",
            ],
            sidebar: [
                {
                    label: "Guides",
                    autogenerate: { directory: "guides" },
                },
                {
                    label: "About",
                    autogenerate: { directory: "about" },
                },
                {
                    label: "Developers",
                    autogenerate: { directory: "developers" },
                },
            ],
        }),
        mdx(),
        sitemap(),
        yeskunallumami({
            id: "09a72d11-c8dd-43b0-9ee8-e2c7c492bc21",
            endpointUrl: "https://umami.cool.korhq.com",
        }),
    ],

    site: "https://openmarch.com",

    devToolbar: {
        enabled: false,
    },

    vite: {
        plugins: [tailwindcss()],
    },
});
