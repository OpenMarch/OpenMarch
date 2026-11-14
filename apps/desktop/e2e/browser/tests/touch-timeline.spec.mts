import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CDPSession, Locator, Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    FINGERTIP_WIDTH,
    multiFingerTap,
    tap,
    touchGesture,
    twoFingerPan,
    waitForField,
} from "../app.mjs";
import { emptyField, goToPage, pageBox } from "../timeline.mjs";

// The rest of upstream's touch-timeline.spec.mts (tablet plan 3.6, fork #889),
// mapped onto the fork's timeline: a finger drags the selected page's flag and
// the counts change, and a second finger cancels that drag; a tap on the
// selected page opens no menu; the delete toast's Undo takes a slow finger, and
// closes once a later edit makes it stale; the ± buttons zoom about the playhead,
// or about the middle when it's off screen; the "…" Compact turns the thin
// timeline on and off; + Add N-Count Page takes a finger; a two-finger tap
// undoes one edit, and quick Undo presses are all kept. Cases already covered
// elsewhere (touch-timeline-gestures, -zoom, -hit-areas, touch-transport) aren't
// repeated. The page's "…" chip and the menus it opens are #887's.

const desktop = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
);

// A converted demo show: every page is a move
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
/** Stored beat positions are one more than the timeline's view beats */
const STORED_START = PAGE_START + 1;

type Point = { x: number; y: number };

const viewport = (page: Page) => page.getByTestId("timeline-viewport");
const playheadAt = (page: Page) =>
    page.getByTestId("timeline-playhead").getAttribute("aria-label");

