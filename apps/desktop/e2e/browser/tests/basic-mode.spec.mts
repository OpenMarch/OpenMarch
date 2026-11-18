import type { Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    clickMarcher,
    dragFrom,
    dragMarcher,
    drawnMarchers,
    expectCanvasMatchesShow,
    goTo,
    readField,
    selectPage,
    waitForField,
    waitForIdle,
} from "../app.mjs";
import { fieldGrid, savedPositions } from "../positions.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";

// Basic mode's core flows (UI-19, docs/timeline/research/basic-mode): Basic is a
// UI over the same timeline data as Expert. An edit at a page flag edits that
// page; an edit at a mid-page count splits the marcher's move there and keeps
// the page's end; a marcher whose moves on a page aren't simple is locked there,
// with a toast offering Switch to Expert; + past the last flag adds a page and
// Split page splits the moves at the new flag; switching modes keeps the data.
//
// Pages flag at beats 9, 17 and 25 (measures 3, 5 and 7), four beats a
// measure, and the music runs on to beat 32. T1 and T2 move on every page. T3
// moves on page 1 only and holds through pages 2 and 3 (UI-18: no move of its
// own there).

const HOME: SeedPosition[] = [
    [1, 400, 300],
    [2, 500, 300],
    [3, 600, 300],
];
const PAGE_1: SeedPosition[] = [
    [1, 400, 340],
    [2, 500, 340],
    [3, 600, 340],
];
const PAGE_2: SeedPosition[] = [
    [1, 400, 380],
    [2, 500, 380],
    [3, 600, 380],
];
const PAGE_3: SeedPosition[] = [
    [1, 400, 420],
    [2, 500, 420],
    [3, 600, 420],
];

const SHOW = {
    beats: 32,
    measureStarts: [1, 5, 9, 13, 17, 21, 25, 29],
    pageStarts: [1, 9, 17],
    marchers: [1, 2, 3].map((id) => ({
        id,
        section: "Trumpet",
        prefix: "T",
        order: id,
    })),
    positions: [HOME, PAGE_1, PAGE_2, PAGE_3],
};

/** T3 (slot 2, the last) has no move over pages 2 and 3: it holds page 1's spot */
const T3_HOLDS = [
    "DELETE FROM timeline_assignments WHERE transition_id IN (2, 3) AND marcher_id = 3",
    "DELETE FROM timeline_slot_destinations WHERE transition_id IN (2, 3) AND slot_index = 2",
    "UPDATE timeline_transitions SET slot_count = 2 WHERE id IN (2, 3)",
];

/** T3 walks one move from page 2's start to page 3's flag: it crosses page 2's flag */
const T3_CROSSES_FLAG = [
    ...T3_HOLDS,
    "INSERT INTO timelines (id, start_beat, end_beat) VALUES (10, 9, 25)",
    `INSERT INTO timeline_transitions (id, timeline_id, slot_count, start_beat, end_beat)
     VALUES (10, 10, 1, 9, 25)`,
    "INSERT INTO timeline_slot_destinations (transition_id, slot_index, x, y) VALUES (10, 0, 600, 420)",
    `INSERT INTO timeline_assignments (marcher_id, transition_id, slot_index, start_beat, end_beat)
     VALUES (3, 10, 0, 9, 25)`,
];

const BASIC = { optOutAnalytics: true, editorMode: "basic" };
const EXPERT = { optOutAnalytics: true, editorMode: "expert" };

test.use({
    appSettings: BASIC,
    seedSql: [
        ...seedShowSql(SHOW),
        ...T3_HOLDS,
        "DELETE FROM timeline_change_log",
    ],
    // A refused edit (a locked marcher) is logged as well as shown; the box
    // tool's time-stretch worklet can't load in the harness (see props.spec.mts)
    // (one pattern: a two-item array would read as a fixture tuple)
    allowedPageErrors: [/TimelineEditRefusedError|Audio worklet error/],
});

/** Each marcher's saved spot on page `pageId`'s flag, as "x,y" by drill number. */
const spots = async (show: Show, pageId: number) =>
    Object.fromEntries(
        (await savedPositions(show, pageId)).map((p) => [
            `T${p.id}`,
            `${Math.round(p.x)},${Math.round(p.y)}`,
        ]),
    );

const asSpots = (rows: readonly SeedPosition[]) =>
    Object.fromEntries(rows.map(([id, x, y]) => [`T${id}`, `${x},${y}`]));

