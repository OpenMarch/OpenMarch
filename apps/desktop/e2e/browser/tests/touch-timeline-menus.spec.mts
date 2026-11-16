import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CDPSession, Locator, Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import { FINGERTIP_WIDTH, drawnMarchers, tap, waitForField } from "../app.mjs";
import { goToPage, pageBox } from "../timeline.mjs";

// The timeline's menus on a tablet (tablet plan 3.4, fork #887). A finger
// can't right-click, so in the touch layout:
// - the selected page box has a "…" chip that opens its full menu: the
//   right-click's entries, with Edit move first (a mouse double-clicks the box
//   for that);
// - a finger held still for half a second and lifted opens the menu a
//   right-click opens there, as on the field. A little jitter still counts; a
//   finger that wanders past the slop drags as before. Where a right-click has
//   no menu (the bare ruler), the press is a slow tap.
// The last test checks that a mouse, in the mouse layout, sees no chip and
// keeps its right-click menu as it was.

const desktop = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
);

// A converted demo show: every page is a move
const SHOW = path.join(desktop, "view3d-web/public/demos/part1-demo.dots");
const PAGE_START = 53;

type Point = { x: number; y: number };

const viewport = (page: Page) => page.getByTestId("timeline-viewport");
const playhead = (page: Page) => page.getByTestId("timeline-playhead");
const playheadAt = (page: Page) => playhead(page).getAttribute("aria-label");
const chip = (page: Page) => page.getByTestId("timeline-page-menu-button");
const rangeMenu = (page: Page) => page.getByTestId("timeline-range-menu");
const bubble = (page: Page) => page.getByTestId("long-press-bubble");
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

