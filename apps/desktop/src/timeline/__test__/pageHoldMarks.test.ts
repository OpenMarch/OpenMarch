import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { performUndo, transactionWithHistory } from "@/db-functions/history";
import {
    moveMarchersInTarget,
    type TimelineMarcherMove,
} from "@/db-functions/timelineMoves";
import { deleteTimelinesInTransaction } from "@/db-functions/timelines";
import type Page from "@/global/classes/Page";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import {
    convertPagesToTimeline,
    readShowTiming,
} from "../convert/writePageConversion";
import type { CarrySpan } from "../timelineCarryForward";
import { neighborPageTarget } from "../timelineCoordinateWrites";
import { marcherHoldState, type NamedFlag } from "../timelineHoldState";
import {
    classifyPage,
    pageHoldMarkHint,
    pageHoldMarkLabel,
    pageHoldMarks,
    pageModeMarcherPageStates,
    timelineMarcherPageStates,
    type MarcherPageState,
    type PageHoldMark,
} from "../pageHoldMarks";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
} from "../timelineStore";
import { useTimelineHoldMarks } from "../usePageHoldMarks";

/**
 * Where the selected marchers hold, on the page boxes (docs/timeline/ui.md UI-18,
 * defined-coordinates 08): each page after the first moves, holds or is mixed for the selection,
 * read from resolver spans in timeline mode and from rows in page mode.
 */

const hold = (start: number, end: number): CarrySpan => ({
    start,
    end,
    kind: "hold",
});
const own = (start: number, end: number): CarrySpan => ({
    start,
    end,
    kind: "join",
});

// Pages 1–5: page 1 is home at beat 0, page 2's flag is beat 8, and so on
const FLAGS = [0, 8, 16, 24, 32];
const NAMES = ["1", "2", "3", "4", "5"];
const MOVES = { kind: "moves" } as const;
const holdsSince = (since: number) => ({ kind: "holds", since }) as const;

describe("one marcher's states, timeline mode", () => {
    it("owner scenario: moved on page 2, it moves there and holds from page 2 on pages 3–4", () => {
        const spans = [hold(-Infinity, 1), own(1, 8), hold(8, Infinity)];
        expect(timelineMarcherPageStates(spans, FLAGS.slice(0, 4))).toEqual([
            null,
            MOVES,
            holdsSince(1),
            holdsSince(1),
        ]);
    });

    it("a marcher that never moved holds from the first page everywhere after it", () => {
        expect(
            timelineMarcherPageStates([hold(-Infinity, Infinity)], FLAGS),
        ).toEqual([null, ...FLAGS.slice(1).map(() => holdsSince(0))]);
    });

    it("partway through a move at a flag is neither, and moves on the page the move ends in", () => {
        // A move from page 2's box across page 2's and page 3's flags, ending in page 4's box
        const spans = [hold(-Infinity, 4), own(4, 20), hold(20, Infinity)];
        expect(timelineMarcherPageStates(spans, FLAGS)).toEqual([
            null,
            null,
            null,
            MOVES,
            holdsSince(3),
        ]);
    });

    it("a move starting on a flag hasn't moved the marcher at that flag", () => {
        const spans = [hold(-Infinity, 8), own(8, 16), hold(16, Infinity)];
        expect(timelineMarcherPageStates(spans, FLAGS)).toEqual([
            null,
            holdsSince(0),
            MOVES,
            holdsSince(2),
            holdsSince(2),
        ]);
    });

    it("a kept spot holds, kept, and the pages after it hold from it (pre-merge review U7)", () => {
        // Moved on page 2; kept on page 3 (assignment 7, over the whole box)
        const spans = [
            hold(-Infinity, 1),
            own(1, 8),
            { start: 8, end: 16, kind: "join" as const, assignmentId: 7 },
            hold(16, Infinity),
        ];
        expect(timelineMarcherPageStates(spans, FLAGS, new Set([7]))).toEqual([
            null,
            MOVES,
            { kind: "holds", since: 2, kept: true },
            holdsSince(2),
            holdsSince(2),
        ]);
        // Without the marker it's the marcher's own move
        expect(timelineMarcherPageStates(spans, FLAGS)[2]).toEqual(MOVES);
    });

    it("agrees with the inspector's marcherHoldState on every page", () => {
        const named: NamedFlag[] = FLAGS.map((beat, i) => ({
            beat,
            name: NAMES[i]!,
        }));
        const shows: CarrySpan[][] = [
            [hold(-Infinity, 1), own(1, 8), hold(8, 24), own(24, 32)],
            [hold(-Infinity, 12), own(12, 14), hold(14, Infinity)],
            [hold(-Infinity, 4), own(4, 20), own(20, 30), hold(30, Infinity)],
            [own(-Infinity, 9), hold(9, 16), own(16, 17), hold(17, Infinity)],
            [hold(-Infinity, Infinity)],
            [],
        ];
        for (const spans of shows) {
            const states = timelineMarcherPageStates(spans, FLAGS);
            FLAGS.forEach((flag, i) => {
                const expected = marcherHoldState(spans, flag, named);
                expect(states[i], `flag ${flag}`).toEqual(
                    expected === null
                        ? null
                        : expected.kind === "movesHere"
                          ? MOVES
                          : holdsSince(FLAGS.indexOf(expected.page.beat)),
                );
            });
        }
    });
});

