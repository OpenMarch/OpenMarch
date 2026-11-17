// The Reference chapter (guides/reference/*).
import { settingsWindow } from "./start.mjs";

const shots = [
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
            const settings = framed.target;
            // One row changed (Play on from the start flag loses its key), so the row shows its
            // + and the arrow that puts the default back
            const half = settings.locator("li", {
                hasText: "Play on from the start flag",
            });
            await half.hover({ timeout: 5000 });
            await ctx.wait(300);
            await half
                .getByRole("button", { name: /^Remove/ })
                .first()
                .click()
                .catch(() => {});
            await ctx.wait(500);
            // The pointer on a row that has a key, so its × and + show
            const row = settings.locator("li", {
                hasText: "Play from playhead / pause",
            });
            const r = await row.boundingBox();
            const at = { x: r.x + r.width - 140, y: r.y + r.height / 2 };
            await settings.mouse.move(at.x, at.y);
            await ctx.wait(500);
            // The list and its search box, without the settings sidebar
            const list = await row.evaluate((li) => {
                const ul = li.closest("ul");
                const a = ul.getBoundingClientRect();
                const search = document
                    .querySelector('input[placeholder="Search shortcuts"]')
                    .getBoundingClientRect();
                return {
                    x: Math.min(a.x, search.x),
                    y: search.y,
                    right: Math.max(a.right, search.right),
                    bottom: a.bottom,
                };
            });
            const pad = 12;
            const x = Math.max(0, Math.floor(list.x - pad));
            const y = Math.max(0, Math.floor(list.y - pad));
            // The pointer drawn on that row, so the reader sees why it shows × and +
            await settings.evaluate(
                ([frame, p]) => {
                    window.__docsOverlay.setFrame(frame);
                    window.__docsOverlay.enable();
                    window.__docsOverlay.place(p.x, p.y);
                },
                [framed.box, at],
            );
            await ctx.wait(300);
            return {
                target: settings,
                box: {
                    x,
                    y,
                    width:
                        Math.min(
                            framed.box.width,
                            Math.ceil(list.right + pad),
                        ) - x,
                    height:
                        Math.min(
                            framed.box.height,
                            Math.ceil(list.bottom + pad),
                        ) - y,
                },
            };
        },
    },
];

export default shots;