/** Every page's flag spots, home (page 0) first. */
const allSpots = async (show: Show) => {
    const pages = await show.query<{ id: number }>(
        "SELECT id FROM pages ORDER BY start_beat",
    );
    const out: Record<string, Record<string, string>> = {};
    for (const { id } of pages) out[`page ${id}`] = await spots(show, id);
    return out;
};

/** One marcher's stored moves, as "start-end" in show beats. */
const moves = async (show: Show, marcherId: number) =>
    (
        await show.query<{ start_beat: number; end_beat: number }>(
            "SELECT start_beat, end_beat FROM timeline_assignments WHERE marcher_id = ? ORDER BY start_beat",
            marcherId,
        )
    ).map((r) => `${r.start_beat}-${r.end_beat}`);

/** The page flags' start beats. */
const pageStarts = async (show: Show) =>
    (
        await show.query<{ start_beat: number }>(
            "SELECT start_beat FROM pages ORDER BY start_beat",
        )
    ).map((r) => r.start_beat);

/** How many undo steps the show has. */
const undoSteps = async (show: Show) => {
    const [row] = await show.query<{ count: number }>(
        "SELECT COUNT(DISTINCT history_group) AS count FROM history_undo",
    );
    return row.count;
};

const drawnSpot = async (page: Page, drillNumber: string) => {
    const m = (await drawnMarchers(page)).find(
        (d) => d.drillNumber === drillNumber,
    )!;
    return `${Math.round(m.x)},${Math.round(m.y)}`;
};

/**
 * Waits for the show to be drawn, then moves the playhead with Go to. On a
 * flag, also waits for the field to match the file there (`savedPositions` is
 * the page's end, so mid-page it can't).
 */
async function openAt(show: Show, where: string, { onFlag = true } = {}) {
    const { page } = show;
    await waitForField(page);
    await expect.poll(async () => (await drawnMarchers(page)).length).toBe(3);
    await goTo(page, where);
    await expect(page.getByTestId("timeline-readout")).toContainText(where);
    if (onFlag) await expectCanvasMatchesShow(show);
    await waitForIdle(page);
}

async function undo(page: Page) {
    await waitForIdle(page);
    await page.keyboard.press("ControlOrMeta+z");
}

/** Runs the palette's Basic/Expert switch, which names the mode it switches to. */
async function switchModeFromPalette(page: Page, to: "Basic" | "Expert") {
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByPlaceholder("Search commands…").fill(`Switch to ${to}`);
    await expect(
        page.getByRole("option", { name: new RegExp(`^Switch to ${to} \\(`) }),
    ).toBeVisible();
    await page.keyboard.press("Enter");
    await expectMode(page, to);
}

/** Basic draws its page box bodies; Expert doesn't. */
async function expectMode(page: Page, mode: "Basic" | "Expert") {
    await expect(page.getByTestId("timeline-basic-bodies")).toHaveCount(
        mode === "Basic" ? 1 : 0,
    );
}

/** The Basic lock toast (`toastBasicLock`), in either of its wordings. */
const lockToast = (page: Page) =>
    page.locator("[data-sonner-toast]", { hasText: /uses? Expert moves/ });

test("a drag at a page flag moves the marcher on that page only, and one Undo restores it", async ({
    show,
}) => {
    const { page } = show;
    // Page 2's flag
    await openAt(show, "m5");
    await expectMode(page, "Basic");
    const before = await allSpots(show);
    expect(before["page 2"]).toEqual({
        ...asSpots(PAGE_2),
        T3: "600,340",
    });

    await dragMarcher(page, "T1", { x: 40, y: -30 });
    await expect
        .poll(async () => (await spots(show, 2)).T1)
        .not.toBe(before["page 2"].T1);
    await expectCanvasMatchesShow(show);
    const after = await allSpots(show);
    // Only T1 on page 2 changed: page 1, page 3 (T1 has a move of its own
    // there) and the others are untouched
    expect(after["page 1"]).toEqual(before["page 1"]);
    expect(after["page 3"]).toEqual(before["page 3"]);
    expect({ ...after["page 2"], T1: "" }).toEqual({
        ...before["page 2"],
        T1: "",
    });
    // Still one move on page 2: the flag edit set that move's end
    expect(await moves(show, 1)).toEqual(["1-9", "9-17", "17-25"]);

    await undo(page);
    await expect.poll(() => allSpots(show)).toEqual(before);
    await expectCanvasMatchesShow(show);
});