/** A taller timeline, zoomed in on the beat-53 page, which is brought into view */
async function ready(page: Page) {
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

/**
 * One finger through CDP, in phases, so the test can hold and wobble it:
 * `down`, `move` (any number), `hold` and `up`.
 */
async function finger(page: Page) {
    const cdp: CDPSession = await page.context().newCDPSession(page);
    const send = (
        type: "touchStart" | "touchMove" | "touchEnd",
        points: Point[],
    ) =>
        cdp.send("Input.dispatchTouchEvent", {
            type,
            touchPoints: points.map((p) => ({
                x: p.x,
                y: p.y,
                radiusX: FINGERTIP_WIDTH / 2,
                radiusY: FINGERTIP_WIDTH / 2,
                force: 1,
                id: 0,
            })),
        });
    let at: Point = { x: 0, y: 0 };
    return {
        async down(point: Point) {
            at = point;
            await send("touchStart", [point]);
        },
        /** Moves by `dx` (and `dy`) in steps */
        async move(dx: number, dy = 0, steps = 4) {
            const from = at;
            for (let i = 1; i <= steps; i++) {
                at = {
                    x: from.x + (dx * i) / steps,
                    y: from.y + (dy * i) / steps,
                };
                await send("touchMove", [at]);
            }
        },
        hold: (ms: number) => page.waitForTimeout(ms),
        async up() {
            await send("touchEnd", []);
            await cdp.detach();
        },
    };
}

/** A long press at `at` whose finger wobbles a few pixels, as a real one does */
async function shakyLongPress(page: Page, at: Point) {
    const f = await finger(page);
    await f.down(at);
    await f.hold(150);
    await f.move(4, 2);
    await f.hold(200);
    await f.move(-6, -3);
    await f.hold(350);
    await f.up();
}

/** Every page's id, in the database */
const pageCount = async (query: Show["query"]) =>
    (await query<{ n: number }>("SELECT COUNT(*) AS n FROM pages"))[0]!.n;

/** Clicks one marcher of the beat-53 move on the field (a mouse: the field isn't under test) */
async function selectMoveMarcher(show: Show) {
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
 * (as `touch-timeline-hit-areas.spec.mts` does); returns the clip.
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

/** Puts the playhead in the middle of the beat-53 page, off its flags, with a tap on the tracks */
async function playheadMidPage(page: Page) {
    const box = (await pageBox(page, PAGE_START).boundingBox())!;
    const before = await playheadAt(page);
    await tap(page, { x: box.x + box.width * 0.4, y: await bareY(page) });
    await expect.poll(() => playheadAt(page)).not.toBe(before);
}

test.describe("touch layout", () => {
    test.use({
        showFile: SHOW,
        appSettings: { optOutAnalytics: true, editorMode: "expert" },
        allowedPageErrors: [/Audio worklet error/],
        touchScreen: true,
        initScript: "localStorage.setItem('openmarch:inputMode', 'touch');",
    });

    test.beforeEach(async ({ show }) => {
        await waitForField(show.page);
        await goToPage(show.page, PAGE_START);
    });

    test("the selected page box's … chip opens its full menu, and Edit move isolates the move", async ({
        show,
    }) => {
        const { page } = show;
        await ready(page);
        // On the selected box only, inside it
        await expect(chip(page)).toHaveCount(1);
        await expect(chip(page)).toBeVisible();
        await expect(chip(page)).toHaveAccessibleName(/options$/);
        const box = (await pageBox(page, PAGE_START).boundingBox())!;
        const at = await centerOf(chip(page));
        expect(at.x).toBeGreaterThan(box.x);
        expect(at.x).toBeLessThan(box.x + box.width);
        // A finger 10 px beside the 18 px chip still takes it (its 44 px area reaches 22 px
        // either side of the chip's middle)
        await tap(page, { x: at.x - 9 - 10, y: at.y });
        await expect(rangeMenu(page)).toBeVisible();
        const entries = rangeMenu(page).getByRole("menuitem");
        await expect(entries.first()).toHaveText("Edit move");
        await expect(
            rangeMenu(page).getByRole("menuitem", {
                name: "Delete page",
                exact: true,
            }),
        ).toBeVisible();
        // The menu that opened under the finger kept nothing pressed: it's still open
        await page.waitForTimeout(300);
        await expect(rangeMenu(page)).toBeVisible();
        await tap(page, await centerOf(entries.first()));
        await expect(page.getByTestId("timeline-isolation-bar")).toBeVisible();
        await expect(rangeMenu(page)).toBeHidden();
    });

    test("a shaky long press on a page box opens its menu, without selecting it, seeking or a hint", async ({
        show,
    }) => {
        const { page } = show;
        await ready(page);
        // The page after the selected one
        const next = page.locator(
            '[data-timeline-range-page][aria-pressed="false"]',
        );
        const box = (await pageBox(page, PAGE_START).boundingBox())!;
        const nextBox = await next.evaluateAll(
            (els, right) =>
                els
                    .map((el) => el.getBoundingClientRect())
                    .find((r) => Math.abs(r.left - right) < 2 && r.width > 40),
            box.x + box.width,
        );
        expect(nextBox, "the next page's box is in view").toBeTruthy();
        const before = await playheadAt(page);
        await shakyLongPress(page, {
            x: nextBox!.left + Math.min(60, nextBox!.width / 2),
            y: nextBox!.top + nextBox!.height / 2,
        });
        await expect(rangeMenu(page)).toBeVisible();
        await expect(rangeMenu(page).getByRole("menuitem").first()).toHaveText(
            "Edit move",
        );
        await expect(bubble(page)).toBeHidden();
        // Still open after the release, the beat-53 page still the selected one
        await page.waitForTimeout(300);
        await expect(rangeMenu(page)).toBeVisible();
        await expect(pageBox(page, PAGE_START)).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        expect(await playheadAt(page)).toBe(before);
        await page.keyboard.press("Escape");
        await expect(rangeMenu(page)).toBeHidden();
    });

    test("a shaky long press on the playhead opens its menu, and Create page at playhead adds a page there", async ({
        show,
    }) => {
        const { page, query } = show;
        await ready(page);
        await playheadMidPage(page);
        const before = await playheadAt(page);
        const pages = await pageCount(query);
        const line = await centerOf(playhead(page));
        await shakyLongPress(page, { x: line.x, y: await bareY(page) });
        const menu = page.getByTestId("timeline-add-page-flag-menu");
        await expect(menu).toBeVisible();
        await expect(bubble(page)).toBeHidden();
        // The wobble never moved the playhead
        expect(await playheadAt(page)).toBe(before);
        await page.waitForTimeout(300);
        await expect(menu).toBeVisible();
        await tap(page, await centerOf(page.getByTestId("timeline-add-page")));
        await expect.poll(() => pageCount(query)).toBe(pages + 1);
        await expect(menu).toBeHidden();
    });

    test("a finger that holds on the playhead and then drags moves it, with no menu", async ({
        show,
    }) => {
        const { page } = show;
        await ready(page);
        await playheadMidPage(page);
        const before = await playheadAt(page);
        const line = await centerOf(playhead(page));
        const f = await finger(page);
        await f.down({ x: line.x, y: await bareY(page) });
        await f.hold(700);
        await f.move(-60, 0, 8);
        await f.up();
        await expect.poll(() => playheadAt(page)).not.toBe(before);
        await page.waitForTimeout(300);
        await expect(
            page.getByTestId("timeline-add-page-flag-menu"),
        ).toBeHidden();
    });

    test("a long press on the bare ruler, which has no menu, is a slow tap: it seeks", async ({
        show,
    }) => {
        const { page } = show;
        await ready(page);
        const header = (await page
            .getByTestId("timeline-pinned-header")
            .boundingBox())!;
        const box = (await pageBox(page, PAGE_START).boundingBox())!;
        const before = await playheadAt(page);
        // The measure row under the page row, 30% into the page, clear of the chip and flags
        await shakyLongPress(page, {
            x: box.x + box.width * 0.3,
            y: header.y + header.height - 5,
        });
        await expect.poll(() => playheadAt(page)).not.toBe(before);
        await page.waitForTimeout(300);
        await expect(rangeMenu(page)).toBeHidden();
        await expect(
            page.getByTestId("timeline-add-page-flag-menu"),
        ).toBeHidden();
    });

    test("a shaky long press on a keyframe opens its menu", async ({
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
            ).map(async (grip) => (await centerOf(grip)).x),
        );
        const view = (await viewport(page).boundingBox())!;
        // A keyframe in view, away from the selected page's flags (whose grips win)
        let target: Point | null = null;
        for (const diamond of await page
            .locator('[data-testid^="timeline-keyframe-"]')
            .all()) {
            const at = await centerOf(diamond);
            if (
                at.x > view.x + 60 &&
                at.x < view.x + view.width - 60 &&
                selectedEdges.every((x) => Math.abs(x - at.x) > 60)
            ) {
                target = at;
                break;
            }
        }
        expect(target, "a keyframe in view").toBeTruthy();
        await shakyLongPress(page, target!);
        await expect(page.getByTestId("timeline-keyframe-menu")).toBeVisible();
        await expect(bubble(page)).toBeHidden();
    });

    test("a finger nearer the playhead than the … chip takes the playhead: a tap opens no menu and a drag scrubs", async ({
        show,
    }) => {
        test.fixme(
            true,
            "#924: the playhead lands on counts, and at CI's zoom none is near enough the chip to build this scene. The rule is pinned by unit tests (the chip's area isn't selected; #916's ranking)",
        );
        const { page } = show;
        await ready(page);
        const chipAt = await centerOf(chip(page));
        const chipLeft = (await chip(page).boundingBox())!.x;
        /**
         * A press inside the chip's 44 px area (within 22 px of its middle) that's nearer the
         * playhead's line than the chip's edge, by a margin, and beside the line rather than on
         * its 12 px button where possible; null when the line is too far
         */
        const pressBeside = (line: number) => {
            const fits = (x: number) =>
                chipAt.x - x < 21 &&
                x < chipLeft &&
                Math.abs(x - line) + 3 < chipLeft - x;
            const xs = Array.from(
                { length: 21 },
                (_, i) => Math.ceil(chipAt.x - 20) + i,
            ).filter(fits);
            return xs.find((x) => Math.abs(x - line) >= 8) ?? xs[0] ?? null;
        };
        // Put the playhead just left of the chip with a tap on the tracks; it lands on a count,
        // so measure where it went, and try again a little further along if that's too far
        let press: Point | null = null;
        for (const offset of [24, 30, 18, 36, 12]) {
            const before = await playheadAt(page);
            await tap(page, { x: chipAt.x - offset, y: await bareY(page) });
            await expect
                .poll(() => playheadAt(page))
                .not.toBe(before)
                .catch(() => {});
            const line = (await centerOf(playhead(page))).x;
            const x = pressBeside(line);
            if (x !== null) {
                press = { x, y: chipAt.y };
                break;
            }
        }
        expect(
            press,
            "a press nearer the playhead than the chip",
        ).not.toBeNull();
        const line = (await centerOf(playhead(page))).x;
        expect(Math.abs(press!.x - line)).toBeLessThan(chipLeft - press!.x);
        expect(chipAt.x - press!.x).toBeLessThan(22);
        await tap(page, press!);
        await page.waitForTimeout(300);
        await expect(rangeMenu(page)).toBeHidden();
        const at = await playheadAt(page);
        const f = await finger(page);
        await f.down(press!);
        await f.move(-80, 0, 8);
        await f.up();
        await expect.poll(() => playheadAt(page)).not.toBe(at);
        await expect(rangeMenu(page)).toBeHidden();
    });

    test("a shaky long press on a move's bar opens the move's menu, with no hint", async ({
        show,
    }) => {
        const { page, query } = show;
        const clip = await splitIntoClip(show);
        await ready(page);
        await clip.evaluate((el) =>
            el.scrollIntoView({ block: "nearest", inline: "center" }),
        );
        const before = await moveStarts(query);
        const box = (await clip.boundingBox())!;
        await shakyLongPress(page, {
            x: box.x + Math.min(30, box.width / 3),
            y: box.y + box.height / 2,
        });
        await expect(page.getByTestId("timeline-move-menu-edit")).toBeVisible();
        await expect(bubble(page)).toBeHidden();
        await page.waitForTimeout(300);
        await expect(page.getByTestId("timeline-move-menu-edit")).toBeVisible();
        // The wobble moved nothing
        expect(await moveStarts(query)).toEqual(before);
    });
});

test.describe("mouse layout", () => {
    test.use({
        showFile: SHOW,
        appSettings: { optOutAnalytics: true, editorMode: "expert" },
        allowedPageErrors: [/Audio worklet error/],
    });

    test("no chip shows, and a right-click on a page box opens its menu as before, without Edit move", async ({
        show,
    }) => {
        const { page } = show;
        await waitForField(page);
        await goToPage(page, PAGE_START);
        await expect(chip(page)).toBeHidden();
        await pageBox(page, PAGE_START).click({ button: "right" });
        await expect(rangeMenu(page)).toBeVisible();
        await expect(
            rangeMenu(page).getByRole("menuitem", {
                name: "Delete page",
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            rangeMenu(page).getByRole("menuitem", { name: "Edit move" }),
        ).toHaveCount(0);
    });
});
