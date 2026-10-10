import { afterEach, expect, vi } from "vitest";
import { eq, getTableName } from "drizzle-orm";
import type { XY } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { mockNCAAFieldProperties } from "@/__mocks__/globalMocks";
import { FieldProperties } from "@openmarch/core";
import { performUndo, transactionWithHistory } from "@/db-functions/history";
import { createTimelineAssignmentsInTransaction } from "@/db-functions/timelineAssignments";
import {
    moveMarchersFromFlagInstead,
    moveMarchersInTarget,
    type TimelineMarcherMove,
} from "@/db-functions/timelineMoves";
import {
    createTimelinesInTransaction,
    deleteTimelinesInTransaction,
} from "@/db-functions/timelines";
import { createTimelineTransitionsInTransaction } from "@/db-functions/timelineTransitions";
import type Page from "@/global/classes/Page";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import {
    alignHorizontally,
    evenlyDistributeHorizontally,
} from "@/utilities/CoordinateActions";
import {
    setMarchersToNeighborPage,
    type NeighborPageDirection,
} from "@/utilities/setMarchersToNeighborPage";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import {
    convertPagesToTimeline,
    readShowTiming,
} from "../convert/writePageConversion";
import { pageEndBeat } from "../timelineCanvas";
import {
    neighborPageTarget,
    transformMarchersInSelection,
    type CanvasEditPlan,
    type TimelineNeighborPageRequest,
} from "../timelineCoordinateWrites";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "../timelineStore";

// These tests write their own timeline rows and start the resolver themselves
keepFixturesInPageMode("its tests write timeline rows themselves");

/**
 * Timeline-mode writers under sparse rows (docs/timeline/research/defined-coordinates/README.md,
 * Recommendation 2, 3 and 5; 07a §3-4, 07c §1-2): a write that moves nobody writes nothing, a drag
 * back to where a page starts clears the marcher's own move there, set to previous and next page
 * work on pages the marchers only hold through, and the pass-through toast shows for every window
 * over a page flag.
 *
 * Every test starts from the `marchersAndPages` show with **no** timeline rows (the converted rows
 * are deleted), so marchers hold on their homes through every page, as a show built with the **+**
 * flag does, whether or not anything writes automatic stays. Page boxes: page 1 `[1, 9)`, page 2
 * `[9, 17)`, page 3 `[17, 25)`, page 4 `[25, 33)`.
 */

afterEach(() => {
    stopTimelineResolver();
    useTimelineSelectionStore.getState().reset();
});

const TABLES = [
    schema.marchers,
    schema.timelines,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
];

const snapshot = async (db: DbConnection) => {
    const out: Record<string, unknown[]> = {};
    for (const table of TABLES)
        out[getTableName(table)] = await db.select().from(table).all();
    return out;
};

const undoRows = (db: DbConnection) =>
    db.select().from(schema.history_undo).all();

const resolver = () => useTimelineResolverStore.getState().resolver!;
const at = (marcherId: number, beat: number): XY => {
    const [x, y] = resolver().positionAt(marcherId, beat);
    return [x, y];
};

/** The homes the tests use: marchers 1-4 on one line, x 100, 150, 200 and 230. */
const HOMES: TimelineMarcherMove[] = [
    { marcherId: 1, x: 100, y: 100 },
    { marcherId: 2, x: 150, y: 100 },
    { marcherId: 3, x: 200, y: 100 },
    { marcherId: 4, x: 230, y: 100 },
];

