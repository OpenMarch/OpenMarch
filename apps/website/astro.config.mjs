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
        "/about/submitting-feedback/": "/guides/submitting-feedback/",
        "/privacy": "/legal/privacy",
        "/refunds": "/legal/refunds",
        "/terms": "/legal/terms",
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
            social: [
                {
                    icon: "discord",
                    label: "Discord",
                    href: "https://discord.gg/eTsQ98uZzq",
                },
                {
                    icon: "github",
                    label: "GitHub",
                    href: "https://github.com/OpenMarch/OpenMarch",
                },
                {
                    icon: "patreon",
                    label: "Patreon",
                    href: "https://www.patreon.com/c/openmarch",
                },
                {
                    icon: "youtube",
                    label: "YouTube",
                    href: "https://www.youtube.com/@OpenMarchApp",
                },
            ],
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
            ],
            sidebar: [
                {
                    label: "Guides",
                    items: [{ autogenerate: { directory: "guides" } }],
                },
                {
                    label: "Troubleshooting",
                    items: [{ autogenerate: { directory: "troubleshooting" } }],
                },
                {
                    label: "About",
                    items: [{ autogenerate: { directory: "about" } }],
                },
                {
                    label: "Mobile",
                    autogenerate: { directory: "mobile" },
                },
                {
                    label: "Developers",
                    items: [{ autogenerate: { directory: "developers" } }],
                },
            ],
        }),
        mdx(),
        sitemap(),
        yeskunallumami({
            id: "ca4e77b2-a0e0-4b5a-8ac9-1e629dc8fe42",
            endpointUrl: "https://umami.openmarch.com",
        }),
    ],

    site: "https://openmarch.com",

    image: {
        domains: ["localhost", "cms.openmarch.com"],
        remotePatterns: [
            { protocol: "http", hostname: "localhost", pathname: "/media/**" },
            {
                protocol: "https",
                hostname: "**.openmarch.com",
                pathname: "/media/**",
            },
        ],
    },

    devToolbar: {
        enabled: false,
    },

    vite: {
        plugins: [tailwindcss()],
    },
});
