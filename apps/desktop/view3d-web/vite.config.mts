/**
 * TEMPORARY (see host.ts). Builds the web preview of the 3D View into
 * `view3d-web/dist`, a static site:
 *
 *   pnpm run view3d-web:dev     # local server
 *   pnpm run view3d-web:build   # then deploy view3d-web/dist
 */
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const desktop = path.join(__dirname, "..");

export default defineConfig({
    root: __dirname,
    base: "./",
    // The app's .env files: some modules need VITE_API_URL at load.
    envDir: desktop,
    resolve: {
        alias: [
            // The window's title bar becomes the preview's show picker.
            {
                find: "@/components/titlebar/TitleBar",
                replacement: path.join(__dirname, "WebTitleBar.tsx"),
            },
            { find: "@", replacement: path.join(desktop, "src") },
            {
                find: "@om-electron",
                replacement: path.join(desktop, "electron"),
            },
        ],
    },
    plugins: [tailwindcss(), react()],
    server: { fs: { allow: [path.join(desktop, "..", "..")] } },
    build: {
        outDir: "dist",
        emptyOutDir: true,
        chunkSizeWarningLimit: 4000,
    },
});
