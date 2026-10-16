import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    drawnMarchers,
    readField,
    waitForField,
    waitForIdle,
    type DrawnMarcher,
} from "../app.mjs";
import { emptyField, goToPage, isolate, pressKeep } from "../timeline.mjs";

// The timeline's interactions on the field (#202; #189 user stories 18, 20,
// 59): the kept-mark tooltip's rules, Escape leaving isolation (and when it
// doesn't), and dimmed marchers while the line tool is on. The first press
// after a paused preview (story 60) is `paused-preview.spec.mts`. What #201
// already pinned (the tooltip shows on hover and goes off the mark; a click
// on a dimmed marcher selects nothing; Escape with nobody selected leaves
// isolation) is in `timeline-visuals.spec.mts`.
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

/** The marchers drawn now, by id. */
const drawnById = async (page: Page) =>
    new Map((await drawnMarchers(page)).map((m) => [m.id, m]));

/**
 * Selects every marcher that can be selected, and waits for `count` of them
 * on the field and in the inspector: keys like L and K act on the app's
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

const tooltip = (page: Page) => page.getByTestId("timeline-kept-mark-tooltip");

/**
 * A point near the far end of a marcher's kept mark, which sits just
 * right of the dot (`keptMarkBox`): its side is 12 screen px per unit
 * of zoom, held between 10 and 16 px, centered 2 field units below
 * the dot's center.
 */
const markPoint = (marcher: DrawnMarcher, zoom: number) => {
    const side = Math.min(16, Math.max(10, 12 * zoom));
    return {
        x: marcher.screen.x + 5 * zoom + 1.5 + side * 0.85,
        y: marcher.screen.y + 2 * zoom,
    };
};

/**
 * Keeps the 91 marchers who follow on the page at beat 53, and returns
 * the kept marcher with the most room around its dot, so a point near
 * it is near no other.
 */
async function keptMarcher(page: Page, query: Show["query"]) {
    await goToPage(page, 53);
    const empty = await emptyField(page);
    await page.mouse.click(empty.x, empty.y);
    await selectAll(page, 95);
    await pressKeep(page);
    await expect
        .poll(
            async () =>
                (
                    await query<{ n: number }>(
                        "SELECT count(*) AS n FROM timeline_kept_assignments",
                    )
                )[0]!.n,
        )
        .toBe(91);
    await page.mouse.click(empty.x, empty.y);
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([]);

    const kept = new Set(
        (
            await query<{ marcher_id: number }>(
                `SELECT a.marcher_id FROM timeline_kept_assignments k
                         JOIN timeline_assignments a ON a.id = k.assignment_id`,
            )
        ).map((r) => r.marcher_id),
    );
    const drawn = await drawnMarchers(page);
    const room = (m: DrawnMarcher) =>
        Math.min(
            ...drawn
                .filter((o) => o.id !== m.id)
                .map((o) =>
                    Math.hypot(
                        o.screen.x - m.screen.x,
                        o.screen.y - m.screen.y,
                    ),
                ),
        );
    const candidates = drawn.filter((m) => kept.has(m.id) && m.onScreen);
    candidates.sort((a, b) => room(b) - room(a));
    const marcher = candidates[0]!;
    expect(room(marcher)).toBeGreaterThan(40);
    return {
        marcher,
        empty,
        zoom: (await readField(page)).viewport.zoom,
    };
}

test("kept mark tooltip: it shows after a delay, within one and a half dot radii of the dot", async ({
    show,
}) => {
    const { page, query } = show;
    await waitForField(page);
    const { marcher, zoom } = await keptMarcher(page, query);

    // 6 field units above the dot's center: off the dot (radius 5), within 1.5 radii.
    // It shows, but not before the delay (500 ms) has passed since the move
    const movedAt = Date.now();
    await page.mouse.move(marcher.screen.x, marcher.screen.y - 6 * zoom);
    await expect(tooltip(page)).toBeVisible();
    expect(Date.now() - movedAt).toBeGreaterThanOrEqual(450);

    // 9 field units above: off both the dot's reach and the mark (right of the dot)
    await page.mouse.move(marcher.screen.x, marcher.screen.y - 9 * zoom);
    await expect(tooltip(page)).toBeHidden();
    await page.waitForTimeout(800);
    await expect(tooltip(page)).toBeHidden();
});