describe("one marcher's states, page mode", () => {
    const at = (x: number, y = 0) => ({ x, y });

    it("owner scenario: page 2 edited and pages 3–4 copied from it hold from page 2", () => {
        expect(
            pageModeMarcherPageStates([at(0), at(10), at(10), at(10)]),
        ).toEqual([null, MOVES, holdsSince(1), holdsSince(1)]);
    });

    it("compares within 1e-6, and a later move starts a new run", () => {
        expect(
            pageModeMarcherPageStates([
                at(0),
                at(0 + 5e-7, 5e-7),
                at(4),
                at(4),
                at(4 + 2e-6),
            ]),
        ).toEqual([null, holdsSince(0), MOVES, holdsSince(2), MOVES]);
    });

    it("a page without a row is unknown and breaks the run", () => {
        expect(
            pageModeMarcherPageStates([at(0), undefined, at(0), at(0)]),
        ).toEqual([null, null, null, holdsSince(2)]);
    });

    it("the first page has no state", () => {
        expect(pageModeMarcherPageStates([at(3)])).toEqual([null]);
    });
});

describe("a page's mark for the selection", () => {
    it("moves when every selected marcher moves, holds when every one holds", () => {
        expect(classifyPage([MOVES, MOVES], NAMES)).toEqual({ kind: "moves" });
        expect(classifyPage([holdsSince(1), holdsSince(1)], NAMES)).toEqual({
            kind: "holds",
            from: "2",
        });
    });

    it("is mixed when some move and some hold, naming the page the holders hold from", () => {
        expect(classifyPage([MOVES, holdsSince(1)], NAMES)).toEqual({
            kind: "mixed",
            from: "2",
        });
        expect(
            classifyPage([MOVES, holdsSince(1), holdsSince(0)], NAMES),
        ).toEqual({ kind: "mixed", from: null });
    });

    it("names no page when the holders hold from different pages", () => {
        expect(classifyPage([holdsSince(0), holdsSince(1)], NAMES)).toEqual({
            kind: "holds",
            from: null,
        });
    });

    it("leaves out marchers partway through a move, and shows nothing when all are", () => {
        expect(classifyPage([null, holdsSince(2)], NAMES)).toEqual({
            kind: "holds",
            from: "3",
        });
        expect(classifyPage([null, MOVES], NAMES)).toEqual({ kind: "moves" });
        expect(classifyPage([null, null], NAMES)).toBeNull();
    });

    it("owner scenario over the show, and a partial selection is mixed where they differ", () => {
        const edited: MarcherPageState[] = [
            null,
            MOVES,
            holdsSince(1),
            holdsSince(1),
        ];
        const untouched: MarcherPageState[] = [
            null,
            holdsSince(0),
            holdsSince(0),
            holdsSince(0),
        ];
        const names = NAMES.slice(0, 4);
        expect(pageHoldMarks([edited], names)).toEqual([
            null,
            { kind: "moves" },
            { kind: "holds", from: "2" },
            { kind: "holds", from: "2" },
        ]);
        expect(pageHoldMarks([edited, untouched], names)).toEqual([
            null,
            { kind: "mixed", from: "1", fromStart: true },
            { kind: "holds", from: null },
            { kind: "holds", from: null },
        ]);
    });

    it("a page where every selected marcher is kept holds, kept; kept with others names no page (pre-merge review U7)", () => {
        const kept = { kind: "holds", since: 2, kept: true } as const;
        expect(classifyPage([kept, kept], NAMES)).toEqual({
            kind: "holds",
            from: null,
            kept: true,
        });
        expect(classifyPage([kept, holdsSince(1)], NAMES)).toEqual({
            kind: "holds",
            from: null,
        });
        expect(classifyPage([kept, MOVES], NAMES)).toEqual({
            kind: "mixed",
            from: null,
        });
        const mark = { kind: "holds", from: null, kept: true } as const;
        expect(pageHoldMarkLabel(mark)).toBe("Selected marchers are kept here");
        expect(pageHoldMarkHint(mark)).toBe(
            "They stay here when earlier pages change",
        );
    });

    it("has no marks without a selection", () => {
        expect(pageHoldMarks([], NAMES)).toEqual(NAMES.map(() => null));
    });

    it("words each mark for the page box", () => {
        const label = (mark: PageHoldMark) => pageHoldMarkLabel(mark);
        expect(label({ kind: "moves" })).toBe(
            "Selected marchers move on this page",
        );
        expect(label({ kind: "holds", from: "2" })).toBe(
            "Selected marchers hold from Page 2",
        );
        expect(label({ kind: "holds", from: null })).toBe(
            "Selected marchers hold on this page",
        );
        expect(label({ kind: "mixed", from: "2" })).toBe(
            "Some selected marchers hold from Page 2",
        );
        expect(label({ kind: "mixed", from: null })).toBe(
            "Some selected marchers hold on this page",
        );
        // Held since the first page: since their starting set, not "Page 0"
        expect(label({ kind: "holds", from: "0", fromStart: true })).toBe(
            "Selected marchers hold from the start",
        );
        expect(label({ kind: "mixed", from: "0", fromStart: true })).toBe(
            "Some selected marchers hold from the start",
        );
    });

    it("gives each mark a hint line for its tooltip", () => {
        const hint = (mark: PageHoldMark) => pageHoldMarkHint(mark);
        expect(hint({ kind: "moves" })).toBe("They have their own move here");
        expect(hint({ kind: "holds", from: "2" })).toBe(
            "They stand where Page 2 left them",
        );
        expect(hint({ kind: "holds", from: "0", fromStart: true })).toBe(
            "They stand where they started",
        );
        expect(hint({ kind: "holds", from: null })).toBe(
            "They stand where their last move left them",
        );
        expect(hint({ kind: "mixed", from: "2" })).toBe(
            "Some have their own move here",
        );
        expect(hint({ kind: "mixed", from: "0", fromStart: true })).toBe(
            "Some have their own move here",
        );
    });
});