test("a drag at a mid-page count splits the move there, shows a tick and keeps the page's end; one Undo restores it", async ({
    show,
}) => {
    const { page } = show;
    // Count 4 of page 2 (beat 13)
    await openAt(show, "m4", { onFlag: false });
    const before = await allSpots(show);
    await clickMarcher(page, "T1");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([1]);
    // No mid-page position yet
    await expect(page.getByTestId("basic-point-tick")).toHaveCount(0);
    const midBefore = await drawnSpot(page, "T1");

    await dragMarcher(page, "T1", { x: 40, y: -30 });
    await expect
        .poll(() => moves(show, 1))
        .toEqual(["1-9", "9-13", "13-17", "17-25"]);
    // Drawn where it was dropped at the count, and the page's end is kept
    await expect.poll(() => drawnSpot(page, "T1")).not.toBe(midBefore);
    expect(await allSpots(show)).toEqual(before);
    // A tick at the new position, on page 2's count 4
    await expect(page.getByTestId("basic-point-tick")).toHaveCount(1);
    await expect(page.getByTestId("basic-point-tick")).toHaveAccessibleName(
        "Position at count 4 of page 2",
    );

    await undo(page);
    await expect.poll(() => moves(show, 1)).toEqual(["1-9", "9-17", "17-25"]);
    await expect(page.getByTestId("basic-point-tick")).toHaveCount(0);
    await expect.poll(() => drawnSpot(page, "T1")).toBe(midBefore);
    expect(await allSpots(show)).toEqual(before);
});

test("a mid-page tick's Remove this count's position merges the two moves back; one Undo restores the split", async ({
    show,
}) => {
    const { page } = show;
    await openAt(show, "m4", { onFlag: false });
    const before = await allSpots(show);
    await clickMarcher(page, "T1");
    await dragMarcher(page, "T1", { x: 40, y: -30 });
    await expect
        .poll(() => moves(show, 1))
        .toEqual(["1-9", "9-13", "13-17", "17-25"]);
    await waitForIdle(page);

    // Off the tick's count first: there the playhead covers the tick (see
    // the test.fail below)
    await goTo(page, "m5");
    await page.getByTestId("basic-point-tick").click({ button: "right" });
    await page
        .getByRole("menuitem", { name: "Remove this count's position" })
        .click();
    await expect.poll(() => moves(show, 1)).toEqual(["1-9", "9-17", "17-25"]);
    await expect(page.getByTestId("basic-point-tick")).toHaveCount(0);
    expect(await allSpots(show)).toEqual(before);

    await undo(page);
    await expect
        .poll(() => moves(show, 1))
        .toEqual(["1-9", "9-13", "13-17", "17-25"]);
    await expect(page.getByTestId("basic-point-tick")).toHaveCount(1);
});

// App bug: right after a mid-page edit the playhead sits on the new tick's
// count, and the playhead's button (z-50, `timeline-playhead` in
// TimelinePrimitives.tsx) covers the tick (z-20, TimelineBasicPoints in
// TimelineBasicLayers.tsx). A right-click there opens the playhead's menu
// (Create page / subset at playhead), with no Remove this count's
// position, so the point can't be removed without moving the playhead.
test.fail(
    "right after a mid-page edit, a right-click on the tick under the playhead offers Remove this count's position",
    async ({ show }) => {
        const { page } = show;
        await openAt(show, "m4", { onFlag: false });
        await clickMarcher(page, "T1");
        await dragMarcher(page, "T1", { x: 40, y: -30 });
        await expect(page.getByTestId("basic-point-tick")).toHaveCount(1);
        await waitForIdle(page);

        await page
            .getByTestId("basic-point-tick")
            .click({ button: "right", timeout: 3000 });
        await expect(
            page.getByRole("menuitem", {
                name: "Remove this count's position",
            }),
        ).toBeVisible({ timeout: 3000 });
    },
);