test("kept mark tooltip: it shows over the mark beside the dot", async ({
    show,
}) => {
    const { page, query } = show;
    await waitForField(page);
    const { marcher, zoom } = await keptMarcher(page, query);
    const at = markPoint(marcher, zoom);
    // Past one and a half dot radii: only the mark is under it
    expect(at.x - marcher.screen.x).toBeGreaterThan(7.5 * zoom + 1);
    await page.mouse.move(at.x, at.y);
    await expect(tooltip(page)).toBeVisible();
});

test("kept mark tooltip: it doesn't show while a button is down, and goes on a press", async ({
    show,
}) => {
    const { page, query } = show;
    await waitForField(page);
    const { marcher, empty } = await keptMarcher(page, query);

    // Pressed on empty field and dragged over the dot: nothing
    await page.mouse.move(empty.x, empty.y);
    await page.mouse.down();
    await page.mouse.move(marcher.screen.x, marcher.screen.y, {
        steps: 8,
    });
    await page.waitForTimeout(800);
    await expect(tooltip(page)).toBeHidden();
    await page.mouse.up();
    await page.mouse.click(empty.x, empty.y);

    // Shown, then a press over the mark hides it
    await page.mouse.move(marcher.screen.x, marcher.screen.y);
    await expect(tooltip(page)).toBeVisible();
    await page.mouse.down();
    await expect(tooltip(page)).toBeHidden();
    await page.mouse.up();
});

test("kept mark tooltip: it goes when the pointer leaves the field", async ({
    show,
}) => {
    // The rule (#202): it hides on leave, whatever was last under the pointer
    const { page, query } = show;
    await waitForField(page);
    const { marcher, zoom } = await keptMarcher(page, query);
    await page.mouse.move(
        markPoint(marcher, zoom).x,
        markPoint(marcher, zoom).y,
    );
    await expect(tooltip(page)).toBeVisible();
    const box = (await page.getByTestId("fieldCanvas").first().boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y - 20);
    await expect(tooltip(page)).toBeHidden();
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

test("Escape in isolation with the line tool on only cancels the tool", async ({
    show,
}) => {
    const { page } = show;
    await isolateAndSelect(page);
    await page.keyboard.press("l");
    // The tool holds the marchers it lines up; the selection is empty meanwhile
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([]);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await expect(isolationBar(page)).toBeVisible();
    // The tool gave the marchers back; the next Escape leaves
    await expect
        .poll(async () => (await readField(page)).selection.length)
        .toBe(4);
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

test("change: a marcher no longer dimmed while the line tool is on can't be selected until the tool ends (user story 20)", async ({
    show,
}) => {
    const { page } = show;
    await waitForField(page);
    await isolate(page, 53);
    await expect
        .poll(
            async () =>
                (await drawnMarchers(page)).filter((m) => !m.dimmed).length,
        )
        .toBe(4);
    const outside = (await drawnMarchers(page)).find(
        (m) => m.dimmed && m.onScreen,
    )!;
    await selectAll(page, 4);
    await page.keyboard.press("l");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([]);

    // Leaving isolation (Done) ends the dimming while the tool is still on
    await page.getByRole("button", { name: /^Done/ }).click();
    await expect(isolationBar(page)).toBeHidden();
    await expect
        .poll(async () => (await drawnById(page)).get(outside.id)!.dimmed)
        .toBe(false);
    // Leaving isolation puts the playhead back, so the marcher may stand elsewhere now
    await waitForIdle(page);
    const now = (await drawnById(page)).get(outside.id)!;
    expect(now.onScreen).toBe(true);
    await page.mouse.click(now.screen.x, now.screen.y);
    await page.waitForTimeout(300);
    expect((await readField(page)).selection).not.toContain(outside.id);
});