// The tests below write their own timeline rows and start the resolver themselves
keepFixturesInPageMode("its tests write timeline rows themselves");

afterEach(() => {
    stopTimelineResolver();
});

const HOMES: TimelineMarcherMove[] = [
    { marcherId: 1, x: 100, y: 100 },
    { marcherId: 2, x: 150, y: 100 },
    { marcherId: 3, x: 200, y: 100 },
];

/**
 * The `marchersAndPages` show with no timeline rows, so marchers hold on their homes through
 * every page, as a show built with **+** does. Returns pages in show order.
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
    return [...pages].sort((a, b) => a.order - b.order);
};

const editPage = async (
    db: DbConnection,
    page: Page,
    moves: TimelineMarcherMove[],
) => {
    const target = neighborPageTarget(page);
    await moveMarchersInTarget({ db, target, moves });
    await timelineResolverSettled();
};

describeDbTests("the marks from the resolver", (it) => {
    it("owner scenario: after editing page 2, page 2 moves and the pages after it hold from it, until undo", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const { result, rerender } = renderHook(
            ({ ids }: { ids: number[] }) => useTimelineHoldMarks(pages, ids),
            { initialProps: { ids: [1] } },
        );
        // Never moved: every page after the first holds from it
        expect(result.current.get(pages[0]!.id)).toBeUndefined();
        expect(result.current.get(pages[2]!.id)).toEqual({
            kind: "holds",
            from: pages[0]!.name,
            fromStart: true,
        });

        await act(() =>
            editPage(db, pages[1]!, [{ marcherId: 1, x: 300, y: 300 }]),
        );
        await waitFor(() =>
            expect(result.current.get(pages[1]!.id)).toEqual({
                kind: "moves",
            }),
        );
        for (const page of pages.slice(2))
            expect(result.current.get(page.id)).toEqual({
                kind: "holds",
                from: pages[1]!.name,
            });

        // A partial selection: marcher 2 still holds from the first page
        rerender({ ids: [1, 2] });
        expect(result.current.get(pages[1]!.id)).toEqual({
            kind: "mixed",
            from: pages[0]!.name,
            fromStart: true,
        });
        expect(result.current.get(pages[2]!.id)).toEqual({
            kind: "holds",
            from: null,
        });

        // No selection, no marks
        rerender({ ids: [] });
        expect(result.current.size).toBe(0);

        // Undo puts marcher 1 back on its home: the marks follow
        rerender({ ids: [1] });
        await act(async () => {
            await performUndo(db);
            await timelineResolverSettled();
        });
        await waitFor(() =>
            expect(result.current.get(pages[1]!.id)).toEqual({
                kind: "holds",
                from: pages[0]!.name,
                fromStart: true,
            }),
        );
    });
});
