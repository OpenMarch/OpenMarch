import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import starlight from "@astrojs/starlight";
import yeskunallumami from "@yeskunall/astro-umami";
import starlightImageZoom from "starlight-image-zoom";

import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";

/**
 * Which site this build is. "stable" is openmarch.com. "preview" is
 * preview.openmarch.com, built from a `prerelease/*` branch with the web
 * editor under /editor/ (see preview/README.md): its downloads point at the
 * matching pre-release, and it has no analytics.
 */
const siteChannel = process.env.SITE_CHANNEL ?? "stable";
const isPreview = siteChannel === "preview";
const desktopVersion = JSON.parse(
    readFileSync(new URL("../desktop/package.json", import.meta.url), "utf8"),
).version;
/** On the preview site, the release list shows pre-releases of this version. */
const prereleaseTagPrefix = `v${desktopVersion.split(".").slice(0, 2).join(".")}.`;
const downloadUrl = isPreview
    ? `https://github.com/OpenMarch/OpenMarch/releases/download/v${desktopVersion}`
    : "https://github.com/OpenMarch/OpenMarch/releases/latest/download";

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
                "@fontsource/dm-sans/500.css",
                "@fontsource/dm-sans/600.css",
                "@fontsource/dm-sans/700.css",
                "@fontsource/dm-mono/400.css",
                "@fontsource/dm-mono/500.css",
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
                    label: "On The Move",
                    items: [{ autogenerate: { directory: "otm" } }],
                },
                {
                    label: "Developers",
                    items: [{ autogenerate: { directory: "developers" } }],
                },
            ],
        }),
        mdx(),
        sitemap(),
        ...(isPreview
            ? []
            : [
                  yeskunallumami({
                      id: "ca4e77b2-a0e0-4b5a-8ac9-1e629dc8fe42",
                      endpointUrl: "https://umami.openmarch.com",
                  }),
              ]),
    ],

    site: isPreview ? "https://preview.openmarch.com" : "https://openmarch.com",

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
        define: {
            "import.meta.env.PUBLIC_SITE_CHANNEL": JSON.stringify(siteChannel),
            "import.meta.env.PUBLIC_DOWNLOAD_URL": JSON.stringify(downloadUrl),
            "import.meta.env.PUBLIC_PRERELEASE_TAG_PREFIX":
                JSON.stringify(prereleaseTagPrefix),
        },
    },
});