test("+ past the last flag adds a page ending at the playhead; one Undo removes it", async ({
    show,
}) => {
    const { page } = show;
    // Measure 8 (beat 29), past page 3's flag at beat 25
    await openAt(show, "m8");
    const before = await allSpots(show);
    expect(await pageStarts(show)).toEqual([0, 1, 9, 17]);

    await page.getByTestId("timeline-append-at-playhead").click();
    await expect.poll(() => pageStarts(show)).toEqual([0, 1, 9, 17, 25]);
    // The new page ends at the playhead: 4 counts
    await expect
        .poll(async () => {
            const [row] = await show.query<{ last_page_counts: number }>(
                "SELECT last_page_counts FROM utility",
            );
            return row.last_page_counts;
        })
        .toBe(4);
    // Nobody moves on it: everyone holds page 3's spot
    const pages = await show.query<{ id: number }>(
        "SELECT id FROM pages WHERE start_beat = 25",
    );
    expect(await spots(show, pages[0].id)).toEqual(before["page 3"]);
    await expectCanvasMatchesShow(show);

    await undo(page);
    await expect.poll(() => pageStarts(show)).toEqual([0, 1, 9, 17]);
    expect(await allSpots(show)).toEqual(before);
});

test("Split page splits each move at the new flag, keeping every flag's spots; one Undo restores it", async ({
    show,
}) => {
    const { page } = show;
    await openAt(show, "m5");
    const before = await allSpots(show);
    await selectPage(show, "Page 2");

    await page.getByRole("button", { name: "Split page" }).click();
    await expect.poll(() => pageStarts(show)).toEqual([0, 1, 9, 13, 17]);
    // T1 and T2's page 2 moves split at the new flag (beat 13); T3 holds
    await expect
        .poll(() => moves(show, 1))
        .toEqual(["1-9", "9-13", "13-17", "17-25"]);
    expect(await moves(show, 2)).toEqual(["1-9", "9-13", "13-17", "17-25"]);
    expect(await moves(show, 3)).toEqual(["1-9"]);
    // No move crosses the new flag, so nobody is locked
    await expect(page.getByTestId("basic-expert-mark")).toHaveCount(0);
    // The old flags keep their spots: page 2 (id 2) now ends on the new
    // flag, halfway along its old move, and the new page (from beat 13)
    // ends on page 2's old flag
    const [split] = await show.query<{ id: number }>(
        "SELECT id FROM pages WHERE start_beat = 13",
    );
    const after = await allSpots(show);
    expect(after["page 1"]).toEqual(before["page 1"]);
    expect(after[`page ${split.id}`]).toEqual(before["page 2"]);
    expect(after["page 3"]).toEqual(before["page 3"]);
    expect(after["page 2"]).toEqual({
        T1: "400,360",
        T2: "500,360",
        T3: "600,340",
    });

    await undo(page);
    await expect.poll(() => pageStarts(show)).toEqual([0, 1, 9, 17]);
    await expect.poll(() => moves(show, 1)).toEqual(["1-9", "9-17", "17-25"]);
    expect(await allSpots(show)).toEqual(before);
});

