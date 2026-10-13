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
 * - `WEB_CHANNEL`: "stable" or "nightly". Keeps each channel's show and
 *   settings apart in the browser, since both are served from one origin.
 * - `WEB_BASE`: the path the site is served from, e.g. "/nightly/".
 *
 * `dist-web/` is the site's root as Cloudflare serves it (see
 * `web/wrangler.jsonc`), so the build goes in `dist-web/<WEB_BASE>`.
 */

const channel = process.env.WEB_CHANNEL ?? "dev";
const base = process.env.WEB_BASE ?? "/";

const web = (file: string) => path.join(__dirname, "web", file);
const siteRoot = path.join(__dirname, "dist-web");

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
            path.join(siteRoot, "_headers"),
            [
                `${base}assets/*`,
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
                .replace(/<title>[^<]*<\/title>/, "<title>OpenMarch</title>"),
    },
});

export default defineConfig({
    base,
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
    },
    optimizeDeps: {
        // Loads its .wasm next to itself, which pre-bundling breaks.
        exclude: ["@sqlite.org/sqlite-wasm"],
    },
    build: {
        outDir: path.join(siteRoot, base),
        emptyOutDir: true,
        sourcemap: true,
        target: "es2022",
        chunkSizeWarningLimit: 8000,
    },
    server: { port: 7780 },
    clearScreen: false,
});
