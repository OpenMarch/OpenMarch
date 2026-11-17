import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CDPSession, Locator, Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    FINGERTIP_WIDTH,
    clickMarcher,
    drawnMarchers,
    emulateTouchScreen,
    goTo,
    readField,
    waitForIdle,
    tap,
    touchGesture,
    waitForField,
} from "../app.mjs";
import { seedShowSql } from "../seed.mjs";
import { goToPage, pageBox } from "../timeline.mjs";

// The timeline's 44 px finger hit areas (tablet plan 3.3, fork #886). In the
// touch layout a finger that lands 15–20 px off a small target's drawn line
// still takes it: the start flag, the playhead, the selected page's flag
// grips, the selected clip's edges and its ⋯ chip, the loop's ends and the
// splitter. A loop end needs a finger to move 12 px before it drags. The last
// tests check that a mouse, in the mouse layout, presses as it always has.

const desktop = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
);

// A converted demo show: every page is a move
const SHOW = path.join(desktop, "view3d-web/public/demos/part1-demo.dots");
const PAGE_START = 53;
/** How far off a target's drawn line each press lands */
const OFF = 18;

type Point = { x: number; y: number };

const viewport = (page: Page) => page.getByTestId("timeline-viewport");
const playheadAt = (page: Page) =>
    page.getByTestId("timeline-playhead").getAttribute("aria-label");
const scrollLeft = (page: Page) =>
    viewport(page).evaluate((el) => el.scrollLeft);