test.describe("Basic mode, a marcher with a move across a page flag", () => {
    test.use({
        seedSql: [
            ...seedShowSql(SHOW),
            ...T3_CROSSES_FLAG,
            "DELETE FROM timeline_change_log",
        ],
    });

    test("is locked: a drag is refused with a toast, nothing is written, and Switch to Expert switches mode", async ({
        show,
    }) => {
        const { page } = show;
        await openAt(show, "m5");
        // Pages 2 and 3 carry the Expert mark: T3's move crosses page 2's flag
        await expect(page.getByTestId("basic-expert-mark")).toHaveCount(2);
        const before = await allSpots(show);
        const steps = await undoSteps(show);
        const t3 = await drawnSpot(page, "T3");

        await dragMarcher(page, "T3", { x: 40, y: -30 });
        await expect(lockToast(page)).toBeVisible();
        // One dragged marcher is worded as one, as the lock toast is
        // (`basicLockedRefusal`), not as a group
        await expect(lockToast(page)).toContainText(
            "One marcher uses Expert moves on this page. Switch to Expert to edit it.",
        );
        // It snaps back and nothing is saved
        await expect.poll(() => drawnSpot(page, "T3")).toBe(t3);
        await waitForIdle(page);
        expect(await allSpots(show)).toEqual(before);
        expect(await moves(show, 3)).toEqual(["1-9", "9-25"]);
        expect(await undoSteps(show)).toBe(steps);

        // Another marcher on the same page is still editable
        await dragMarcher(page, "T1", { x: 40, y: -30 });
        await expect
            .poll(async () => (await spots(show, 2)).T1)
            .not.toBe(before["page 2"].T1);

        // The toast's action switches to Expert, where T3 can be edited
        await dragMarcher(page, "T3", { x: 40, y: -30 });
        await expect(lockToast(page)).toBeVisible();
        await lockToast(page)
            .getByRole("button", { name: "Switch to Expert" })
            .click();
        await expectMode(page, "Expert");
        await expect(page.getByTestId("basic-expert-mark")).toHaveCount(0);
    });

    test("is locked mid-page too: a drag at a count inside the page is refused with the toast", async ({
        show,
    }) => {
        const { page } = show;
        await openAt(show, "m4", { onFlag: false });
        const before = await allSpots(show);
        const steps = await undoSteps(show);

        await dragMarcher(page, "T3", { x: 40, y: -30 });
        await expect(lockToast(page)).toBeVisible();
        await waitForIdle(page);
        expect(await moves(show, 3)).toEqual(["1-9", "9-25"]);
        expect(await allSpots(show)).toEqual(before);
        expect(await undoSteps(show)).toBe(steps);
    });

    test("Split page still splits the page and the simple marchers' moves, and leaves the locked move as it was; one Undo restores it", async ({
        show,
    }) => {
        const { page } = show;
        await openAt(show, "m5");
        const before = await allSpots(show);
        await selectPage(show, "Page 2");

        await page.getByRole("button", { name: "Split page" }).click();
        await expect.poll(() => pageStarts(show)).toEqual([0, 1, 9, 13, 17]);
        await expect
            .poll(() => moves(show, 1))
            .toEqual(["1-9", "9-13", "13-17", "17-25"]);
        // T3's Expert move isn't Basic's to change
        expect(await moves(show, 3)).toEqual(["1-9", "9-25"]);
        const [split] = await show.query<{ id: number }>(
            "SELECT id FROM pages WHERE start_beat = 13",
        );
        const after = await allSpots(show);
        expect(after[`page ${split.id}`]).toEqual(before["page 2"]);
        expect(after["page 3"]).toEqual(before["page 3"]);

        await undo(page);
        await expect.poll(() => pageStarts(show)).toEqual([0, 1, 9, 17]);
        await expect
            .poll(() => moves(show, 1))
            .toEqual(["1-9", "9-17", "17-25"]);
        expect(await allSpots(show)).toEqual(before);
    });
});

test.describe("Basic mode, sparse positions (UI-18)", () => {
    test("a marcher with no move on a page holds; a drag on the flag gives it a move there that later pages follow; one Undo restores it", async ({
        show,
    }) => {
        const { page } = show;
        await openAt(show, "m5");
        // T3 holds page 1's spot through pages 2 and 3, shown Not defined
        // there, and is editable (no Expert mark)
        const before = await allSpots(show);
        expect(before["page 2"].T3).toBe("600,340");
        expect(before["page 3"].T3).toBe("600,340");
        await expect(page.getByTestId("basic-expert-mark")).toHaveCount(0);
        const notDefined = async () =>
            (await drawnMarchers(page))
                .filter((m) => m.notDefined)
                .map((m) => m.drillNumber);
        await expect.poll(notDefined).toEqual(["T3"]);

        await dragMarcher(page, "T3", { x: 40, y: -30 });
        await expect.poll(() => moves(show, 3)).toEqual(["1-9", "9-17"]);
        const after = await allSpots(show);
        expect(after["page 2"].T3).not.toBe("600,340");
        // Page 3 had no move of its own for T3: it follows the new spot
        expect(after["page 3"].T3).toBe(after["page 2"].T3);
        expect(after["page 1"]).toEqual(before["page 1"]);
        await expectCanvasMatchesShow(show);
        await expect.poll(notDefined).toEqual([]);

        await undo(page);
        await expect.poll(() => moves(show, 3)).toEqual(["1-9"]);
        expect(await allSpots(show)).toEqual(before);
        await expect.poll(notDefined).toEqual(["T3"]);
    });

    test("a drag mid-page inside a hold sets a position there and keeps the flag's spot; one Undo restores it", async ({
        show,
    }) => {
        const { page } = show;
        // Count 4 of page 2 (beat 13), inside T3's hold
        await openAt(show, "m4", { onFlag: false });
        const before = await allSpots(show);

        await clickMarcher(page, "T3");
        await expect
            .poll(async () => (await readField(page)).selection)
            .toEqual([3]);
        await dragMarcher(page, "T3", { x: 40, y: -30 });
        // [9, 13) to the drop, [13, 17) back to the held spot
        await expect
            .poll(() => moves(show, 3))
            .toEqual(["1-9", "9-13", "13-17"]);
        expect(await allSpots(show)).toEqual(before);
        await expect(page.getByTestId("basic-point-tick")).toHaveCount(1);
        await expect.poll(() => drawnSpot(page, "T3")).not.toBe("600,340");

        await undo(page);
        await expect.poll(() => moves(show, 3)).toEqual(["1-9"]);
        expect(await allSpots(show)).toEqual(before);
        await expect(page.getByTestId("basic-point-tick")).toHaveCount(0);
    });
});