/** Converts the show, deletes every timeline row and sets `HOMES`; returns pages in show order. */
const setUp = async (db: DbConnection): Promise<Page[]> => {
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

/** `page`'s box as a range target. */
const box = (page: Page) => {
    const target = neighborPageTarget(page);
    if (target.kind !== "range") throw new Error("not a page box");
    return target;
};

/** A canvas edit over `range`, as `planCanvasEdit` returns for a window selection. */
const planFor = (range: { start: number; end: number }): CanvasEditPlan => ({
    ok: true,
    target: { kind: "range", ...range },
    beat: range.end,
});

const move = async (
    db: DbConnection,
    range: { start: number; end: number },
    moves: TimelineMarcherMove[],
) => {
    const result = await moveMarchersInTarget({
        db,
        target: { kind: "range", ...range },
        moves,
    });
    await timelineResolverSettled();
    return result;
};

/** Every assignment of `marcherId`, as `[start, end, layer]`. */
const rowsOf = async (db: DbConnection, marcherId: number) =>
    (
        await db
            .select()
            .from(schema.timeline_assignments)
            .where(eq(schema.timeline_assignments.marcher_id, marcherId))
            .all()
    ).map((r) => [r.start_beat, r.end_beat, r.layer]);

const timelineCount = async (db: DbConnection) =>
    (await db.select().from(schema.timelines).all()).length;

const fieldProperties = new FieldProperties(mockNCAAFieldProperties);

describeDbTests("sparse timeline writes: no-op writes write nothing", (it) => {
    it("align on an inherited page writes no row for a marcher it leaves still, so an upstream edit still carries it (owner bug via align, 07a §3)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page2 = box(pages[2]!);
        const page3 = box(pages[3]!);
        // Page 3 only holds; its marchers are on their homes. Align 1-3 horizontally there: the
        // average x is marcher 2's own, so it stays still
        const next = await transformMarchersInSelection({
            db,
            marcherIds: [1, 2, 3],
            transform: (current) =>
                alignHorizontally({ marcherPages: current }),
            plan: planFor(page3),
        });
        expect(next.find((c) => c.marcher_id === 2)).toMatchObject({ x: 150 });
        await timelineResolverSettled();
        expect(await rowsOf(db, 2), "marcher 2 got no row").toEqual([]);
        expect(await rowsOf(db, 1)).toEqual([[page3.start, page3.end, 0]]);
        expect(await rowsOf(db, 3)).toEqual([[page3.start, page3.end, 0]]);

        // An upstream edit on page 2 carries marcher 2 through page 3 and on
        await move(db, page2, [{ marcherId: 2, x: 160, y: 300 }]);
        expect(at(2, page3.end)).toEqual([160, 300]);
        expect(at(2, box(pages[4]!).end)).toEqual([160, 300]);
        // Marchers 1 and 3 keep their aligned page 3
        expect(at(1, page3.end)).toEqual([150, 100]);
        expect(at(3, page3.end)).toEqual([150, 100]);
    });

    it("distribute writes no row for the endpoints it keeps", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page3 = box(pages[3]!);
        await transformMarchersInSelection({
            db,
            marcherIds: [1, 2, 4],
            transform: (current) =>
                evenlyDistributeHorizontally({
                    marcherPages: current,
                    fieldProperties,
                }),
            plan: planFor(page3),
        });
        await timelineResolverSettled();
        expect(await rowsOf(db, 1)).toEqual([]);
        expect(await rowsOf(db, 4)).toEqual([]);
        expect(await rowsOf(db, 2)).toEqual([[page3.start, page3.end, 0]]);
        expect(at(2, page3.end)).toEqual([165, 100]);
    });

    it("a write that moves nobody creates no timeline and no undo step", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page3 = box(pages[3]!);
        const before = await snapshot(db);
        const history = await undoRows(db);

        const result = await move(db, page3, [
            { marcherId: 1, x: 100, y: 100 },
            // Within the tolerance of where it is
            { marcherId: 2, x: 150 + 1e-7, y: 100 - 1e-7 },
        ]);

        expect(result.slots).toEqual([]);
        expect(result.passThrough).toBeUndefined();
        expect(await snapshot(db)).toEqual(before);
        expect(await undoRows(db)).toEqual(history);
    });

    it("a marcher already in the window's timeline moved to where it is writes nothing for it", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page3 = box(pages[3]!);
        await move(db, page3, [
            { marcherId: 1, x: 120, y: 140 },
            { marcherId: 2, x: 170, y: 140 },
        ]);
        const before = await snapshot(db);
        const history = await undoRows(db);
        const result = await move(db, page3, [
            { marcherId: 1, x: 120, y: 140 },
            { marcherId: 2, x: 170, y: 140 },
        ]);
        expect(result.slots).toEqual([]);
        expect(await snapshot(db)).toEqual(before);
        expect(await undoRows(db)).toEqual(history);
    });
});

