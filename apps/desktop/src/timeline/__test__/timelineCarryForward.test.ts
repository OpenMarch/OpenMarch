import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { transactionWithHistory } from "@/db-functions/history";
import {
    moveMarchersInTarget,
    type TimelineMarcherMove,
} from "@/db-functions/timelineMoves";
import { deleteTimelinesInTransaction } from "@/db-functions/timelines";
import type Page from "@/global/classes/Page";
import {
    useTimelineSelectionStore,
    type PageBox,
} from "@/stores/TimelineSelectionStore";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import {
    convertPagesToTimeline,
    readShowTiming,
} from "../convert/writePageConversion";
import {
    editCarryForward,
    marcherCarry,
    summarizeCarryForward,
    type CarrySpan,
} from "../timelineCarryForward";
import { neighborPageTarget } from "../timelineCoordinateWrites";
import {
    keepPassedFlagsAsStops,
    toastPassThrough,
} from "../timelinePassThrough";
import { pageFlags } from "../timelinePlayhead";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "../timelineStore";

/**
 * Carry-forward (docs/timeline/ui.md UI-18, defined-coordinates 07c §6–7): an edit that moves
 * marchers who hold through later pages also moves those pages, up to where every carried marcher
 * stops. No toast says so (defined-coordinates 08): an ordinary edit shows none.
 */

const hold = (start: number, end: number): CarrySpan => ({
    start,
    end,
    kind: "hold",
});
const own = (start: number, end: number): CarrySpan => ({
    start,
    end,
    kind: "founding",
});

// Page 1 is home; each box is named after the page whose flag ends it
const BOXES: PageBox[] = [
    { start: 0, end: 8, name: "2" },
    { start: 8, end: 16, name: "3" },
    { start: 16, end: 24, name: "4" },
    { start: 24, end: 32, name: "5" },
    { start: 32, end: 40, name: "6" },
];
const FLAGS = BOXES.map((b) => b.end);

describe("one marcher's carry-forward", () => {
    it("runs over every later flag it holds through, to the show's end", () => {
        expect(
            marcherCarry(
                [hold(-Infinity, 0), own(0, 8), hold(8, Infinity)],
                8,
                FLAGS,
            ),
        ).toEqual({ flags: [16, 24, 32, 40], stop: null });
    });

    it("stops at the flag where its next own move ends, which it doesn't change", () => {
        const spans = [
            hold(-Infinity, 0),
            own(0, 8),
            hold(8, 24),
            own(24, 32),
            hold(32, Infinity),
        ];
        expect(marcherCarry(spans, 8, FLAGS)).toEqual({
            flags: [16, 24],
            stop: 32,
        });
    });

    it("carries nowhere when its next own move ends on the next flag", () => {
        const spans = [own(0, 8), own(8, 16), hold(16, Infinity)];
        expect(marcherCarry(spans, 8, FLAGS)).toEqual({ flags: [], stop: 16 });
    });

    it("changes a flag a later long move passes, and stops after it", () => {
        // The next move starts on Page 4's flag and passes Page 5's: both are moved
        const spans = [own(0, 8), hold(8, 16), own(16, 40)];
        expect(marcherCarry(spans, 8, FLAGS)).toEqual({
            flags: [16, 24, 32],
            stop: 40,
        });
    });

    it("stops at the first flag after a next move that ends between flags", () => {
        const spans = [own(0, 8), hold(8, 20), own(20, 28), hold(28, Infinity)];
        expect(marcherCarry(spans, 8, FLAGS)).toEqual({
            flags: [16, 24],
            stop: 32,
        });
    });

    it("from home, runs to its first own move", () => {
        const spans = [hold(-Infinity, 16), own(16, 24), hold(24, Infinity)];
        expect(marcherCarry(spans, 0, FLAGS)).toEqual({
            flags: [8, 16],
            stop: 24,
        });
    });
});

