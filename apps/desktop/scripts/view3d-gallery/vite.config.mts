import path from "node:path";
import { defineConfig } from "vite";

const desktop = path.resolve(__dirname, "../..");

/** Dev server for the venue gallery (README.md). Not part of any app build. */
export default defineConfig({
    root: __dirname,
    resolve: {
        alias: {
            "@": path.join(desktop, "src"),
            "@om-electron": path.join(desktop, "electron"),
        },
    },
    server: { fs: { allow: [path.resolve(desktop, "../..")] } },
});