describeDbTests("sparse timeline writes: a drag back clears the move", (it) => {
    it("drag away and back on an inherited page deletes the move and its timeline, and the page follows again", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page2 = box(pages[2]!);
        const page3 = box(pages[3]!);
        const timelinesBefore = await timelineCount(db);
        await move(db, page3, [{ marcherId: 1, x: 300, y: 300 }]);
        expect(await rowsOf(db, 1)).toHaveLength(1);
        const away = await snapshot(db);

        const back = await move(db, page3, [{ marcherId: 1, x: 100, y: 100 }]);
        expect(back.cleared).toEqual([1]);
        expect(await rowsOf(db, 1)).toEqual([]);
        expect(await timelineCount(db), "the emptied timeline goes").toBe(
            timelinesBefore,
        );
        expect(at(1, page3.end)).toEqual([100, 100]);

        // One undo brings the move back
        const undo = await performUndo(db);
        expect(undo.success, undo.error?.message).toBe(true);
        expect(await snapshot(db)).toEqual(away);
        const redo = await moveMarchersInTarget({
            db,
            target: { kind: "range", ...page3 },
            moves: [{ marcherId: 1, x: 100, y: 100 }],
        });
        expect(redo.cleared).toEqual([1]);

        // Page 3 follows an upstream edit again
        await move(db, page2, [{ marcherId: 1, x: 50, y: 60 }]);
        expect(at(1, page3.end)).toEqual([50, 60]);
    });

    it("a drag back keeps the timeline while others are still in it", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page3 = box(pages[3]!);
        await move(db, page3, [
            { marcherId: 1, x: 300, y: 300 },
            { marcherId: 2, x: 310, y: 300 },
        ]);
        const timelines = await timelineCount(db);
        await move(db, page3, [{ marcherId: 1, x: 100, y: 100 }]);
        expect(await rowsOf(db, 1)).toEqual([]);
        expect(await rowsOf(db, 2)).toHaveLength(1);
        expect(await timelineCount(db)).toBe(timelines);
        expect(at(2, page3.end)).toEqual([310, 300]);
    });

    it("a zero-motion ending is kept in a window that isn't a page's box (cross-page window)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const window = { start: box(pages[2]!).start, end: box(pages[3]!).end };
        await move(db, window, [{ marcherId: 1, x: 300, y: 300 }]);
        const back = await move(db, window, [{ marcherId: 1, x: 100, y: 100 }]);
        expect(back.cleared).toBeUndefined();
        expect(await rowsOf(db, 1)).toEqual([[window.start, window.end, 0]]);
        expect(at(1, window.end)).toEqual([100, 100]);
    });

    it("a zero-motion ending is kept in a transition shared with other marchers", async ({
        db,
        marchersAndPages: _,
    }) => {
        // The converted show: one shared transition per page
        await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        const { pages: unsorted } = await readShowTiming(db);
        const pages = [...unsorted].sort((a, b) => a.order - b.order);
        const page3 = box(pages[3]!);
        const origin = at(5, page3.start);
        await move(db, page3, [{ marcherId: 5, x: origin[0], y: origin[1] }]);
        expect(await rowsOf(db, 5)).toContainEqual([page3.start, page3.end, 0]);
        expect(at(5, page3.end)).toEqual(origin);
    });

    it("a drag back keeps a page move the marcher doesn't own alone over the box (a track underneath)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page2 = box(pages[2]!);
        const page3 = box(pages[3]!);
        // A long track over pages 2-3, then a page 3 move on top of it
        await move(db, { start: page2.start, end: page3.end }, [
            { marcherId: 1, x: 400, y: 100 },
        ]);
        await move(db, page3, [{ marcherId: 1, x: 300, y: 300 }]);
        const origin = at(1, page3.start);
        await move(db, page3, [{ marcherId: 1, x: origin[0], y: origin[1] }]);
        expect(await rowsOf(db, 1)).toHaveLength(2);
        expect(at(1, page3.end)).toEqual(origin);
    });

    it("an own zero-motion move left still by an edit isn't cleared (only an edit that moves it back is)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page3 = box(pages[3]!);
        // A deliberate stay: marcher 1's own page 3 move, ending where it starts
        await transactionWithHistory(db, "stay", async (tx) => {
            const [timeline] = await createTimelinesInTransaction({
                tx,
                newTimelines: [{ startBeat: page3.start, endBeat: page3.end }],
            });
            const [transition] = await createTimelineTransitionsInTransaction({
                tx,
                newTransitions: [
                    {
                        timelineId: timeline!.id,
                        slotCount: 1,
                        destination: {
                            kind: "individual",
                            points: [[100, 100]],
                        },
                    },
                ],
            });
            await createTimelineAssignmentsInTransaction({
                tx,
                newAssignments: [
                    {
                        marcherId: 1,
                        transitionId: transition!.id,
                        slotIndex: 0,
                        startBeat: page3.start,
                        endBeat: page3.end,
                        layer: 0,
                    },
                ],
            });
        });
        await timelineResolverSettled();
        // An align that leaves marcher 1 where it is doesn't clear its stay
        await transformMarchersInSelection({
            db,
            marcherIds: [1],
            transform: (current) =>
                alignHorizontally({ marcherPages: current }),
            plan: planFor(page3),
        });
        await timelineResolverSettled();
        expect(await rowsOf(db, 1)).toEqual([[page3.start, page3.end, 0]]);
    });
});