describe("the carry-forward summary", () => {
    it("names one page, or a range, and where they all stop", () => {
        expect(
            summarizeCarryForward([{ flags: [16], stop: 24 }], BOXES),
        ).toEqual({ first: "3", last: "3", stop: "4" });
        expect(
            summarizeCarryForward(
                [
                    { flags: [16, 24], stop: 32 },
                    { flags: [16, 24], stop: 32 },
                ],
                BOXES,
            ),
        ).toEqual({ first: "3", last: "4", stop: "5" });
    });

    it("leaves out the stop when the marchers stop at different pages, or one runs to the end", () => {
        expect(
            summarizeCarryForward(
                [
                    { flags: [16], stop: 24 },
                    { flags: [16, 24, 32], stop: 40 },
                ],
                BOXES,
            ),
        ).toEqual({ first: "3", last: "5" });
        expect(
            summarizeCarryForward(
                [
                    { flags: [16], stop: 24 },
                    { flags: [16, 24, 32, 40], stop: null },
                ],
                BOXES,
            ),
        ).toEqual({ first: "3", last: "6" });
    });

    it("ignores marchers that carry nowhere, and says nothing when none carry", () => {
        expect(
            summarizeCarryForward(
                [
                    { flags: [], stop: 16 },
                    { flags: [16], stop: 24 },
                ],
                BOXES,
            ),
        ).toEqual({ first: "3", last: "3", stop: "4" });
        expect(summarizeCarryForward([{ flags: [], stop: 16 }], BOXES)).toBe(
            null,
        );
        expect(summarizeCarryForward([], BOXES)).toBeNull();
    });
});

// The tests below write their own timeline rows and start the resolver themselves
keepFixturesInPageMode("its tests write timeline rows themselves");

afterEach(() => {
    stopTimelineResolver();
    useTimelineSelectionStore.getState().reset();
    vi.restoreAllMocks();
});

const HOMES: TimelineMarcherMove[] = [
    { marcherId: 1, x: 100, y: 100 },
    { marcherId: 2, x: 150, y: 100 },
    { marcherId: 3, x: 200, y: 100 },
];

/**
 * The `marchersAndPages` show with no timeline rows, so marchers hold on their homes through
 * every page (as a show built with the **+** flag does); the page boxes are in the selection
 * store, as the timeline panel keeps them. Returns pages in show order and their boxes.
 */
const setUp = async (db: DbConnection) => {
    await convertPagesToTimeline(db);
    await transactionWithHistory(db, "clearTimelines", async (tx) => {
        const ids = (
            await tx
                .select({ id: schema.timelines.id })
                .from(schema.timelines)
                .all()
        ).map((r) => r.id);
        await deleteTimelinesInTransaction({ tx, timelineIds: new Set(ids) });
    });
    await moveMarchersInTarget({ db, target: { kind: "home" }, moves: HOMES });
    await startTimelineResolver(db);
    const { pages } = await readShowTiming(db);
    const sorted = [...pages].sort((a, b) => a.order - b.order);
    const boxes = pageFlags(sorted).flatMap((f) =>
        f.range ? [{ ...f.range, name: f.page.name }] : [],
    );
    useTimelineSelectionStore.getState().setPageBoxes(boxes);
    return { pages: sorted, boxes };
};

const box = (page: Page) => {
    const target = neighborPageTarget(page);
    if (target.kind !== "range") throw new Error("not a page box");
    return target;
};

/** A range edit, then what it carried forward. */
const edit = async (
    db: DbConnection,
    boxes: readonly PageBox[],
    range: { start: number; end: number },
    moves: TimelineMarcherMove[],
) => {
    const target = { kind: "range" as const, ...range };
    const result = await moveMarchersInTarget({ db, target, moves });
    await timelineResolverSettled();
    const summary = editCarryForward(
        useTimelineResolverStore.getState().resolver!,
        target,
        result,
        boxes,
    );
    return { result, target, summary };
};

