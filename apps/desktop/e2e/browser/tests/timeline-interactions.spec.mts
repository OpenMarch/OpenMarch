import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import { drawnMarchers, readField, waitForField } from "../app.mjs";
import { isolate } from "../timeline.mjs";

// The timeline's interactions on the field (#202; #189 user stories 18, 20,
// 59): Escape leaving isolation (and when it doesn't, as with the shape tool
// open). The first press
// after a paused preview (story 60) is `paused-preview.spec.mts`. What #201
// already pinned (a click on a dimmed marcher selects nothing; Escape with
// nobody selected leaves isolation) is in `timeline-visuals.spec.mts`.
//
// Escape during a clip move or resize belongs to the gesture, not to
// isolation. That rule is the timeline's alone, and the demo's moves are page
// moves, which have no clip: it's pinned by `TimelineClipResize.test.tsx`
// ("while a resize or move runs, Esc belongs to it, not to isolation").
//
// The "change:" scenarios are the rules-table changes decided in #189.

const desktop = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
);

const isolationBar = (page: Page) => page.getByTestId("timeline-isolation-bar");

/**
 * Selects every marcher that can be selected, and waits for `count` of them
 * on the field and in the inspector: keys like B act on the app's
 * selection, which reaches the app's state a render after the field's.
 */
async function selectAll(page: Page, count: number) {
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(async () => (await readField(page)).selection.length)
        .toBe(count);
    await expect(
        page.getByText(new RegExp(`^${count} Marchers$`)).first(),
    ).toBeVisible();
}

// A converted demo show: every page is a move. The move over the page box
// that starts at beat 53 has 4 of the 95 marchers; the others follow there.
test.use({
    showFile: path.join(desktop, "view3d-web/public/demos/part1-demo.dots"),
});

/** Isolates the 4-marcher move at beat 53 and selects its marchers. */
async function isolateAndSelect(page: Page) {
    await waitForField(page);
    await isolate(page, 53);
    await expect
        .poll(
            async () =>
                (await drawnMarchers(page)).filter((m) => !m.dimmed).length,
        )
        .toBe(4);
    await selectAll(page, 4);
}

test("Escape leaves isolation with marchers selected, in one press", async ({
    show,
}) => {
    const { page } = show;
    await isolateAndSelect(page);
    await page.keyboard.press("Escape");
    await expect(isolationBar(page)).toBeHidden();
    await expect
        .poll(async () => (await drawnMarchers(page)).some((m) => m.dimmed))
        .toBe(false);
});

test("Escape in isolation with the shape tool open only closes the tool", async ({
    show,
}) => {
    const { page } = show;
    await isolateAndSelect(page);
    await page.keyboard.press("b");
    await expect(page.getByTestId("shape-tool-hint")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("shape-tool-hint")).toBeHidden();
    await page.waitForTimeout(300);
    await expect(isolationBar(page)).toBeVisible();
    // The tool keeps the selection; the next Escape leaves
    expect((await readField(page)).selection).toHaveLength(4);
    await page.keyboard.press("Escape");
    await expect(isolationBar(page)).toBeHidden();
});

test("Escape in isolation with a dialog open only closes the dialog", async ({
    show,
}) => {
    const { page } = show;
    await isolateAndSelect(page);
    await page.keyboard.press("ControlOrMeta+k");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await page.waitForTimeout(300);
    await expect(isolationBar(page)).toBeVisible();
});
