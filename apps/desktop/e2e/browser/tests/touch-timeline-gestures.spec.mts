import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CDPSession, Locator, Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    FINGERTIP_WIDTH,
    drawnMarchers,
    pinch,
    tap,
    touchDrag,
    touchGesture,
    twoFingerPan,
    waitForField,
} from "../app.mjs";
import { goToPage, pageBox } from "../timeline.mjs";

// Fingers on the timeline (tablet plan 3.1, fork #884): the ruler and the page
// row scrub with one finger; on the track body one finger on a clip moves it
// and on empty space pans (a tap seeks); two fingers pan and pinch anywhere; a
// second finger cancels a drag and puts back what it was dragging, and over
// playback it never jumps playback. A finger that lifts off the timeline
// doesn't leave a gesture open. A wobbly tap still selects. A mouse presses as
// it always has (the last test, and every timeline scenario).

const desktop = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
);

// A converted demo show: every page is a move. The move over the page box
// that starts at beat 53 has 4 of the 95 marchers.
test.use({
    showFile: path.join(desktop, "view3d-web/public/demos/part1-demo.dots"),
    appSettings: { optOutAnalytics: true, editorMode: "expert" },
    // The time-stretch worklet (#216) can't load in the harness (see props.spec.mts)
    allowedPageErrors: [/Audio worklet error/],
    // A touch screen, in the touch layout
    touchScreen: true,
    initScript: "localStorage.setItem('openmarch:inputMode', 'touch');",
});

const PAGE_START = 53;

type Point = { x: number; y: number };

const viewport = (page: Page) => page.getByTestId("timeline-viewport");

/** The playhead's spoken position (its accessible name), which changes with its beat */
const playheadAt = (page: Page) =>
    page.getByTestId("timeline-playhead").getAttribute("aria-label");

const scroll = (page: Page) =>
    viewport(page).evaluate((el) => ({
        left: el.scrollLeft,
        max: el.scrollWidth - el.clientWidth,
        width: el.scrollWidth,
    }));