describeDbTests("carry-forward, from the resolver", (it) => {
    it("owner scenario: editing page 2 with pages 3–4 inherited also moves pages 3–4, up to page 5's own move", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { pages, boxes } = await setUp(db);
        await edit(db, boxes, box(pages[5]!), [{ marcherId: 1, x: 50, y: 50 }]);
        const { summary } = await edit(db, boxes, box(pages[2]!), [
            { marcherId: 1, x: 300, y: 300 },
        ]);
        expect(summary).toEqual({
            first: pages[3]!.name,
            last: pages[4]!.name,
            stop: pages[5]!.name,
        });
    });

    it("with no later move of its own, runs to the show's end and names no stop", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { pages, boxes } = await setUp(db);
        expect(boxes.at(-1)!.end).toBe(box(pages.at(-1)!).end);
        const { summary } = await edit(db, boxes, box(pages[2]!), [
            { marcherId: 1, x: 300, y: 300 },
        ]);
        expect(summary).toEqual({
            first: pages[3]!.name,
            last: pages.at(-1)!.name,
        });
    });

    it("names where it stops when every carried marcher stops at the same page", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { pages, boxes } = await setUp(db);
        await edit(db, boxes, box(pages[4]!), [
            { marcherId: 1, x: 50, y: 50 },
            { marcherId: 2, x: 60, y: 60 },
        ]);
        const { summary } = await edit(db, boxes, box(pages[2]!), [
            { marcherId: 1, x: 300, y: 300 },
            { marcherId: 2, x: 310, y: 300 },
        ]);
        expect(summary).toEqual({
            first: pages[3]!.name,
            last: pages[3]!.name,
            stop: pages[4]!.name,
        });
    });

    it("leaves the stop out when the marchers stop at different pages", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { pages, boxes } = await setUp(db);
        // Marcher 1 has its own page 4, marcher 2 its own page 5
        await edit(db, boxes, box(pages[4]!), [{ marcherId: 1, x: 50, y: 50 }]);
        await edit(db, boxes, box(pages[5]!), [{ marcherId: 2, x: 60, y: 60 }]);
        const { summary } = await edit(db, boxes, box(pages[2]!), [
            { marcherId: 1, x: 300, y: 300 },
            { marcherId: 2, x: 310, y: 300 },
        ]);
        expect(summary).toEqual({
            first: pages[3]!.name,
            last: pages[4]!.name,
        });
    });

    it("counts only the marchers the edit moved (a partial selection)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { pages, boxes } = await setUp(db);
        // Marcher 1 owns page 3, so it carries nowhere; marcher 3 isn't moved at all
        await edit(db, boxes, box(pages[3]!), [{ marcherId: 1, x: 50, y: 50 }]);
        await edit(db, boxes, box(pages[4]!), [{ marcherId: 2, x: 70, y: 70 }]);
        const { summary } = await edit(db, boxes, box(pages[2]!), [
            { marcherId: 1, x: 300, y: 300 },
            { marcherId: 2, x: 310, y: 300 },
            // Already there: written nowhere, so not counted
            { marcherId: 3, x: 200, y: 100 },
        ]);
        // Only marcher 2 carries: page 3, stopping at its own page 4
        expect(summary).toEqual({
            first: pages[3]!.name,
            last: pages[3]!.name,
            stop: pages[4]!.name,
        });
        // Every marcher owning the next page: nothing to say
        const none = await edit(db, boxes, box(pages[2]!), [
            { marcherId: 1, x: 320, y: 320 },
        ]);
        expect(none.summary).toBeNull();
    });

    it("an edit on the last page carries nowhere", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { pages, boxes } = await setUp(db);
        const { summary } = await edit(db, boxes, box(pages.at(-1)!), [
            { marcherId: 1, x: 300, y: 300 },
        ]);
        expect(summary).toBeNull();
    });

    it("a window passing a flag says only that its page is no longer a stop, with Keep as a stop", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { pages, boxes } = await setUp(db);
        await edit(db, boxes, box(pages[5]!), [{ marcherId: 1, x: 50, y: 50 }]);
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        const page2 = box(pages[2]!);
        const page3 = box(pages[3]!);
        const window = { start: page2.start, end: page3.end };
        const target = { kind: "range" as const, ...window };
        const result = await moveMarchersInTarget({
            db,
            target,
            moves: [{ marcherId: 1, x: 300, y: 300 }],
        });
        expect(result.passThrough).toBeDefined();
        toastPassThrough(result);
        expect(info).toHaveBeenCalledTimes(1);
        const [message, options] = info.mock.calls[0]!;
        // No marcher names, and nothing about the pages it carried into
        expect(message).toBe(`Page ${pages[2]!.name} is no longer a stop`);
        expect(options).toMatchObject({
            id: expect.stringMatching(/^timeline-edit-\d+$/),
            action: { label: `Keep Page ${pages[2]!.name} as a stop` },
        });
    });

    it("Keep as a stop restores the passed flag, and the window follows the move to its new range", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { pages } = await setUp(db);
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        const page2 = box(pages[2]!);
        const page3 = box(pages[3]!);
        const window = { start: page2.start, end: page3.end };
        const resolver = () => useTimelineResolverStore.getState().resolver!;
        const before = resolver().positionAt(1, page2.end);
        useTimelineSelectionStore
            .getState()
            .selectRange(window.start, window.end);
        const result = await moveMarchersInTarget({
            db,
            target: { kind: "range", ...window },
            moves: [{ marcherId: 1, x: 300, y: 300 }],
        });
        toastPassThrough(result);
        const action = info.mock.calls[0]![1]!.action as {
            onClick: () => void;
        };
        action.onClick();
        await vi.waitFor(() =>
            expect(useTimelineSelectionStore.getState().selection).toEqual({
                kind: "range",
                start: page3.start,
                end: page3.end,
            }),
        );
        await timelineResolverSettled();
        expect(resolver().positionAt(1, page2.end)).toEqual(before);
        expect(resolver().positionAt(1, page3.end)).toEqual([300, 300]);
    });

    it("a window the user has left keeps its selection after Keep as a stop", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { pages } = await setUp(db);
        const page2 = box(pages[2]!);
        const page3 = box(pages[3]!);
        const window = { start: page2.start, end: page3.end };
        const { passThrough } = await moveMarchersInTarget({
            db,
            target: { kind: "range", ...window },
            moves: [{ marcherId: 1, x: 300, y: 300 }],
        });
        useTimelineSelectionStore.getState().selectHome();
        await keepPassedFlagsAsStops(passThrough!, page2.end);
        expect(useTimelineSelectionStore.getState().selection).toEqual({
            kind: "home",
        });
    });

    it("an ordinary edit that carries forward shows no toast", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { pages, boxes } = await setUp(db);
        const info = vi.spyOn(toast, "info").mockImplementation(() => 0);
        const { result, summary } = await edit(db, boxes, box(pages[2]!), [
            { marcherId: 1, x: 300, y: 300 },
        ]);
        // It did carry: pages 3 to the end follow
        expect(summary).not.toBeNull();
        toastPassThrough(result);
        expect(info).not.toHaveBeenCalled();
    });

    it("an edit of homes carries to the marcher's first own move", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { pages, boxes } = await setUp(db);
        await edit(db, boxes, box(pages[3]!), [{ marcherId: 1, x: 50, y: 50 }]);
        const target = { kind: "home" as const };
        const result = await moveMarchersInTarget({
            db,
            target,
            moves: [{ marcherId: 1, x: 10, y: 10 }],
        });
        await timelineResolverSettled();
        const summary = editCarryForward(
            useTimelineResolverStore.getState().resolver!,
            target,
            result,
            boxes,
        )!;
        expect(summary).toEqual({
            first: pages[1]!.name,
            last: pages[2]!.name,
            stop: pages[3]!.name,
        });
    });
});
