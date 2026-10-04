import { expect } from "@playwright/test";
import { test } from "../fixtures.mjs";

// Radix renders a visually-hidden native <select> (position: absolute) for any
// Select inside a Form, as ShapeEditor does. If no ancestor of that select is
// positioned, its containing block is the initial containing block, so <main>'s
// overflow-hidden does not clip it and it extends the document. The browser then
// scrolls the whole app to focus it. See Inspector.tsx.
test.describe("inspector layout", () => {
    test("visually-hidden absolute content does not make the document scrollable", async ({
        electronApp,
    }) => {
        const { page } = electronApp;
        await page.waitForSelector("#app", { timeout: 30000 });

        const result = await page.evaluate(() => {
            const html = document.documentElement;

            const scrollArea = [...document.querySelectorAll("#app div")].find(
                (el) =>
                    getComputedStyle(el).overflowY === "auto" &&
                    el.closest("#app")?.lastElementChild?.contains(el),
            ) as HTMLElement | undefined;

            if (!scrollArea)
                return { error: "inspector scroll area not found" };

            // Make the inspector content tall enough to push the select below the fold.
            const filler = document.createElement("div");
            filler.style.height = "1500px";
            filler.style.flex = "none";
            scrollArea.appendChild(filler);

            // The select must sit inside a plain block wrapper, as it does under
            // ShapeEditor's Form. An abs child of a flex container takes its static
            // position from the flex content-box origin, which would not reproduce this.
            const wrapper = document.createElement("div");
            wrapper.style.flex = "none";
            scrollArea.appendChild(wrapper);

            // Mimic Radix's BubbleSelect: absolute, 1px, no top/left, so it lands
            // at its static position deep in the inspector's content.
            const bubble = document.createElement("select");
            bubble.style.position = "absolute";
            bubble.style.width = "1px";
            bubble.style.height = "1px";
            bubble.style.overflow = "hidden";
            bubble.style.clip = "rect(0,0,0,0)";
            wrapper.appendChild(bubble);

            const measure = {
                htmlClientHeight: html.clientHeight,
                htmlScrollHeight: html.scrollHeight,
                scrollAreaScrolls:
                    scrollArea.scrollHeight > scrollArea.clientHeight,
            };

            filler.remove();
            wrapper.remove();
            return measure;
        });

        expect(result.error).toBeUndefined();

        // The inspector's own scroll area absorbs the tall content...
        expect(result.scrollAreaScrolls).toBe(true);

        // ...and nothing escapes to make the document itself scrollable.
        expect(result.htmlScrollHeight).toBeLessThanOrEqual(
            result.htmlClientHeight! + 1,
        );
    });
});