const centerOf = async (locator: Locator): Promise<Point> => {
    const box = (await locator.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** The clock's time while playing, in seconds (`playback.spec.mts` reads it the same way) */
const clockSeconds = (page: Page) =>
    page.evaluate(() => {
        const clock = [...document.querySelectorAll("span.font-mono")]
            .map((span) => span.textContent ?? "")
            .find((text) => /^\d\d:\d\d\.\d{3}$/.test(text));
        const [minutes, seconds] = (clock ?? "NaN:NaN").split(":");
        return Number(minutes) * 60 + Number(seconds);
    });

/** The space under the pinned ruler and page row, and above the scrollbar */
async function trackBody(page: Page) {
    const view = (await viewport(page).boundingBox())!;
    const header = (await page
        .getByTestId("timeline-pinned-header")
        .boundingBox())!;
    return { top: header.y + header.height, bottom: view.y + view.height - 18 };
}

/**
 * Makes the timeline pane taller with its splitter, from the keyboard, so the
 * track body under the ruler is on screen in the harness's window.
 */
async function tallerTimeline(page: Page) {
    const splitter = page.getByTestId("timeline-splitter");
    await splitter.focus();
    for (let i = 0; i < 6; i++) await splitter.press("Shift+ArrowUp");
    await expect
        .poll(async () => {
            const { top, bottom } = await trackBody(page);
            return bottom - top;
        }, "the track body is on screen")
        .toBeGreaterThan(80);
    await splitter.blur();
}

/**
 * Zooms the timeline in with the mouse (Ctrl+wheel) until it can scroll
 * sideways, then brings the beat-53 page box back into view.
 */
async function zoomIn(page: Page) {
    const at = await centerOf(viewport(page));
    await page.mouse.move(at.x, at.y);
    await page.keyboard.down("Control");
    for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -100);
    await page.keyboard.up("Control");
    await expect
        .poll(async () =>
            viewport(page).evaluate(
                (el) => el.scrollWidth > el.clientWidth * 1.5,
            ),
        )
        .toBe(true);
    await pageBox(page, PAGE_START).scrollIntoViewIfNeeded();
}

/** A pan of 200 px the way the timeline has room to scroll: content left (later) or right */
async function roomyPan(page: Page) {
    const { left, max } = await scroll(page);
    expect(max, "the timeline scrolls sideways").toBeGreaterThan(250);
    return max - left > 250 ? -200 : 200;
}

/**
 * A point on bare track space: in the track body, away from the playhead's
 * line, and clear of any clip.
 */
async function bareTrack(page: Page): Promise<Point> {
    const view = (await viewport(page).boundingBox())!;
    const { top, bottom } = await trackBody(page);
    expect(bottom - top, "the track body is on screen").toBeGreaterThan(40);
    const playhead = await centerOf(page.getByTestId("timeline-playhead"));
    const x =
        Math.abs(playhead.x - (view.x + view.width / 3)) > 80
            ? view.x + view.width / 3
            : view.x + (view.width * 2) / 3;
    // Near the bottom: clip rows stack from the top of the body
    return { x, y: bottom - 12 };
}

/**
 * A point on the bare ruler: the measure row under the page boxes, in the
 * middle of the beat-53 page box's span.
 */
async function bareRuler(page: Page): Promise<Point> {
    const box = (await pageBox(page, PAGE_START).boundingBox())!;
    const header = (await page
        .getByTestId("timeline-pinned-header")
        .boundingBox())!;
    const y = (box.y + box.height + header.y + header.height) / 2;
    expect(header.y + header.height - (box.y + box.height)).toBeGreaterThan(8);
    return { x: box.x + box.width / 2, y };
}

/**
 * Touches the screen through CDP in phases, so the test can look in between.
 * `to` puts the fingers at `points` (finger `i` is the same finger every time;
 * one past the fingers down lands, and a finger left out lifts), and `end`
 * lifts them all.
 */
async function fingers(page: Page) {
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
    let down = 0;
    return {
        async to(...points: Point[]) {
            await send(
                points.length > down
                    ? "touchStart"
                    : points.length < down
                      ? "touchEnd"
                      : "touchMove",
                points,
            );
            down = points.length;
        },
        /** Drags the first finger from `from` by `dx` in `steps` moves */
        async drag(from: Point, dx: number, steps = 8) {
            for (let i = 1; i <= steps; i++)
                await this.to({ x: from.x + (dx * i) / steps, y: from.y });
        },
        async end() {
            await send("touchEnd", []);
            await cdp.detach();
        },
    };
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

/**
 * Splits one marcher of the beat-53 move into a new move, which has a clip
 * (as `split-merge-moves.spec.mts` does); returns the clip.
 */
async function splitIntoClip(show: Show): Promise<Locator> {
    const { page, query } = show;
    const before = await moveStarts(query);
    // The beat-53 move's marchers: stored by beat id, one more than the view beat
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
    expect(members.length).toBeGreaterThan(1);
    const marcher = (await drawnMarchers(page)).find(
        (m) => members.includes(m.id) && m.onScreen,
    );
    expect(marcher, "a member of the move is on screen").toBeTruthy();
    await page.mouse.click(marcher!.screen.x, marcher!.screen.y);
    await expect
        .poll(() => page.evaluate(() => window.fieldTest!.selection()))
        .toEqual([marcher!.id]);
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
    return clip;
}

/** Where an element's left edge rests, once it has stopped moving (a split clip drops into place) */
async function settledLeft(locator: Locator): Promise<number> {
    let last = Number.NaN;
    await expect
        .poll(async () => {
            const x = (await locator.boundingBox())!.x;
            const still = Math.abs(x - last) < 0.5;
            last = x;
            return still;
        })
        .toBe(true);
    await locator.page().waitForTimeout(300);
    return (await locator.boundingBox())!.x;
}

/** A finger's tap that wobbles `by` px before it lifts: still a tap for a finger */
const wobblyTap = (page: Page, at: Point, by: number) =>
    touchGesture(page, [
        [at],
        [{ x: at.x + by / 2, y: at.y }],
        [{ x: at.x + by, y: at.y }],
    ]);

// The timeline pane is made taller in each test (`tallerTimeline`), after a clip test's split:
// the taller pane leaves a shorter field, with the move's marchers off its bottom
test.beforeEach(async ({ show }) => {
    await waitForField(show.page);
    await goToPage(show.page, PAGE_START);
});

test("one finger on bare track space pans the timeline and leaves the playhead", async ({
    show,
}) => {
    const { page } = show;
    await tallerTimeline(page);
    await zoomIn(page);
    const before = await playheadAt(page);
    const dx = await roomyPan(page);
    const from = await bareTrack(page);
    const start = await scroll(page);
    await touchDrag(page, from, { x: from.x + dx, y: from.y });
    await expect
        .poll(async () => Math.abs((await scroll(page)).left - start.left))
        .toBeGreaterThan(150);
    expect(await playheadAt(page)).toBe(before);
});

test("a finger's tap on bare track space moves the playhead there, as a click does", async ({
    show,
}) => {
    const { page } = show;
    await tallerTimeline(page);
    const before = await playheadAt(page);
    const start = await scroll(page);
    await tap(page, await bareTrack(page));
    await expect.poll(() => playheadAt(page)).not.toBe(before);
    expect((await scroll(page)).left).toBe(start.left);
});

test("one finger along the page row scrubs the playhead", async ({ show }) => {
    const { page } = show;
    await tallerTimeline(page);
    const before = await playheadAt(page);
    const box = await centerOf(pageBox(page, PAGE_START));
    const start = await scroll(page);
    await touchDrag(page, box, { x: box.x + 120, y: box.y });
    await expect.poll(() => playheadAt(page)).not.toBe(before);
    // It scrubbed; it didn't pan
    expect((await scroll(page)).left).toBe(start.left);
});

test("two fingers pan anywhere, the page row too, without scrubbing", async ({
    show,
}) => {
    const { page } = show;
    await tallerTimeline(page);
    await zoomIn(page);
    const before = await playheadAt(page);
    const dx = await roomyPan(page);
    const start = await scroll(page);
    const box = await centerOf(pageBox(page, PAGE_START));
    await twoFingerPan(page, box, { x: dx, y: 0 });
    await expect
        .poll(async () => Math.abs((await scroll(page)).left - start.left))
        .toBeGreaterThan(150);
    expect(await playheadAt(page)).toBe(before);
});

test("two fingers pinch the timeline's zoom", async ({ show }) => {
    const { page } = show;
    await tallerTimeline(page);
    const before = await playheadAt(page);
    const width = (await scroll(page)).width;
    const at = await bareTrack(page);
    await pinch(page, at, { from: 30, to: 150 });
    await expect
        .poll(async () => (await scroll(page)).width)
        .toBeGreaterThan(width * 2);
    expect(await playheadAt(page)).toBe(before);
});

test("a second finger cancels a finger's scrub on the page row and puts the playhead back", async ({
    show,
}) => {
    const { page } = show;
    await tallerTimeline(page);
    const before = await playheadAt(page);
    const box = await centerOf(pageBox(page, PAGE_START));
    const touch = await fingers(page);
    await touch.to(box);
    await touch.drag(box, 120);
    await expect.poll(() => playheadAt(page)).not.toBe(before);
    // A second finger lands, and the two move a little
    await touch.to(
        { x: box.x + 120, y: box.y },
        { x: box.x + 260, y: box.y + 40 },
    );
    await touch.to(
        { x: box.x + 110, y: box.y },
        { x: box.x + 250, y: box.y + 40 },
    );
    await touch.end();
    await expect.poll(() => playheadAt(page)).toBe(before);
});

test("a second finger cancels a finger's scrub on the bare ruler and puts the playhead back", async ({
    show,
}) => {
    const { page } = show;
    await tallerTimeline(page);
    const before = await playheadAt(page);
    const at = await bareRuler(page);
    const touch = await fingers(page);
    await touch.to(at);
    await touch.drag(at, -120);
    await expect.poll(() => playheadAt(page)).not.toBe(before);
    await touch.to({ x: at.x - 120, y: at.y }, { x: at.x + 40, y: at.y + 40 });
    await touch.to({ x: at.x - 110, y: at.y }, { x: at.x + 50, y: at.y + 40 });
    await touch.end();
    await expect.poll(() => playheadAt(page)).toBe(before);
});

test("two fingers on the bare ruler over playback don't jump playback", async ({
    show,
}) => {
    const { page } = show;
    await tallerTimeline(page);
    const view = (await viewport(page).boundingBox())!;
    const ruler = await bareRuler(page);
    // Near the end of the show: a jump there would put the clock well ahead of where it plays.
    // (The harness can't load the demo's audio worklet, so the clock may not run at all; what
    // matters is that it never jumps.)
    const at = { x: view.x + view.width - 120, y: ruler.y };
    // Space plays from the timeline (a focused page box would take it as a click)
    await viewport(page).focus();
    await page.keyboard.press("Space");
    // Playing: the readout shows the cursor's time, not the playhead's (`timelineTransport`)
    await page.waitForTimeout(300);
    const playing = await clockSeconds(page);
    expect(Number.isFinite(playing), "the clock is shown").toBe(true);
    await twoFingerPan(page, at, { x: -30, y: 0 }, { steps: 4 });
    await page.waitForTimeout(400);
    // From where it was: within the time that passed, never at the touched count
    expect(await clockSeconds(page)).toBeLessThan(playing + 3);
    await page.keyboard.press("Space");
});

test("a finger that lifts off the timeline leaves no gesture behind", async ({
    show,
}) => {
    const { page } = show;
    await tallerTimeline(page);
    const box = await centerOf(pageBox(page, PAGE_START));
    const field = await centerOf(page.getByTestId("fieldCanvas").first());
    const touch = await fingers(page);
    await touch.to(box);
    await touch.drag(box, 60);
    // A second finger lands and lifts again, then the first slides onto the field and lifts there
    await touch.to(
        { x: box.x + 60, y: box.y },
        { x: box.x + 200, y: box.y + 30 },
    );
    await touch.to({ x: box.x + 60, y: box.y });
    await touch.to({ x: box.x + 60, y: (box.y + field.y) / 2 });
    await touch.to(field);
    await touch.end();
    // A new finger along the page row scrubs again: nothing swallowed it
    const before = await playheadAt(page);
    const again = await centerOf(pageBox(page, PAGE_START));
    await touchDrag(page, again, { x: again.x - 150, y: again.y });
    await expect.poll(() => playheadAt(page)).not.toBe(before);
});

test("a wobbly tap still selects a page box", async ({ show }) => {
    const { page } = show;
    await tallerTimeline(page);
    const box = page
        .locator(
            `[data-timeline-range-page]:not([data-timeline-range-start="${PAGE_START}"])`,
        )
        .nth(2);
    await expect(box).toHaveAttribute("aria-pressed", "false");
    await wobblyTap(page, await centerOf(box), 9);
    await expect(box).toHaveAttribute("aria-pressed", "true");
});

// The split marcher has moves on the pages either side, so any re-time of its clip overlaps
// them and the app refuses it (E-A3): the finger drags the clip, then brings it back
test("one finger on a clip drags it", async ({ show }) => {
    const { page, query } = show;
    const clip = await splitIntoClip(show);
    await tallerTimeline(page);
    const before = await moveStarts(query);
    const left = await settledLeft(clip);
    const playhead = await playheadAt(page);
    const from = await centerOf(clip);
    const touch = await fingers(page);
    await touch.to(from);
    await touch.drag(from, 120);
    // The clip follows the finger
    await expect
        .poll(async () => (await clip.boundingBox())!.x)
        .toBeGreaterThan(left + 40);
    // Brought back to where it started, it's let go there: nothing to save
    await touch.drag({ x: from.x + 120, y: from.y }, -120);
    await touch.end();
    await expect
        .poll(async () => (await clip.boundingBox())!.x)
        .toBeCloseTo(left, 0);
    expect(await moveStarts(query)).toEqual(before);
    // The finger moved the clip, not the playhead
    expect(await playheadAt(page)).toBe(playhead);
});

test("a wobbly tap still selects a clip, and moves nothing", async ({
    show,
}) => {
    const { page, query } = show;
    const clip = await splitIntoClip(show);
    await tallerTimeline(page);
    // Something else selected first
    await goToPage(page, PAGE_START);
    await expect(clip).toHaveAttribute("data-selected", "false");
    const before = await moveStarts(query);
    await wobblyTap(page, await centerOf(clip), 9);
    await expect(clip).toHaveAttribute("data-selected", "true");
    expect(await moveStarts(query)).toEqual(before);
});

test("a second finger cancels a clip's move and puts it back, with nothing saved", async ({
    show,
}) => {
    const { page, query } = show;
    const clip = await splitIntoClip(show);
    await tallerTimeline(page);
    const before = await moveStarts(query);
    const left = (await settledLeft(clip)) + (await scroll(page)).left;
    const from = await centerOf(clip);
    const touch = await fingers(page);
    await touch.to(from);
    await touch.drag(from, 120);
    await expect
        .poll(
            async () =>
                (await clip.boundingBox())!.x + (await scroll(page)).left,
        )
        .toBeGreaterThan(left + 40);
    await touch.to(
        { x: from.x + 120, y: from.y },
        { x: from.x + 260, y: from.y - 40 },
    );
    await touch.to(
        { x: from.x + 110, y: from.y },
        { x: from.x + 250, y: from.y - 40 },
    );
    await touch.end();
    // Back where it was in the show: the two fingers may have panned the view since
    await expect
        .poll(
            async () =>
                (await clip.boundingBox())!.x + (await scroll(page)).left,
        )
        .toBeCloseTo(left, 0);
    expect(await moveStarts(query)).toEqual(before);
});

test("a mouse drag on bare track space still scrubs", async ({ show }) => {
    const { page } = show;
    await tallerTimeline(page);
    const before = await playheadAt(page);
    const from = await bareTrack(page);
    const start = await scroll(page);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 150, from.y, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => playheadAt(page)).not.toBe(before);
    expect((await scroll(page)).left).toBe(start.left);
});
