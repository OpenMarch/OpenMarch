import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { version } from "./package.json";

/**
 * Builds the web editor (editor.openmarch.com): the app in a browser tab,
 * with no Electron. See `web/README.md`.
 *
 *   pnpm run web:dev     # local server
 *   pnpm run web:build   # static site in dist-web/
 *
 * Environment:
 * `WEB_CHANNEL` ("stable" or "nightly"; "dev" if unset) names the release
 * channel; the nightly build says so next to the version.
 */

const channel = process.env.WEB_CHANNEL ?? "dev";

const web = (file: string) => path.join(__dirname, "web", file);
const outDir = path.join(__dirname, "dist-web");

/**
 * Cloudflare's static asset headers: hashed assets never change, so browsers
 * keep them; everything else (index.html) is checked on each visit, so a
 * deploy reaches people on their next load.
 */
const writeHeaders = (): Plugin => ({
    name: "openmarch-web-headers",
    apply: "build",
    closeBundle() {
        fs.writeFileSync(
            path.join(outDir, "_headers"),
            [
                "/assets/*",
                "  Cache-Control: public, max-age=31536000, immutable",
                "/*",
                "  X-Content-Type-Options: nosniff",
                "  Referrer-Policy: strict-origin-when-cross-origin",
                "",
            ].join("\n"),
        );
    },
});

/**
 * `electron` is two different modules here. Main-process code, which runs in
 * the worker, gets `ipcMain`; the preload, in the page, gets `ipcRenderer`.
 */
const resolveElectron = (): Plugin => ({
    name: "openmarch-web-electron",
    enforce: "pre",
    resolveId: {
        filter: { id: /^electron$/ },
        handler(_source, importer) {
            if (!importer) return;
            const file = importer.replace(/\\/g, "/");
            const inWorker =
                file.includes("/web/worker/") ||
                (file.includes("/electron/") &&
                    !file.includes("/electron/preload/"));
            return inWorker
                ? web("worker/electron.ts")
                : web("renderer/electron.ts");
        },
    },
});

/**
 * Starts the page with `web/renderer/index.ts`, which loads the preload and
 * the app once the worker is ready, and lets the page compile SQLite's
 * WebAssembly under the app's content security policy.
 */
const webEntry = (): Plugin => ({
    name: "openmarch-web-entry",
    transformIndexHtml: {
        order: "pre",
        handler: (html) =>
            html
                .replace(
                    '<script type="module" src="/src/main.tsx"></script>',
                    '<script type="module" src="/web/renderer/index.ts"></script>',
                )
                .replace(
                    "script-src 'self'",
                    "script-src 'self' 'wasm-unsafe-eval'",
                )
                .replace(/<title>[^<]*<\/title>/, "<title>OpenMarch</title>")
                .replace(
                    /<meta\s+name="viewport"\s+content="[^"]*"\s*\/>/,
                    `<meta name="viewport" content="${WEB_VIEWPORT}" />`,
                )
                .replace("</head>", `    ${HOME_SCREEN_TAGS}\n    </head>`),
    },
});

/**
 * `maximum-scale=1` stops iOS Safari zooming the page into a text field
 * whose font is under 16px (iOS ignores it for pinch-zoom, for
 * accessibility; `web/renderer/touchGestures.ts` stops that instead) and
 * stops Android Chrome's page pinch-zoom. `viewport-fit=cover` lets the app
 * reach under the notch and home indicator in home-screen mode, where
 * `env(safe-area-inset-*)` pads it back (src/styles/index.css).
 */
const WEB_VIEWPORT =
    "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover";

/**
 * "Add to Home Screen" (iPadOS Safari, Android Chrome): opens full screen
 * like an app, with the app icon. The files are in `web/public/`. Electron
 * shares index.html, so these are added only here.
 */
const HOME_SCREEN_TAGS = [
    '<link rel="manifest" href="/manifest.webmanifest" />',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
    '<meta name="mobile-web-app-capable" content="yes" />',
    '<meta name="apple-mobile-web-app-capable" content="yes" />',
    '<meta name="apple-mobile-web-app-title" content="OpenMarch" />',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
    '<meta name="theme-color" content="#ecebf0" media="(prefers-color-scheme: light)" />',
    '<meta name="theme-color" content="#0f0e13" media="(prefers-color-scheme: dark)" />',
].join("\n        ");

export default defineConfig({
    resolve: {
        alias: [
            { find: /^@\//, replacement: path.join(__dirname, "src") + "/" },
            {
                find: /^@om-electron\//,
                replacement: path.join(__dirname, "electron") + "/",
            },
            // Only the worker's main-process code imports these.
            { find: /^(node:)?fs$/, replacement: web("worker/fs.ts") },
            { find: /^(node:)?path$/, replacement: web("worker/path.ts") },
            { find: /^(node:)?sqlite$/, replacement: web("worker/sqlite.ts") },
            { find: /^(node:)?crypto$/, replacement: web("worker/crypto.ts") },
            {
                find: "@sentry/electron/renderer",
                replacement: web("renderer/sentry.ts"),
            },
        ],
        extensions: [".js", ".ts", ".jsx", ".tsx", ".json"],
    },
    plugins: [
        resolveElectron(),
        tailwindcss(),
        react(),
        webEntry(),
        writeHeaders(),
    ],
    worker: {
        format: "es",
        plugins: () => [resolveElectron()],
    },
    define: {
        // The preload reads these from Node's `process` under Electron.
        "process.platform": "globalThis.__openmarchPlatform",
        "process.env.PLAYWRIGHT_CODEGEN": JSON.stringify(""),
        "process.env.PLAYWRIGHT_SESSION": JSON.stringify(""),
        "import.meta.env.VITE_PUBLIC_WEB_BUILD": JSON.stringify("true"),
        "import.meta.env.VITE_PUBLIC_WEB_CHANNEL": JSON.stringify(channel),
        "import.meta.env.VITE_PUBLIC_APP_VERSION": JSON.stringify(version),
        // No analytics on the web (PostHog stays uninitialized; Sentry is
        // stubbed in renderer/sentry.ts).
        "import.meta.env.VITE_PUBLIC_POSTHOG_KEY": JSON.stringify(""),
    },
    optimizeDeps: {
        // Loads its .wasm next to itself, which pre-bundling breaks.
        exclude: ["@sqlite.org/sqlite-wasm"],
    },
    // Home-screen icons and manifest (see HOME_SCREEN_TAGS), and the favicon.
    publicDir: web("public"),
    build: {
        outDir,
        emptyOutDir: true,
        sourcemap: true,
        target: "es2022",
        chunkSizeWarningLimit: 8000,
    },
    server: { port: 7780 },
    clearScreen: false,
});
