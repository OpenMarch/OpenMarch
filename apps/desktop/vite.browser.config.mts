import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Builds the app for the browser end-to-end harness (`e2e/browser/`), which
 * runs the renderer in plain Chromium instead of Electron.
 *
 * - default mode: the renderer plus the real preload script, with `electron`
 *   swapped for a stand-in whose `ipcRenderer` calls into the test process.
 *   Output: `dist-browser/`.
 * - `--mode host`: the main-process code a show needs, bundled for plain
 *   Node. Output: `dist-browser-host/`.
 */

const alias = {
    "@": path.join(__dirname, "src"),
    "@om-electron": path.join(__dirname, "electron"),
};

/** Loads the preload before the app, as Electron does. */
const injectPreload = (): Plugin => ({
    name: "openmarch-browser-preload",
    transformIndexHtml: {
        order: "pre",
        handler: (html) =>
            html.replace(
                '<script type="module" src="/src/main.tsx"></script>',
                '<script type="module" src="/electron/preload/index.ts"></script>\n' +
                    '        <script type="module" src="/src/main.tsx"></script>',
            ),
    },
});

export default defineConfig(({ mode }) => {
    if (mode === "host") {
        // Main-process code reads the same `.env.production` values the app build does.
        const env = loadEnv("production", __dirname);
        return {
            define: Object.fromEntries(
                Object.entries(env).map(([key, value]) => [
                    `import.meta.env.${key}`,
                    JSON.stringify(value),
                ]),
            ),
            resolve: {
                alias: {
                    ...alias,
                    electron: path.join(
                        __dirname,
                        "e2e/browser/host/electron.ts",
                    ),
                },
            },
            build: {
                ssr: "e2e/browser/host/index.ts",
                outDir: "dist-browser-host",
                emptyOutDir: true,
                sourcemap: true,
                rollupOptions: { output: { entryFileNames: "index.mjs" } },
            },
            clearScreen: false,
        };
    }

    return {
        resolve: {
            alias: {
                ...alias,
                electron: path.join(
                    __dirname,
                    "e2e/browser/preload/electron.ts",
                ),
                "@sentry/electron/renderer": path.join(
                    __dirname,
                    "e2e/browser/preload/sentry.ts",
                ),
            },
            extensions: [".js", ".ts", ".jsx", ".tsx", ".json"],
        },
        plugins: [tailwindcss(), react(), injectPreload()],
        define: {
            // The preload runs in Node under Electron; a browser has no `process`.
            "process.platform": JSON.stringify(process.platform),
            "process.env.PLAYWRIGHT_CODEGEN": JSON.stringify(""),
            "process.env.PLAYWRIGHT_SESSION": JSON.stringify("true"),
            // No analytics from test runs.
            "import.meta.env.VITE_PUBLIC_POSTHOG_KEY": JSON.stringify(""),
        },
        build: {
            outDir: "dist-browser",
            emptyOutDir: true,
            sourcemap: true,
        },
        clearScreen: false,
    };
});