const centerOf = async (locator: Locator): Promise<Point> => {
    const box = (await locator.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

const tapOn = async (page: Page, locator: Locator) =>
    tap(page, await centerOf(locator));

/** Every page's start, in order (the stored beat positions) */
const pageStarts = async (show: Show) =>
    (
        await show.query<{ start: number }>(
            `SELECT beats.position AS start
               FROM pages INNER JOIN beats ON beats.id = pages.start_beat
              ORDER BY beats.position`,
        )
    ).map((row) => row.start);

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

/** Zooms in with Ctrl+wheel, so the beat-53 page box is wide, and centers it in view */
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

/**
 * Touches the screen through CDP in phases, so the test can look in between.
 * `to` puts the fingers at `points` (finger `i` is the same finger every time;
 * one more than are down lands, and one left out lifts), and `end` lifts them all.
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
        async end() {
            await send("touchEnd", []);
            await cdp.detach();
        },
    };
}

/**
 * The selected page's end flag grip, after a tap on bare track space moves the
 * playhead into the page (a line on a flag wins the press, UI-21).
 */
async function endGrip(page: Page): Promise<Point> {
    const grips = page.locator(
        '[data-testid="timeline-page-flag-grip"][data-selected-page]',
    );
    await expect(grips).toHaveCount(2);
    const [a, b] = await Promise.all(
        [0, 1].map(async (i) => (await grips.nth(i).boundingBox())!),
    );
    const box = (await pageBox(page, PAGE_START).boundingBox())!;
    const playhead = await playheadAt(page);
    await tap(page, { x: box.x + box.width / 2, y: await bareY(page) });
    await expect.poll(() => playheadAt(page)).not.toBe(playhead);
    const end = a!.x > b!.x ? a! : b!;
    return { x: end.x + end.width / 2, y: end.y + end.height / 2 };
}

/** Opens the touch transport's "…" panel */
async function openMore(page: Page) {
    await tapOn(page, page.getByTestId("timeline-touch-more"));
    const panel = page.getByTestId("timeline-touch-more-panel");
    await expect(panel).toBeVisible();
    return panel;
}

/** Adds a page at the playhead with the "…" panel's New page, `counts` counts on */
async function addPageAtPlayhead(show: Show, counts: number) {
    const { page } = show;
    const before = (await pageStarts(show)).length;
    const panel = await openMore(page);
    for (let i = 0; i < counts; i++)
        await tapOn(page, panel.getByTestId("timeline-touch-next-beat"));
    await tapOn(page, panel.getByTestId("timeline-touch-add-page"));
    await expect(panel).toBeHidden();
    await expect
        .poll(async () => (await pageStarts(show)).length)
        .toBe(before + 1);
}

/** Deletes the beat-53 page with its moves, from its menu (a right-click: the touch menu is #887's) */
async function deletePage(show: Show) {
    const { page } = show;
    const before = (await pageStarts(show)).length;
    await expect(async () => {
        await pageBox(page, PAGE_START).click({ button: "right" });
        await page
            .getByTestId("timeline-range-menu-delete-with-moves")
            .click({ timeout: 1000 });
    }).toPass();
    await expect
        .poll(async () => (await pageStarts(show)).length)
        .toBe(before - 1);
    const toast = page
        .locator("[data-sonner-toast]")
        .filter({ hasText: "Deleted Page" });
    await expect(toast).toBeVisible();
    // Let it finish sliding in before aiming at it
    await page.waitForTimeout(600);
    return toast;
}

// The first touch after the page loads can take most of a second to arrive,
// which would read as a long press: touch an empty part of the transport row first
test.beforeEach(async ({ show }) => {
    const { page } = show;
    await waitForField(page);
    await goToPage(page, PAGE_START);
    const readout = (await page.getByTestId("timeline-readout").boundingBox())!;
    await tap(page, {
        x: readout.x + readout.width + 24,
        y: readout.y + readout.height / 2,
    });
});

test("a finger drags the selected page's end flag, and the next page starts earlier", async ({
    show,
}) => {
    const { page } = show;
    await ready(page);
    const before = await pageStarts(show);
    const index = before.indexOf(STORED_START);
    expect(index, "the beat-53 page is stored").toBeGreaterThanOrEqual(0);
    const grip = await endGrip(page);
    const f = await fingers(page);
    await f.to(grip);
    for (let i = 1; i <= 8; i++) await f.to({ x: grip.x - i * 6, y: grip.y });
    await expect(page.getByTestId("timeline-page-flag-readout")).toBeVisible();
    await f.end();
    await expect.poll(() => pageStarts(show)).not.toEqual(before);
    const after = await pageStarts(show);
    // Only the flag after the beat-53 page moved, and earlier
    expect(after).toHaveLength(before.length);
    expect(after[index]).toBe(STORED_START);
    expect(after[index + 1]).toBeLessThan(before[index + 1]);
    expect(after.slice(index + 2)).toEqual(before.slice(index + 2));
});

test("a second finger cancels a page flag drag, and the pages stay", async ({
    show,
}) => {
    const { page } = show;
    await ready(page);
    const before = await pageStarts(show);
    const width = (await pageBox(page, PAGE_START).boundingBox())!.width;
    const grip = await endGrip(page);
    const f = await fingers(page);
    await f.to(grip);
    for (let i = 1; i <= 6; i++) await f.to({ x: grip.x - i * 6, y: grip.y });
    await expect(page.getByTestId("timeline-page-flag-readout")).toBeVisible();
    // A second finger lands beside it, and both slide on
    const second = { x: grip.x + 100, y: grip.y };
    for (let i = 0; i <= 6; i++)
        await f.to(
            { x: grip.x - 36 - i * 6, y: grip.y },
            { x: second.x - i * 6, y: second.y },
        );
    await f.end();
    await expect(page.getByTestId("timeline-page-flag-readout")).toBeHidden();
    await page.waitForTimeout(500);
    expect(await pageStarts(show)).toEqual(before);
    expect((await pageBox(page, PAGE_START).boundingBox())!.width).toBeCloseTo(
        width,
        0,
    );
});

test("a finger's tap on the selected page's box opens no menu, and the page stays selected", async ({
    show,
}) => {
    const { page } = show;
    const selected = await page.evaluate(() => window.fieldTest!.pageId());
    const box = (await pageBox(page, PAGE_START).boundingBox())!;
    await tap(page, { x: box.x + 30, y: box.y + box.height / 2 });
    await page.waitForTimeout(400);
    await expect(page.locator('[role="menu"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.fieldTest!.pageId())).toBe(
        selected,
    );
});

const pageChip = (page: Page) => page.getByTestId("timeline-page-menu-button");
const rangeMenu = (page: Page) => page.getByTestId("timeline-range-menu");

test("a finger's tap on the selected page's … chip opens the page menu", async ({
    show,
}) => {
    const { page } = show;
    await expect(pageChip(page)).toHaveCount(1);
    await tapOn(page, pageChip(page));
    await expect(rangeMenu(page)).toBeVisible();
    await expect(
        rangeMenu(page).getByTestId("timeline-range-menu-edit-move"),
    ).toBeVisible();
    await expect(
        rangeMenu(page).getByTestId("timeline-range-menu-delete-flag"),
    ).toBeVisible();
    // Still open once the finger is up
    await page.waitForTimeout(400);
    await expect(page.locator('[role="menu"]')).toHaveCount(1);
});

test("a two-finger pan that lands on the selected page's … chip doesn't open its menu", async ({
    show,
}) => {
    const { page } = show;
    await expect(pageChip(page)).toHaveCount(1);
    await twoFingerPan(page, await centerOf(pageChip(page)), {
        x: -160,
        y: 0,
    });
    await page.waitForTimeout(400);
    await expect(page.locator('[role="menu"]')).toHaveCount(0);
});

test("a long press inside the page menu doesn't open a second menu", async ({
    show,
}) => {
    const { page } = show;
    await tapOn(page, pageChip(page));
    await expect(rangeMenu(page)).toBeVisible();
    await page.waitForTimeout(400);
    // On the menu's own padding, above its first entry: a long press on an entry would pick it
    const box = (await rangeMenu(page).boundingBox())!;
    await touchGesture(page, [[{ x: box.x + box.width / 2, y: box.y + 2 }]], {
        holdMs: 800,
    });
    await page.waitForTimeout(400);
    await expect(page.locator('[role="menu"]')).toHaveCount(1);
    await expect(rangeMenu(page)).toBeVisible();
    await expect(page.getByTestId("long-press-bubble")).toBeHidden();
});

test("a slow finger tap on the delete toast's Undo puts the page back", async ({
    show,
}) => {
    const { page } = show;
    const before = await pageStarts(show);
    const toast = await deletePage(show);
    // Held longer than a quick tap, shorter than a long press
    await touchGesture(
        page,
        [[await centerOf(toast.getByRole("button", { name: "Undo" }))]],
        { holdMs: 350 },
    );
    await expect.poll(() => pageStarts(show)).toEqual(before);
});

test("a later edit closes the delete toast, so its Undo can't undo that edit", async ({
    show,
}) => {
    const { page } = show;
    await tallerTimeline(page);
    const before = await pageStarts(show);
    const toast = await deletePage(show);
    // Another edit: a page at the playhead, from the touch transport
    await addPageAtPlayhead(show, 3);
    await expect(toast).toBeHidden();
    expect(await pageStarts(show)).toHaveLength(before.length);
});

test("the ± buttons zoom about the playhead in view, and about the middle once it's off screen", async ({
    show,
}) => {
    const { page } = show;
    await ready(page);
    const zoomIn = page.getByTestId("timeline-touch-zoom-in");
    const zoomOut = page.getByTestId("timeline-touch-zoom-out");
    const playheadX = async () =>
        (await centerOf(page.getByTestId("timeline-playhead"))).x;

    // In view, the playhead stays where it is
    const at = await playheadX();
    await tapOn(page, zoomOut);
    await page.waitForTimeout(400);
    expect(await playheadX()).toBeCloseTo(at, -1);
    await tapOn(page, zoomIn);
    await page.waitForTimeout(400);
    expect(await playheadX()).toBeCloseTo(at, -1);

    // Scrolled so the playhead is off screen, the beat in the middle stays in the middle
    const view = (await viewport(page).boundingBox())!;
    await viewport(page).evaluate((el, x) => {
        el.style.scrollBehavior = "auto";
        const line = document
            .querySelector('[data-testid="timeline-playhead"]')!
            .getBoundingClientRect();
        // Away from the playhead, by more than the view is wide
        const by = line.left - x > el.clientWidth / 2 ? 1 : -1;
        el.scrollLeft = by > 0 ? 0 : el.scrollWidth;
    }, view.x);
    await page.waitForTimeout(200);
    const off = await playheadX();
    expect(
        off < view.x || off > view.x + view.width,
        "the playhead is off screen",
    ).toBe(true);
    const middle = await viewport(page).evaluate(
        (el) => el.getBoundingClientRect().left + el.clientWidth / 2,
    );
    // The page box whose start is nearest the middle, by its start beat
    const start = await page.evaluate((m) => {
        const boxes = [
            ...document.querySelectorAll<HTMLElement>(
                "[data-timeline-range-page]",
            ),
        ];
        boxes.sort(
            (a, b) =>
                Math.abs(a.getBoundingClientRect().left - m) -
                Math.abs(b.getBoundingClientRect().left - m),
        );
        return boxes[0]!.dataset.timelineRangeStart!;
    }, middle);
    const box = pageBox(page, Number(start));
    const x = (await box.boundingBox())!.x;
    await tapOn(page, zoomIn);
    // + doubles the zoom about the middle
    await expect
        .poll(async () => (await box.boundingBox())!.x)
        .toBeCloseTo(middle + (x - middle) * 2, -1);
});

test('the "…" Compact makes the timeline a thin strip, and back', async ({
    show,
}) => {
    const { page } = show;
    const pane = page.getByTestId("timeline-pane");
    const full = (await pane.boundingBox())!.height;
    let panel = await openMore(page);
    await expect(panel.getByTestId("timeline-compact")).toHaveAttribute(
        "aria-pressed",
        "false",
    );
    await tapOn(page, panel.getByTestId("timeline-compact"));
    // The panel closes on the change, as the row's other view toggles do
    await expect(panel).toBeHidden();
    await expect
        .poll(async () => (await pane.boundingBox())!.height)
        .toBeLessThan(full);
    panel = await openMore(page);
    await expect(panel.getByTestId("timeline-compact")).toHaveAttribute(
        "aria-pressed",
        "true",
    );
    await tapOn(page, panel.getByTestId("timeline-compact"));
    await expect
        .poll(async () => (await pane.boundingBox())!.height)
        .toBeCloseTo(full, 0);
});

/** Puts the paused playhead a few counts past the last page, where + Add N-Count Page shows */
async function pastTheEnd(page: Page) {
    const panel = await openMore(page);
    await tapOn(page, panel.getByTestId("timeline-touch-last"));
    for (let i = 0; i < 4; i++)
        await tapOn(page, panel.getByTestId("timeline-touch-next-beat"));
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    const add = page.getByTestId("timeline-append-at-playhead");
    await expect(add).toBeVisible();
    return add;
}

test("a finger's tap on + Add N-Count Page past the last page adds the page", async ({
    show,
}) => {
    const { page } = show;
    const before = await pageStarts(show);
    const add = await pastTheEnd(page);
    // Scrolled so the pill has room on the playhead's right, clear of the last flag (#920)
    await viewport(page).evaluate((el) => {
        el.style.scrollBehavior = "auto";
        el.scrollLeft += 400;
    });
    await expect(add).toHaveClass(/\bleft-8\b/);
    await tapOn(page, add);
    await expect
        .poll(async () => (await pageStarts(show)).length)
        .toBe(before.length + 1);
});

// Flipped to the playhead's left, the pill sits over the last flag, whose hit area
// is painted under it: the pill keeps the tap (#920)
test("+ Add N-Count Page takes a finger where it sits over the last flag", async ({
    show,
}) => {
    const { page } = show;
    const before = await pageStarts(show);
    const add = await pastTheEnd(page);
    await expect(add).toHaveClass(/\bright-8\b/);
    await tapOn(page, add);
    await expect
        .poll(async () => (await pageStarts(show)).length)
        .toBe(before.length + 1);
});

// The pill is drawn 16 px tall, in a 44 px-tall button in the touch layout (#920)
test("+ Add N-Count Page is finger sized in the touch layout", async ({
    show,
}) => {
    const { page } = show;
    const box = (await (await pastTheEnd(page)).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
});

test("a two-finger tap on the field undoes one edit, not two", async ({
    show,
}) => {
    const { page } = show;
    const before = (await pageStarts(show)).length;
    await addPageAtPlayhead(show, 3);
    await addPageAtPlayhead(show, 2);
    const at = await emptyField(page);
    await multiFingerTap(page, { x: at.x + 40, y: at.y + 20 }, 2);
    await expect
        .poll(async () => (await pageStarts(show)).length)
        .toBe(before + 1);
    await expect(page.getByText("Undone", { exact: true })).toBeVisible();
    await page.waitForTimeout(500);
    expect(await pageStarts(show)).toHaveLength(before + 1);
});

test("quick Undo presses in the touch layout are all kept", async ({
    show,
}) => {
    const { page } = show;
    const before = (await pageStarts(show)).length;
    await addPageAtPlayhead(show, 3);
    await addPageAtPlayhead(show, 2);
    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(async () => (await pageStarts(show)).length).toBe(before);
});
