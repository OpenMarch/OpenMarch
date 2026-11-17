// The Reference chapter (guides/reference/*).
import { settingsWindow } from "./start.mjs";

const shots = [
    {
        id: "reference-settings-window",
        kind: "still",
        // The Settings window on its first section
        async setup(ctx) {
            await ctx.wait(2000);
            return settingsWindow(ctx, "General");
        },
    },
    {
        id: "reference-shortcut-settings",
        kind: "still",
        // Settings › Keyboard shortcuts, where any action's keys can be changed
        async setup(ctx) {
            await ctx.wait(2000);
            const framed = await settingsWindow(ctx, "Keyboard shortcuts");
            // A few rows with their keys, rather than the File group's menu-only actions
            await framed.target
                .getByPlaceholder("Search shortcuts")
                .fill("play");
            await ctx.wait(600);
            await framed.target.evaluate(() => document.activeElement?.blur());
            return framed;
        },
    },
];

export default shots;