describeDbTests(
    "sparse timeline writes: set to previous and next page",
    (it) => {
        const t = (key: string, params?: Record<string, string | number>) =>
            params ? `${key} ${JSON.stringify(params)}` : key;

        const run = async (
            db: DbConnection,
            pages: Page[],
            page: Page,
            direction: NeighborPageDirection,
            selected: number[],
        ) => {
            const writeTimeline = vi.fn(
                (request: TimelineNeighborPageRequest) =>
                    moveMarchersInTarget({ db, ...request }),
            );
            const notify = { success: vi.fn(), error: vi.fn() };
            const result = await setMarchersToNeighborPage({
                timelineMode: true,
                direction,
                scope: "selected",
                selectedPage: page,
                pages,
                selectedMarcherIds: selected,
                neighborMarcherPages: undefined,
                writePages: vi.fn(),
                writeTimeline,
                notify,
                t,
                reportError: (e) => {
                    throw e;
                },
            });
            await timelineResolverSettled();
            return { result, writeTimeline, notify };
        };

        it("set to next on an inherited page writes the next page's position there (07a §3)", async ({
            db,
            marchersAndPages: _,
        }) => {
            const pages = await setUp(db);
            const page3 = box(pages[3]!);
            const page4 = box(pages[4]!);
            await move(db, page4, [{ marcherId: 1, x: 300, y: 320 }]);
            expect(at(1, page3.end)).toEqual([100, 100]);

            const { result, notify } = await run(
                db,
                pages,
                pages[3]!,
                "next",
                [1],
            );

            expect(result).toBe(1);
            expect(notify.success).toHaveBeenCalledTimes(1);
            expect(at(1, page3.end)).toEqual([300, 320]);
            expect(await rowsOf(db, 1)).toContainEqual([
                page3.start,
                page3.end,
                0,
            ]);
        });

        it("set to previous clears the page's own move, so the page follows a later upstream edit", async ({
            db,
            marchersAndPages: _,
        }) => {
            const pages = await setUp(db);
            const page2 = box(pages[2]!);
            const page3 = box(pages[3]!);
            await move(db, page2, [{ marcherId: 1, x: 200, y: 200 }]);
            await move(db, page3, [{ marcherId: 1, x: 300, y: 300 }]);
            expect(await rowsOf(db, 1)).toHaveLength(2);

            const { result } = await run(db, pages, pages[3]!, "previous", [1]);
            expect(result).toBe(1);
            expect(await rowsOf(db, 1)).toEqual([[page2.start, page2.end, 0]]);
            expect(at(1, page3.end)).toEqual([200, 200]);

            // An edit on page 2 now carries through page 3
            await move(db, page2, [{ marcherId: 1, x: 220, y: 240 }]);
            expect(at(1, page3.end)).toEqual([220, 240]);
        });

        it("set to previous clears an own move that already goes nowhere (a stay)", async ({
            db,
            marchersAndPages: _,
        }) => {
            const pages = await setUp(db);
            const page2 = box(pages[2]!);
            const page3 = box(pages[3]!);
            await move(db, page2, [{ marcherId: 1, x: 200, y: 200 }]);
            // Page 3's own move, then made a stay: it ends where page 2 left the marcher
            await move(db, page3, [{ marcherId: 1, x: 300, y: 300 }]);
            await transactionWithHistory(db, "stay", async (tx) => {
                await tx
                    .update(schema.timeline_slot_destinations)
                    .set({ x: 200, y: 200 })
                    .where(eq(schema.timeline_slot_destinations.x, 300));
            });
            await timelineResolverSettled();
            expect(at(1, page3.end)).toEqual([200, 200]);

            await run(db, pages, pages[3]!, "previous", [1]);
            expect(await rowsOf(db, 1)).toEqual([[page2.start, page2.end, 0]]);
        });

        it("set to previous on a page that already follows writes nothing", async ({
            db,
            marchersAndPages: _,
        }) => {
            const pages = await setUp(db);
            const before = await snapshot(db);
            const history = await undoRows(db);
            const { result } = await run(
                db,
                pages,
                pages[3]!,
                "previous",
                [1, 2],
            );
            expect(result).toBe(2);
            expect(await snapshot(db)).toEqual(before);
            expect(await undoRows(db)).toEqual(history);
        });

        it("set to previous falls back to writing the previous page's position for a move shared with others", async ({
            db,
            marchersAndPages: _,
        }) => {
            await convertPagesToTimeline(db);
            await startTimelineResolver(db);
            const { pages: unsorted } = await readShowTiming(db);
            const pages = [...unsorted].sort((a, b) => a.order - b.order);
            const page3 = box(pages[3]!);
            const target = at(5, pageEndBeat(pages[2]!));
            expect(at(5, page3.end)).not.toEqual(target);

            await run(db, pages, pages[3]!, "previous", [5]);
            expect(at(5, page3.end)).toEqual(target);
            expect(await rowsOf(db, 5)).toContainEqual([
                page3.start,
                page3.end,
                0,
            ]);
        });

        it("set to previous inside a longer move writes a stay over the page box", async ({
            db,
            marchersAndPages: _,
        }) => {
            const pages = await setUp(db);
            const page2 = box(pages[2]!);
            const page3 = box(pages[3]!);
            await move(db, { start: page2.start, end: page3.end }, [
                { marcherId: 1, x: 300, y: 100 },
            ]);
            const target = at(1, page2.end);
            await run(db, pages, pages[3]!, "previous", [1]);
            expect(at(1, page3.end)).toEqual(target);
            expect(at(1, page2.end)).toEqual(target);
        });
    },
);

