import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import starlight from "@astrojs/starlight";
import yeskunallumami from "@yeskunall/astro-umami";
import starlightImageZoom from "starlight-image-zoom";
import starlightLlmsTxt from "starlight-llms-txt";

import tailwindcss from "@tailwindcss/vite";
import { readFileSync, readdirSync } from "node:fs";

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

/**
 * The user guide's chapters, in the order the sidebar and the llms.txt files show them. Each is a
 * folder in src/content/docs. See apps/website/AGENTS.md before adding or moving a page.
 */
const guideChapters = [
    {
        label: "Start here",
        dir: "guides/start",
        about: "installing OpenMarch, a first show, Basic and Expert modes, and what's new in 0.2",
    },
    {
        label: "The workspace",
        dir: "guides/workspace",
        about: "the window, the Editor and Preview, and moving around the field",
    },
    {
        label: "Marchers",
        dir: "guides/marchers",
        about: "adding, selecting, moving, aligning and styling marchers",
    },
    {
        label: "Timeline",
        dir: "guides/timeline",
        about: "how pages, moves and the timeline work, and playing the show",
    },
    {
        label: "Shapes",
        dir: "guides/shapes",
        about: "drawing lines, arcs, boxes and circles and placing marchers in them",
    },
    {
        label: "Music",
        dir: "guides/music",
        about: "audio, counts, tempo, the metronome and MusicXML scores",
    },
    {
        label: "Field",
        dir: "guides/field",
        about: "the field's markings, show settings and step size warnings",
    },
    {
        label: "3D View and props",
        dir: "guides/3d-view",
        about: "the 3D View, cameras, venues, uniforms and props",
    },
    {
        label: "Files and export",
        dir: "guides/files",
        about: "saving and opening shows, printing charts, video and On the Move",
    },
    {
        label: "Reference",
        dir: "guides/reference",
        about: "the glossary, every keyboard shortcut and every setting",
    },
    {
        label: "Troubleshooting",
        dir: "troubleshooting",
        about: "file errors, known issues and repairing files",
    },
];

/** A chapter's page ids in sidebar order (`sidebar.order`, then id), for the llms.txt files. */
function chapterPageIds(dir) {
    const folder = new URL(`./src/content/docs/${dir}/`, import.meta.url);
    return readdirSync(folder)
        .filter((name) => /\.mdx?$/.test(name))
        .map((name) => {
            const order = /^\s+order:\s*(-?\d+)/m.exec(
                readFileSync(new URL(name, folder), "utf8"),
            );
            const base = name.replace(/\.mdx?$/, "");
            return {
                id: base === "index" ? dir : `${dir}/${base}`,
                order: order ? Number(order[1]) : Infinity,
            };
        })
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        .map((page) => page.id);
}

// https://astro.build/config
export default defineConfig({
    redirects: {
        "/alexdumo": "/about/alexdumo",
        "/developers/contributing": "/developers/codebase",
        "/about/submitting-feedback/": "/guides/start/get-help/",
        // The 0.1.7 guides, moved when the guide was rewritten for 0.2
        "/about/features": "/guides/",
        "/guides/getting-started": "/guides/start/first-show/",
        "/guides/navigation": "/guides/workspace/move-around-the-field/",
        "/guides/writing-drill": "/guides/shapes/",
        "/guides/configuring-your-show": "/guides/field/show-settings/",
        "/guides/exporting": "/guides/files/print-charts/",
        "/guides/step-size-warnings": "/guides/field/step-size-warnings/",
        "/guides/editing-the-grid": "/guides/field/edit-the-field/",
        "/guides/reverting": "/troubleshooting/open-in-an-older-version/",
        "/guides/repairing-database": "/troubleshooting/repair-a-file/",
        "/guides/submitting-feedback": "/guides/start/get-help/",
        // The app's Learn page links here
        "/guides/music": "/guides/music/counts-and-music/",
        "/privacy": "/legal/privacy",
        "/refunds": "/legal/refunds",
        "/terms": "/legal/terms",
    },
    integrations: [
        react(),
        starlight({
            plugins: [
                starlightImageZoom(),
                starlightLlmsTxt({
                    description:
                        "OpenMarch is free, open-source drill writing software for marching bands: you place marchers on a field, set where they go on each page of the show, and play it back with the music.",
                    details: [
                        "These files are the OpenMarch user guide, the same pages people read at openmarch.com/guides. They describe the desktop app as it is meant to behave: what each part of the window does and how to get things done with it.",
                        "",
                        "- Labels in **bold** are the app's own text, exactly as it shows them.",
                        "- Shortcuts are written in Windows and Linux keys, with the Mac keys after them: `Ctrl+Shift+Z (Mac: ⇧⌘Z)`.",
                        "- Pictures are screenshots and short clips from the app; their alt text says what they show.",
                        '- Concept pages such as "How the timeline works" explain how a part of the app works; the Glossary defines terms such as page, set, move and keyframe.',
                    ].join("\n"),
                    customSets: guideChapters.map((chapter) => ({
                        label: chapter.label,
                        description: chapter.about,
                        paths: [
                            ...(chapter.dir === "guides/start"
                                ? ["guides"]
                                : []),
                            chapter.dir,
                            `${chapter.dir}/**`,
                        ],
                    })),
                    // In reading order: the guide's front page and glossary, then each chapter
                    // as the sidebar orders it. On The Move and developer pages go last.
                    promote: [
                        "guides",
                        "guides/reference/glossary",
                        ...guideChapters.flatMap((chapter) =>
                            chapterPageIds(chapter.dir),
                        ),
                    ],
                    demote: ["otm/**", "developers/**"],
                    // The plugin always minifies the chapter files; keep them whole and readable,
                    // asides included. llms-small.txt is then about the same as llms-full.txt.
                    minify: {
                        note: false,
                        tip: false,
                        details: false,
                        whitespace: false,
                    },
                    // Keep one copy of each shortcut and picture, as plain text, and drop the
                    // "Section titled" links. Kbd.astro writes the text shortcut.
                    customSelectors: {
                        all: [
                            ".sl-anchor-link",
                            ".docs-media-dark",
                            ".docs-kbd-other",
                            ".docs-kbd-mac",
                            ".docs-kbd-gesture",
                        ],
                    },
                }),
            ],
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
                // The user guide (guideChapters above); pages order themselves with `sidebar.order`.
                ...guideChapters.map((chapter) => ({
                    label: chapter.label,
                    items: [
                        ...(chapter.dir === "guides/start"
                            ? [{ slug: "guides" }]
                            : []),
                        { autogenerate: { directory: chapter.dir } },
                    ],
                })),
                {
                    label: "On The Move",
                    collapsed: true,
                    items: [{ autogenerate: { directory: "otm" } }],
                },
                {
                    label: "Developers",
                    collapsed: true,
                    items: [{ autogenerate: { directory: "developers" } }],
                },
            ],
            head: [
                // Shortcuts show the reader's own keys (<Kbd>): Mac or everyone else
                {
                    tag: "script",
                    content:
                        "document.documentElement.dataset.os = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? 'mac' : 'other';",
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
