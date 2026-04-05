import { rmSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";
import pkg from "./package.json";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
// eslint-disable-next-line max-lines-per-function
export default defineConfig(({ command }) => {
    rmSync("dist-electron", { recursive: true, force: true });

    const isServe = command === "serve";
    const isBuild = command === "build";
    const sourcemap = isServe || !!process.env.VSCODE_DEBUG;
    const electronAlias = {
        "@": path.join(__dirname, "src"),
        "@om-electron": path.join(__dirname, "electron"),
    };

    return {
        resolve: {
            alias: electronAlias,
            extensions: [".js", ".ts", ".jsx", ".tsx", ".json"],
        },
        plugins: [
            // Keep tailwindcss here for the main renderer process
            tailwindcss(),
            react(),
            sentryVitePlugin({
                authToken: process.env.SENTRY_AUTH_TOKEN,
                org: "openmarch-llc",
                project: "electron",
            }),
            electron([
                {
                    // Main-Process entry file of the Electron App.
                    entry: "electron/main/index.ts",
                    onstart(options) {
                        if (process.env.VSCODE_DEBUG) {
                            console.log(
                                /* For `.vscode/.debug.script.mjs` */ "[startup] Electron App",
                            );
                        } else {
                            options.startup();
                        }
                    },
                    vite: {
                        resolve: {
                            alias: electronAlias,
                        },
                        build: {
                            sourcemap,
                            minify: isBuild,
                            outDir: "dist-electron/main",
                            rollupOptions: {
                                external: [
                                    "electron",
                                    "node",
                                    "better-sqlite3",
                                ].concat(
                                    Object.keys(
                                        "dependencies" in pkg
                                            ? pkg.dependencies
                                            : {},
                                    ),
                                ),
                            },
                        },
                    },
                },
                {
                    entry: "electron/preload/index.ts",
                    onstart(options) {
                        // Notify the Renderer-Process to reload the page when the Preload-Scripts build is complete,
                        // instead of restarting the entire Electron App.
                        options.reload();
                    },
                    vite: {
                        resolve: {
                            alias: electronAlias,
                        },
                        build: {
                            sourcemap: sourcemap ? "inline" : undefined, // #332
                            minify: isBuild,
                            outDir: "dist-electron/preload",
                            rollupOptions: {
                                external: Object.keys(
                                    "dependencies" in pkg
                                        ? pkg.dependencies
                                        : {},
                                ),
                            },
                        },
                    },
                },
            ]),
            // Use Node.js API in the Renderer-process
            renderer(),
        ],
        server:
            process.env.VSCODE_DEBUG &&
            (() => {
                const url = new URL(pkg.debug.env.VITE_DEV_SERVER_URL);
                return {
                    host: url.hostname,
                    port: +url.port,
                };
            })(),
        clearScreen: false,
    };
});
