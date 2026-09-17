import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
    stories: ["../src/**/*.stories.@(ts|tsx)"],
    addons: ["@storybook/addon-docs"],
    framework: {
        name: "@storybook/react-vite",
        options: {},
    },
    async viteFinal(config) {
        const { mergeConfig } = await import("vite");
        // Storybook auto-loads apps/desktop/vite.config.mts as its base config. The Electron and
        // Sentry plugins are for production renderer builds, not the isolated story preview.
        config.plugins = (config.plugins ?? [])
            .flat(Infinity)
            .filter((plugin) => {
                const name =
                    plugin && "name" in plugin ? plugin.name : undefined;
                return (
                    name !== "vite-plugin-electron" &&
                    name !== "vite-plugin-electron-renderer" &&
                    !name?.startsWith("sentry-")
                );
            });
        return mergeConfig(config, {
            resolve: {
                alias: {
                    "@": path.join(dirname, "../src"),
                },
            },
        });
    },
};

export default config;