/** Field point `p` on screen, from where the marchers are drawn. */
async function toScreen(page: Page, p: { x: number; y: number }) {
    const [marcher] = await drawnMarchers(page);
    const { zoom } = (await readField(page)).viewport;
    return {
        x: marcher.screen.x + (p.x - marcher.x) * zoom,
        y: marcher.screen.y + (p.y - marcher.y) * zoom,
    };
}

/**
 * Selects everyone, opens the box tool, draws a box 10 steps wide and 6 deep
 * left of center front (as box-tool.spec's drawBox), and places it with Enter.
 */
async function placeBox(show: Show) {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([1, 2, 3]);
    await page.keyboard.press("b");
    await expect(page.getByTestId("shape-tool-hint")).toBeVisible();
    const from = await toScreen(page, { x: cf.x - 15 * S, y: cf.y - 25 * S });
    const to = await toScreen(page, { x: cf.x - 5 * S, y: cf.y - 19 * S });
    await dragFrom(page, from, { x: to.x - from.x, y: to.y - from.y });
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
    await waitForIdle(page);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await waitForIdle(page);
}

/** Every page's flag, by Go to measure, with what's drawn checked against the file. */
const FLAGS = ["m3", "m5", "m7"];

async function expectCanvasMatchesAtEveryFlag(show: Show) {
    for (const flag of FLAGS) {
        // From home: in Expert a seek behind the start flag makes that beat the
        // start flag and leaves the playhead on the old one (UI-26)
        await show.page.keyboard.press("Home");
        await goTo(show.page, flag);
        await expect(show.page.getByTestId("timeline-readout")).toContainText(
            flag,
        );
        await expectCanvasMatchesShow(show);
    }
}

test.describe("switching modes", () => {
    test.use({ appSettings: EXPERT });

    test("on a show with a hold and a shape, Basic → Expert → Basic keeps every page flag's positions", async ({
        show,
    }) => {
        const { page } = show;
        // Expert: place a box on page 3 for everyone. T3, holding since page
        // 1, gets a move there; it still holds on page 2
        await openAt(show, "m7");
        await expectMode(page, "Expert");
        await selectPage(show, "Page 3");
        await placeBox(show);
        await expect
            .poll(async () => (await spots(show, 3)).T1)
            .not.toBe("400,420");
        const withShape = await allSpots(show);
        expect(withShape["page 2"].T3).toBe("600,340");
        expect(await moves(show, 3)).toEqual(["1-9", "17-25"]);
        const rows = await show.query(
            "SELECT marcher_id, start_beat, end_beat FROM timeline_assignments ORDER BY marcher_id, start_beat",
        );

        await switchModeFromPalette(page, "Basic");
        expect(await allSpots(show)).toEqual(withShape);
        await expectCanvasMatchesAtEveryFlag(show);
        // A box placed inside one page is simple (its moves have no
        // transition shape, only a recipe): nobody is locked
        await expect(page.getByTestId("basic-expert-mark")).toHaveCount(0);

        await switchModeFromPalette(page, "Expert");
        expect(await allSpots(show)).toEqual(withShape);
        await expectCanvasMatchesAtEveryFlag(show);

        await switchModeFromPalette(page, "Basic");
        expect(await allSpots(show)).toEqual(withShape);
        await expectCanvasMatchesAtEveryFlag(show);
        // Switching wrote nothing
        expect(
            await show.query(
                "SELECT marcher_id, start_beat, end_beat FROM timeline_assignments ORDER BY marcher_id, start_beat",
            ),
        ).toEqual(rows);
    });
});
