/**
 * TEMPORARY (see README.md). Builds the web test build of the editor into
 * `web/dist`, a static site:
 *
 *   pnpm run lab:dev     # local server
 *   pnpm run lab:build   # then deploy web/dist
 *
 * The renderer, the preload and the main-process database code are the
 * app's own. Only the Node and Electron modules they import are swapped for
 * the stand-ins in `shims/`.
 */
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin } from "vite";

const desktop = path.join(__dirname, "..");
const shim = (name: string) => path.join(__dirname, "shims", name);

/**
 * Tailwind finds class names under Vite's root, which here is `web/`. Point
 * the app's stylesheet at `src/` too, as the app's own build sees it.
 */
const scanAppSource = (): Plugin => ({
    name: "openmarch-web-tailwind-source",
    enforce: "pre",
    transform(code, id) {
        if (!id.endsWith("/src/styles/index.css")) return;
        return `${code}\n@source "${path.join(desktop, "src")}";\n`;
    },
});

export default defineConfig({
    root: __dirname,
    base: "./",
    publicDir: path.join(__dirname, "public"),
    // The app's .env files: some modules need VITE_API_URL at load.
    envDir: desktop,
    resolve: {
        alias: [
            { find: /^electron$/, replacement: shim("electron.ts") },
            { find: /^(node:)?sqlite$/, replacement: shim("sqlite.ts") },
            { find: /^(node:)?fs$/, replacement: shim("fs.ts") },
            { find: /^(node:)?path$/, replacement: shim("path.ts") },
            { find: /^(node:)?crypto$/, replacement: shim("crypto.ts") },
            {
                find: "@sentry/electron/renderer",
                replacement: path.join(
                    desktop,
                    "e2e/browser/preload/sentry.ts",
                ),
            },
            { find: /^@\//, replacement: path.join(desktop, "src") + "/" },
            {
                find: /^@om-electron\//,
                replacement: path.join(desktop, "electron") + "/",
            },
        ],
        extensions: [".js", ".ts", ".jsx", ".tsx", ".json"],
    },
    plugins: [scanAppSource(), tailwindcss(), react()],
    define: {
        // The preload runs in Node under Electron; a browser has no `process`.
        "process.platform": JSON.stringify("web"),
        "process.env.PLAYWRIGHT_CODEGEN": JSON.stringify(""),
        "process.env.PLAYWRIGHT_SESSION": JSON.stringify(""),
        // Translations come from the bundle, without Tolgee's in-context tools.
        "import.meta.env.VITE_PUBLIC_PLAYWRIGHT_SESSION":
            JSON.stringify("true"),
        // No analytics from test builds.
        "import.meta.env.VITE_PUBLIC_POSTHOG_KEY": JSON.stringify(""),
    },
    server: { fs: { allow: [path.join(desktop, "..", "..")] } },
    build: {
        outDir: "dist",
        emptyOutDir: true,
        sourcemap: true,
        chunkSizeWarningLimit: 8000,
    },
    clearScreen: false,
});