describeDbTests("sparse timeline writes: the pass-through toast", (it) => {
    it("a window over inherited pages reports the flags it passes, though it overrides no rows", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page2 = box(pages[2]!);
        const page3 = box(pages[3]!);
        const window = { start: page2.start, end: page3.end };
        const result = await move(db, window, [
            { marcherId: 1, x: 300, y: 300 },
            // Already there: not added, so not listed
            { marcherId: 2, x: 150, y: 100 },
        ]);
        expect(result.passThrough).toEqual({
            range: window,
            marcherIds: [1],
            labels: [expect.any(String)],
            overridden: [],
            caughtUp: [],
            flags: [page2.end],
            createdTimelineId: expect.any(Number),
        });
        // Page 2's flag shows marcher 1 mid-glide
        expect(at(1, page2.end)).toEqual([200, 200]);
    });

    it("Keep Page N as a stop works with no rows underneath: the long move goes and page 3 alone moves", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page2 = box(pages[2]!);
        const page3 = box(pages[3]!);
        const window = { start: page2.start, end: page3.end };
        const { passThrough } = await move(db, window, [
            { marcherId: 1, x: 300, y: 300 },
        ]);
        const passed = await snapshot(db);

        await moveMarchersFromFlagInstead({
            db,
            range: window,
            from: passThrough!.flags[0]!,
            marcherIds: passThrough!.marcherIds,
            deleteIfEmpty: passThrough!.createdTimelineId,
        });
        await timelineResolverSettled();
        expect(await rowsOf(db, 1)).toEqual([[page3.start, page3.end, 0]]);
        expect(at(1, page2.end)).toEqual([100, 100]);
        expect(at(1, page3.end)).toEqual([300, 300]);

        const undo = await performUndo(db);
        expect(undo.success, undo.error?.message).toBe(true);
        expect(await snapshot(db)).toEqual(passed);
    });

    it("a window inside one page passes no flag and says nothing", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page3 = box(pages[3]!);
        const result = await move(
            db,
            { start: page3.start, end: page3.start + 4 },
            [{ marcherId: 1, x: 300, y: 300 }],
        );
        expect(result.passThrough).toBeUndefined();
    });
});