const centerX = async (locator: Locator) => {
    const box = (await locator.boundingBox())!;
    return box.x + box.width / 2;
};
const centerOf = async (locator: Locator): Promise<Point> => {
    const box = (await locator.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** The space under the pinned ruler and page row, and above the scrollbar */
async function trackBody(page: Page) {
    const view = (await viewport(page).boundingBox())!;
    const header = (await page
        .getByTestId("timeline-pinned-header")
        .boundingBox())!;
    return { top: header.y + header.height, bottom: view.y + view.height - 18 };
}

/** A height in the track body clear of clips: clip rows stack from its top */
const bareY = async (page: Page) => (await trackBody(page)).bottom - 12;

/** Makes the timeline pane taller with its splitter, from the keyboard */
async function tallerTimeline(page: Page) {
    const splitter = page.getByTestId("timeline-splitter");
    await splitter.focus();
    for (let i = 0; i < 6; i++) await splitter.press("Shift+ArrowUp");
    await expect
        .poll(async () => {
            const { top, bottom } = await trackBody(page);
            return bottom - top;
        })
        .toBeGreaterThan(80);
    await splitter.blur();
}

/** Zooms in with Ctrl+wheel, so the beat-53 page box is wide, and brings it into view */
async function zoomIn(page: Page) {
    const at = await centerOf(viewport(page));
    await page.mouse.move(at.x, at.y);
    await page.keyboard.down("Control");
    for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -100);
    await page.keyboard.up("Control");
    await expect
        .poll(
            async () => (await pageBox(page, PAGE_START).boundingBox())!.width,
        )
        .toBeGreaterThan(160);
    // In the middle of the view, so both its flags and its loop ends have room around them
    await pageBox(page, PAGE_START).evaluate((el) =>
        el.scrollIntoView({ block: "nearest", inline: "center" }),
    );
    await page.waitForTimeout(200);
}

/** A taller timeline, zoomed in on the beat-53 page */
async function ready(page: Page) {
    await tallerTimeline(page);
    await zoomIn(page);
}

/** The start flag's line, by its pennant (drawn from the line's left pixel) */
const startFlagX = async (page: Page) =>
    (await page.getByTestId("timeline-start-pennant").boundingBox())!.x + 1;

/**
 * Touches the screen through CDP in phases, so the test can look in between:
 * `down`, `move` (any number) and `up`.
 */
async function finger(page: Page) {
    const cdp: CDPSession = await page.context().newCDPSession(page);
    const send = (
        type: "touchStart" | "touchMove" | "touchEnd",
        points: Point[],
    ) =>
        cdp.send("Input.dispatchTouchEvent", {
            type,
            touchPoints: points.map((p, id) => ({
                x: p.x,
                y: p.y,
                radiusX: FINGERTIP_WIDTH / 2,
                radiusY: FINGERTIP_WIDTH / 2,
                force: 1,
                id,
            })),
        });
    let at: Point = { x: 0, y: 0 };
    return {
        async down(point: Point) {
            at = point;
            await send("touchStart", [point]);
        },
        /** Moves by `dx` (and `dy`) in steps */
        async move(dx: number, dy = 0, steps = 8) {
            const from = at;
            for (let i = 1; i <= steps; i++) {
                at = {
                    x: from.x + (dx * i) / steps,
                    y: from.y + (dy * i) / steps,
                };
                await send("touchMove", [at]);
            }
        },
        async up() {
            await send("touchEnd", []);
            await cdp.detach();
        },
    };
}

/** A finger drag from `from` by `dx`, `dy`, lifting at the end */
async function drag(page: Page, from: Point, dx: number, dy = 0) {
    const f = await finger(page);
    await f.down(from);
    await f.move(dx, dy);
    await f.up();
}

/** Every stored move's start beat, by id */
const moveStarts = async (query: Show["query"]) =>
    Object.fromEntries(
        (
            await query<{ id: number; start: number }>(
                "SELECT id, start_beat AS start FROM timelines ORDER BY id",
            )
        ).map((r) => [r.id, r.start]),
    );

/** Clicks one marcher of the beat-53 move on the field (a mouse, as the field is not under test) */
async function selectMoveMarcher(show: Show): Promise<number> {
    const { page, query } = show;
    // Stored by beat id, one more than the view beat
    const members = (
        await query<{ marcher: number }>(
            `SELECT a.marcher_id AS marcher
               FROM timelines l
               JOIN timeline_transitions t ON t.timeline_id = l.id
               JOIN timeline_assignments a ON a.transition_id = t.id
              WHERE l.id = (SELECT id FROM timelines WHERE start_beat = ? ORDER BY id LIMIT 1)`,
            PAGE_START + 1,
        )
    ).map((r) => r.marcher);
    const marcher = (await drawnMarchers(page)).find(
        (m) => members.includes(m.id) && m.onScreen,
    );
    expect(marcher, "a member of the move is on screen").toBeTruthy();
    await page.mouse.click(marcher!.screen.x, marcher!.screen.y);
    await expect
        .poll(() => page.evaluate(() => window.fieldTest!.selection()))
        .toEqual([marcher!.id]);
    return marcher!.id;
}

/**
 * Splits one marcher of the beat-53 move into a new move, which has a clip
 * (as `touch-timeline-gestures.spec.mts` does); returns the clip.
 */
async function splitIntoClip(show: Show): Promise<Locator> {
    const { page, query } = show;
    const before = await moveStarts(query);
    await selectMoveMarcher(show);
    await expect(async () => {
        await pageBox(page, PAGE_START).click({ button: "right" });
        await page
            .getByRole("menuitem", { name: "Split 1 selected into new move" })
            .click({ timeout: 1000 });
    }).toPass();
    await expect
        .poll(async () => Object.keys(await moveStarts(query)).length)
        .toBe(Object.keys(before).length + 1);
    const splitId = Math.max(
        ...Object.keys(await moveStarts(query)).map(Number),
    );
    await expect(page.getByTestId("timeline-isolation-bar")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("timeline-isolation-bar")).toBeHidden();
    const clip = page.locator(
        `[data-testid="timeline-clip"][data-move-id="${splitId}"]`,
    );
    await expect(clip).toBeVisible();
    // Settled where it drops
    let last = Number.NaN;
    await expect
        .poll(async () => {
            const y = (await clip.boundingBox())!.y;
            const still = Math.abs(y - last) < 0.5;
            last = y;
            return still;
        })
        .toBe(true);
    return clip;
}

test.describe("touch layout", () => {
    test.use({
        showFile: SHOW,
        appSettings: { optOutAnalytics: true, editorMode: "expert" },
        allowedPageErrors: [/Audio worklet error/],
        touchScreen: true,
        initScript: "localStorage.setItem('openmarch:inputMode', 'touch');",
    });

    // The timeline is made taller and zoomed in by each test (`ready`), after any click on the
    // field: the taller pane leaves a shorter field, with the move's marchers off its bottom
    test.beforeEach(async ({ show }) => {
        await waitForField(show.page);
        await goToPage(show.page, PAGE_START);
    });

    test("a finger 18 px off the start flag drags it; a tap there leaves the playhead", async ({
        show,
    }) => {
        const { page } = show;
        await ready(page);
        const y = await bareY(page);
        const before = await startFlagX(page);
        const playhead = await playheadAt(page);
        // Beside the line, on the side away from the playhead
        const side =
            (await centerX(page.getByTestId("timeline-playhead"))) > before
                ? -1
                : 1;
        await tap(page, { x: before + side * OFF, y });
        await page.waitForTimeout(300);
        expect(await playheadAt(page), "a tap there doesn't seek").toBe(
            playhead,
        );
        expect(await startFlagX(page)).toBeCloseTo(before, 0);
        const scroll = await scrollLeft(page);
        await drag(page, { x: before + side * OFF, y }, side * 60);
        await expect
            .poll(async () => Math.abs((await startFlagX(page)) - before))
            .toBeGreaterThan(30);
        expect(await scrollLeft(page), "it didn't pan").toBe(scroll);
    });

    test("a finger 18 px off the playhead's line scrubs it instead of panning", async ({
        show,
    }) => {
        const { page } = show;
        await ready(page);
        const y = await bareY(page);
        const line = await centerX(page.getByTestId("timeline-playhead"));
        const side = (await startFlagX(page)) < line ? 1 : -1;
        const before = await playheadAt(page);
        const scroll = await scrollLeft(page);
        await drag(page, { x: line + side * OFF, y }, side * 80);
        await expect.poll(() => playheadAt(page)).not.toBe(before);
        expect(await scrollLeft(page), "it didn't pan").toBe(scroll);
    });

    test("the selected page's flag grips are drawn, and a finger 18 px off one drags it", async ({
        show,
    }) => {
        const { page } = show;
        await ready(page);
        const selected = page.locator(
            '[data-testid="timeline-page-flag-grip"][data-selected-page]',
        );
        await expect(selected).toHaveCount(2);
        const boxes = await Promise.all(
            [0, 1].map(async (i) => (await selected.nth(i).boundingBox())!),
        );
        const end =
            boxes[0]!.x > boxes[1]!.x ? selected.nth(0) : selected.nth(1);
        // Drawn without hovering
        await expect
            .poll(() =>
                end
                    .locator("span[aria-hidden]")
                    .first()
                    .evaluate((el) => Number(getComputedStyle(el).opacity)),
            )
            .toBeGreaterThan(0.5);
        const grip = await centerOf(end);
        const width = (await pageBox(page, PAGE_START).boundingBox())!.width;
        // The playhead sits on this flag, and a line on a flag wins (UI-21): move it into the
        // page first, with a tap on bare track space
        const box = (await pageBox(page, PAGE_START).boundingBox())!;
        const playhead = await playheadAt(page);
        await tap(page, { x: box.x + box.width / 2, y: await bareY(page) });
        await expect.poll(() => playheadAt(page)).not.toBe(playhead);
        const f = await finger(page);
        // Inside the page, 18 px left of its flag
        await f.down({ x: grip.x - OFF, y: grip.y });
        await f.move(-40);
        await expect(
            page.getByTestId("timeline-page-flag-readout"),
        ).toBeVisible();
        // Brought back where it started, it writes nothing
        await f.move(40);
        await f.up();
        await expect(
            page.getByTestId("timeline-page-flag-readout"),
        ).toBeHidden();
        expect(
            (await pageBox(page, PAGE_START).boundingBox())!.width,
        ).toBeCloseTo(width, 0);
    });

    test("where the start flag, the playhead and the loop's start sit on the selected page's flags, a finger right on them takes the line", async ({
        show,
    }) => {
        const { page } = show;
        await ready(page);
        const readout = page.getByTestId("timeline-page-flag-readout");
        const width = async () =>
            (await pageBox(page, PAGE_START).boundingBox())!.width;
        const before = await width();
        const grips = page.locator(
            '[data-testid="timeline-page-flag-grip"][data-selected-page]',
        );
        await expect(grips).toHaveCount(2);
        const gripY = (await centerOf(grips.first())).y;

        // The start flag's line, in the page row over the page's start flag
        const flag = await startFlagX(page);
        let f = await finger(page);
        await f.down({ x: flag, y: gripY });
        await f.move(50);
        await expect
            .poll(async () => (await startFlagX(page)) - flag)
            .toBeGreaterThan(25);
        await expect(readout).toBeHidden();
        await f.up();
        expect(await width()).toBeCloseTo(before, 0);
        await goToPage(page, PAGE_START);
        await expect.poll(() => startFlagX(page)).toBeCloseTo(flag, 0);

        // The playhead's line, over the page's end flag
        const line = await centerX(page.getByTestId("timeline-playhead"));
        const playhead = await playheadAt(page);
        f = await finger(page);
        await f.down({ x: line, y: gripY });
        await f.move(-50);
        await expect.poll(() => playheadAt(page)).not.toBe(playhead);
        await expect(readout).toBeHidden();
        await f.up();
        expect(await width()).toBeCloseTo(before, 0);
        await goToPage(page, PAGE_START);

        // The loop's start, in the headroom over the page's start flag
        await page.keyboard.press("c");
        const loopStart = page.getByTestId("timeline-loop-start");
        await expect(loopStart).toBeVisible();
        const label = await loopStart.getAttribute("aria-label");
        const bar = (await page
            .getByTestId("timeline-loop-bar")
            .boundingBox())!;
        f = await finger(page);
        // Just outside the bar's start, on the loop start's own handle, clear of the pennant
        await f.down({ x: bar.x - 3, y: bar.y + 4 });
        await f.move(-50);
        await f.up();
        await expect
            .poll(() => loopStart.getAttribute("aria-label"))
            .not.toBe(label);
        expect(await width()).toBeCloseTo(before, 0);
    });

    test("a tap on an unselected clip 15 px from the playhead selects it; on the selected clip beside the start flag it takes the clip's start", async ({
        show,
    }) => {
        const { page } = show;
        const clip = await splitIntoClip(show);
        await ready(page);
        // Back to the page: the clip isn't selected, and the playhead is on its end
        await goToPage(page, PAGE_START);
        await clip.scrollIntoViewIfNeeded();
        await expect(clip).toHaveAttribute("data-selected", "false");
        const box = (await clip.boundingBox())!;
        const y = box.y + box.height / 2;
        const line = await centerX(page.getByTestId("timeline-playhead"));
        expect(Math.abs(line - (box.x + box.width))).toBeLessThan(4);
        const playhead = await playheadAt(page);
        await tap(page, { x: line - 15, y });
        await expect(clip).toHaveAttribute("data-selected", "true");
        expect(await playheadAt(page), "it didn't seek").toBe(playhead);
        // Selected, its start reaches in: a drag 15 px from the start flag, on the clip, resizes it
        // and doesn't drag the flag or scrub (at its end, 15 px in is its ⋯ chip)
        const flag = await startFlagX(page);
        expect(Math.abs(flag - box.x)).toBeLessThan(4);
        const f = await finger(page);
        await f.down({ x: flag + 15, y });
        await f.move(40);
        await expect(
            page.getByTestId("timeline-clip-resize-tag"),
        ).toBeVisible();
        expect(await playheadAt(page)).toBe(playhead);
        expect(await startFlagX(page)).toBeCloseTo(flag, 0);
        await f.move(-40);
        await f.up();
        await expect(page.getByTestId("timeline-clip-resize-tag")).toBeHidden();
    });

    test("a loop end takes a finger 18 px off it, and needs 12 px before it drags", async ({
        show,
    }) => {
        const { page } = show;
        await ready(page);
        await page.keyboard.press("c");
        const end = page.getByTestId("timeline-loop-end");
        await expect(end).toBeVisible();
        // Moved off the playhead first, from the keyboard, so the two don't overlap
        await end.focus();
        for (let i = 0; i < 6; i++) await end.press("ArrowRight");
        await end.blur();
        const label = await end.getAttribute("aria-label");
        const bar = page.getByTestId("timeline-loop-bar");
        const barEnd = async () => {
            const box = (await bar.boundingBox())!;
            return box.x + box.width;
        };
        const at = {
            x: (await barEnd()) + OFF,
            y: (await bar.boundingBox())!.y + 4,
        };
        // A finger that wobbles 9 px is still a tap
        await touchGesture(page, [
            [at],
            [{ x: at.x + 5, y: at.y }],
            [{ x: at.x + 9, y: at.y }],
        ]);
        await page.waitForTimeout(300);
        expect(await end.getAttribute("aria-label")).toBe(label);
        const before = await barEnd();
        await drag(page, at, 60);
        await expect
            .poll(async () => (await barEnd()) - before)
            .toBeGreaterThan(30);
        expect(await end.getAttribute("aria-label")).not.toBe(label);
    });

    test("the selected clip's ⋯ chip and edges take a finger off their drawn edges", async ({
        show,
    }) => {
        const { page } = show;
        const clip = await splitIntoClip(show);
        await ready(page);
        await clip.scrollIntoViewIfNeeded();
        await tap(page, await centerOf(clip));
        await expect(clip).toHaveAttribute("data-selected", "true");
        const box = (await clip.boundingBox())!;
        const y = box.y + box.height / 2;

        // ⋯: 10 px below its 16 px chip, inside its 44 px area, opens the move's menu
        const chip = (await page
            .getByTestId("timeline-clip-menu-button")
            .boundingBox())!;
        await tap(page, {
            x: chip.x + chip.width / 2,
            y: chip.y + chip.height + 10,
        });
        await expect(page.getByTestId("timeline-clip-menu")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByTestId("timeline-clip-menu")).toBeHidden();

        // The end: 18 px past the clip's end resizes, and brought back writes nothing
        const before = await moveStarts(show.query);
        const f = await finger(page);
        await f.down({ x: box.x + box.width + OFF, y });
        await f.move(40);
        await expect(
            page.getByTestId("timeline-clip-resize-tag"),
        ).toBeVisible();
        await f.move(-40);
        await f.up();
        await expect(page.getByTestId("timeline-clip-resize-tag")).toBeHidden();
        // The start: 18 px before it
        const g = await finger(page);
        await g.down({ x: box.x - OFF, y });
        await g.move(-40);
        await expect(
            page.getByTestId("timeline-clip-resize-tag"),
        ).toBeVisible();
        await g.move(40);
        await g.up();
        await expect(page.getByTestId("timeline-clip-resize-tag")).toBeHidden();
        expect(await moveStarts(show.query)).toEqual(before);
        expect((await clip.boundingBox())!.width).toBeCloseTo(box.width, 0);
    });

    test("a finger's tap 15 px off a keyframe seeks to it, as a tap on it does", async ({
        show,
    }) => {
        const { page } = show;
        await selectMoveMarcher(show);
        await ready(page);
        const selectedEdges = await Promise.all(
            (
                await page
                    .locator(
                        '[data-testid="timeline-page-flag-grip"][data-selected-page]',
                    )
                    .all()
            ).map(centerX),
        );
        const view = (await viewport(page).boundingBox())!;
        // A keyframe in view, away from the selected page's flags (whose grips win)
        const diamonds = page.locator('[data-testid^="timeline-keyframe-"]');
        let target: { x: number; y: number; beat: string } | null = null;
        for (const diamond of await diamonds.all()) {
            const at = await centerOf(diamond);
            if (
                at.x > view.x + 60 &&
                at.x < view.x + view.width - 60 &&
                selectedEdges.every((x) => Math.abs(x - at.x) > 60)
            ) {
                const id = (await diamond.getAttribute("data-testid"))!;
                target = { ...at, beat: id.split("-")[2]! };
                break;
            }
        }
        expect(target, "a keyframe in view").toBeTruthy();
        const testId = `timeline-keyframe-${target!.beat}`;
        const diamond = page.locator(`[data-testid^="${testId}-"]`);
        const before = await playheadAt(page);
        // A tap on the diamond itself seeks to it
        await tap(page, await centerOf(diamond));
        await expect.poll(() => playheadAt(page)).not.toBe(before);
        const onKeyframe = await playheadAt(page);
        await goToPage(page, PAGE_START);
        await expect.poll(() => playheadAt(page)).not.toBe(onKeyframe);
        // In the page box right of it, 15 px off the diamond's drawn edge: that box's tap would
        // put the playhead on the box's own flag instead
        const at = await centerOf(diamond);
        await tap(page, { x: at.x + 20, y: at.y - 6 });
        await expect.poll(() => playheadAt(page)).toBe(onKeyframe);
    });

    test("a finger 18 px above the splitter drags it", async ({ show }) => {
        const { page } = show;
        await ready(page);
        const pane = page.getByTestId("timeline-pane");
        const height = (await pane.boundingBox())!.height;
        const bar = await centerOf(page.getByTestId("timeline-splitter"));
        // It reaches up over the field, never down over the transport bar under it
        expect(
            await page.evaluate(
                ([x, y]) =>
                    document
                        .elementFromPoint(x!, y!)
                        ?.hasAttribute("data-touch-hit") ?? false,
                [bar.x, bar.y + 12],
            ),
        ).toBe(false);
        // Nor over the field's zoom controls, near the field's bottom right corner
        const zoom = page
            .getByTestId("canvas-zoom-slider")
            .locator("xpath=ancestor::div[contains(@class,'bottom-6')][1]");
        const corner = (await zoom.boundingBox())!;
        expect(
            await zoom.evaluate(
                (el, [x, y]) => el.contains(document.elementFromPoint(x!, y!)),
                [corner.x + corner.width / 2, corner.y + corner.height - 3],
            ),
        ).toBe(true);
        await drag(page, { x: bar.x, y: bar.y - OFF }, 0, -60);
        await expect
            .poll(async () => (await pane.boundingBox())!.height - height)
            .toBeGreaterThan(40);
    });
});

// A hold's end (as `hold-reach-back.spec.mts`): pages flag at beats 9, 17, 25
// and 33; T2 moves on page 1 only, and holding page 4 from the previous
// keyframe gives it one Held mark, spec [9, 33), whose end handle sits on page
// 4's flag (view beat 32) under the page row.
// The hold is made with a mouse, then the page becomes a touch screen (the
// seeded show's marchers aren't drawn in the harness when it opens as one).
test.describe("touch layout, a hold's end", () => {
    test.use({
        appSettings: { optOutAnalytics: true, editorMode: "expert" },
        seedSql: [
            ...seedShowSql({
                beats: 40,
                measureStarts: [1, 5, 9, 13, 17, 21, 25, 29, 33, 37],
                pageStarts: [1, 9, 17, 25],
                marchers: [1, 2].map((id) => ({
                    id,
                    section: "Trumpet",
                    prefix: "T",
                    order: id,
                })),
                positions: [
                    [
                        [1, 400, 300],
                        [2, 500, 300],
                    ],
                    [
                        [1, 400, 340],
                        [2, 500, 340],
                    ],
                    [
                        [1, 400, 380],
                        [2, 500, 340],
                    ],
                    [
                        [1, 400, 420],
                        [2, 500, 340],
                    ],
                    [
                        [1, 400, 460],
                        [2, 500, 340],
                    ],
                ],
            }),
            "DELETE FROM timeline_assignments WHERE transition_id IN (2, 3, 4) AND marcher_id = 2",
            "DELETE FROM timeline_slot_destinations WHERE transition_id IN (2, 3, 4) AND slot_index = 1",
            "UPDATE timeline_transitions SET slot_count = 1 WHERE id IN (2, 3, 4)",
            "DELETE FROM timeline_change_log",
        ],
    });

    const marks = async (show: Show) =>
        (
            await show.query<{ start_beat: number; end_beat: number }>(
                "SELECT start_beat, end_beat FROM timeline_held_marks WHERE marcher_id = 2 ORDER BY start_beat",
            )
        ).map((r) => `${r.start_beat}-${r.end_beat}`);

    test("a finger 18 px off a hold's end drags it", async ({ show }) => {
        const { page } = show;
        await waitForField(page);
        await goTo(page, "m9");
        await expect
            .poll(async () => (await drawnMarchers(page)).length)
            .toBe(2);
        await clickMarcher(page, "T2");
        await expect
            .poll(async () => (await readField(page)).selection.length)
            .toBe(1);
        await waitForIdle(page);
        await expect(async () => {
            await pageBox(page, 24).click({ button: "right" });
            await page
                .getByTestId("timeline-range-menu-hold-from-previous")
                .click({ timeout: 1000 });
        }).toPass();
        await expect.poll(() => marks(show)).toEqual(["9-33"]);
        // Taller, so the zoom buttons in the pane's corner sit clear of the ruler
        await tallerTimeline(page);
        await emulateTouchScreen(page);
        await expect(page.locator("html")).toHaveAttribute(
            "data-input",
            "touch",
        );
        const end = page.getByTestId("timeline-hold-end-32");
        await expect(end).toBeAttached();
        const knob = await centerOf(end);
        const before = await playheadAt(page);
        // Left of it, and under the page row (clear of page 4's flag grip): bare ruler, which a
        // finger would scrub
        const f = await finger(page);
        await f.down({ x: knob.x - OFF, y: knob.y + 10 });
        await f.move(-40);
        await expect(
            page.getByTestId("timeline-hold-edge-readout"),
        ).toBeVisible();
        await f.move(40);
        await f.up();
        await expect(
            page.getByTestId("timeline-hold-edge-readout"),
        ).toBeHidden();
        expect(await marks(show)).toEqual(["9-33"]);
        expect(await playheadAt(page), "it didn't scrub").toBe(before);
    });
});

test.describe("mouse layout", () => {
    test.use({
        showFile: SHOW,
        appSettings: { optOutAnalytics: true, editorMode: "expert" },
        allowedPageErrors: [/Audio worklet error/],
        initScript: "localStorage.setItem('openmarch:inputMode', 'mouse');",
    });

    test.beforeEach(async ({ show }) => {
        await waitForField(show.page);
        await goToPage(show.page, PAGE_START);
        await tallerTimeline(show.page);
        await zoomIn(show.page);
    });

    test("no finger hit areas show, and a mouse 18 px off the start flag scrubs, as before", async ({
        show,
    }) => {
        const { page } = show;
        await expect(page.locator("[data-touch-hit]:visible")).toHaveCount(0);
        const y = await bareY(page);
        const flag = await startFlagX(page);
        // Inside the window: a scrub behind the start flag would move it (UI-26)
        const side =
            (await centerX(page.getByTestId("timeline-playhead"))) > flag
                ? 1
                : -1;
        const before = await playheadAt(page);
        await page.mouse.move(flag + side * OFF, y);
        await page.mouse.down();
        await page.mouse.move(flag + side * (OFF + 40), y, { steps: 6 });
        await page.mouse.up();
        await expect.poll(() => playheadAt(page)).not.toBe(before);
        expect(await startFlagX(page)).toBeCloseTo(flag, 0);
    });

    test("a mouse drags a loop end from the first pixel", async ({ show }) => {
        const { page } = show;
        await page.keyboard.press("c");
        const end = page.getByTestId("timeline-loop-end");
        await expect(end).toBeVisible();
        const label = await end.getAttribute("aria-label");
        const box = (await end.boundingBox())!;
        // The handle reaches out past the end: press on it, then move a few pixels
        await page.mouse.move(box.x + 4, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + 4 + 30, box.y + box.height / 2, {
            steps: 3,
        });
        await page.mouse.up();
        await expect.poll(() => end.getAttribute("aria-label")).not.toBe(label);
    });
});
