import { afterEach, expect } from "vitest";
import { eq, getTableName } from "drizzle-orm";
import type { XY } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { readShowTiming } from "@/timeline/showTiming";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import { createLastPage, deletePages } from "../page";
import {
    moveMarchersInTarget,
    type TimelineEditTarget,
} from "../timelineMoves";
import { readHeldMarks } from "../timelineHeldMarks";
import { resizeTimeline } from "../timelineResize";
import { shiftTimeline } from "../timelineCommands";
import { holdFromPreviousPage } from "../timelineHoldFromPrevious";
import { setAsShownOnPage } from "../timelineSetAsShown";
import { unsetMarchersAt } from "../timelineUnset";
import { createTimelinesInTransaction } from "../timelines";
import { createTimelineShapesInTransaction } from "../timelineShapes";
import { createTimelineTransitionsInTransaction } from "../timelineTransitions";
import { createTimelineAssignmentsInTransaction } from "../timelineAssignments";

keepFixturesInPageMode(
    "its tests trim the show, write timeline rows and set the flag themselves",
);

/**
 * **Every hold grows out of what last put the marcher there** (owner, 2026-11-09; ADR 0012): a move
 * ending at the hold's start, or the starting spot. A marcher in a Not defined gap already stands
 * at its last spot, so Hold from last keyframe, and the upkeep after any edit, reach back over the
 * gap to the marcher's last row end, the end of its own earlier hold, or the start of the show.
 *
 * The show: home, page 1 [1, 9), page 2 [9, 17), page 3 [17, 25), page 4 [25, 33), page 5
 * [33, 41); beat ids equal their ordinals. Marcher `a` moves on pages 1 and 2 and is Not defined
 * from page 3 on; `b` moves on page 1 only; `c` never moves.
 */

afterEach(() => stopTimelineResolver());

const ONE: XY = [100, 100];
const TWO: XY = [200, 140];
const FAR: XY = [500, 260];
const AWAY: XY = [320, 40];
const PAGE1 = { start: 1, end: 9 };
const PAGE2 = { start: 9, end: 17 };
const PAGE3 = { start: 17, end: 25 };
const PAGE4 = { start: 25, end: 33 };
const PAGE5 = { start: 33, end: 41 };

const TABLES = [
    schema.timelines,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
    schema.timeline_held_marks,
];

const snapshot = async (db: DbConnection) => {
    const out: Record<string, unknown[]> = {};
    for (const table of TABLES)
        out[getTableName(table)] = await db.select().from(table).all();
    return out;
};

const resolver = () => useTimelineResolverStore.getState().resolver!;

const pagesInOrder = async (db: DbConnection) =>
    [...(await readShowTiming(db)).pages].sort((a, b) => a.order - b.order);

const pageId = async (db: DbConnection, order: number) =>
    (await pagesInOrder(db)).find((p) => p.order === order)!.id;

/** Where `marcherId` stands at each flag: home, pages 1–5. */
const atFlags = async (db: DbConnection, marcherId: number) => {
    await timelineResolverSettled();
    return (await pagesInOrder(db))
        .map((p) => (p.id === 0 ? 0 : pageEndBeat(p)))
        .map((b) => resolver().positionAt(marcherId, b) as XY);
};

/** Where `marcherId` stands at each count of `[start, end]`. */
const atCounts = async (
    db: DbConnection,
    marcherId: number,
    start: number,
    end: number,
) => {
    await timelineResolverSettled();
    return Array.from(
        { length: end - start + 1 },
        (_, i) => resolver().positionAt(marcherId, start + i) as XY,
    );
};

const edit = async (
    db: DbConnection,
    target: TimelineEditTarget,
    moves: { marcherId: number; xy: XY }[],
) => {
    const result = await moveMarchersInTarget({
        db,
        target,
        moves: moves.map(({ marcherId, xy: [x, y] }) => ({ marcherId, x, y })),
    });
    await timelineResolverSettled();
    return result;
};

const move = (
    db: DbConnection,
    range: { start: number; end: number },
    moves: { marcherId: number; xy: XY }[],
) => edit(db, { kind: "range", ...range }, moves);

const spansOf = async (db: DbConnection, marcherId: number) =>
    (await db.select().from(schema.timeline_assignments).all())
        .filter((r) => r.marcher_id === marcherId)
        .sort((x, y) => x.start_beat - y.start_beat)
        .map((r) => [r.start_beat, r.end_beat]);

/** The move (timeline id) of `marcherId`'s row ending at `beat`. */
const moveEndingAt = async (
    db: DbConnection,
    marcherId: number,
    beat: number,
) => {
    const row = (
        await db.select().from(schema.timeline_assignments).all()
    ).find((r) => r.marcher_id === marcherId && r.end_beat === beat)!;
    return (await db
        .select()
        .from(schema.timeline_transitions)
        .where(eq(schema.timeline_transitions.id, row.transition_id))
        .get())!.timeline_id;
};

const marksOf = async (db: DbConnection, marcherId: number) =>
    (await readHeldMarks(db, [marcherId])).map(({ start, end }) => ({
        start,
        end,
    }));

const setTimelineFlag = async (db: DbConnection) => {
    await db.delete(schema.workspace_settings);
    await db.insert(schema.workspace_settings).values({
        id: 1,
        json_data: JSON.stringify({ timelineMode: true }),
    });
};

/** Undo restores `before` exactly, and redo `after`. */
const roundTrip = async (
    db: DbConnection,
    before: Record<string, unknown[]>,
    after: Record<string, unknown[]>,
) => {
    const undo = await performUndo(db);
    expect(undo.success, undo.error?.message).toBe(true);
    expect(await snapshot(db)).toEqual(before);
    const redo = await performRedo(db);
    expect(redo.success, redo.error?.message).toBe(true);
    expect(await snapshot(db)).toEqual(after);
    await timelineResolverSettled();
};

/** Pages 1–5 in timeline mode; `a` moved on pages 1 and 2, `b` on page 1, `c` never. */
const show = async (db: DbConnection) => {
    const pages = await pagesInOrder(db);
    await deletePages({
        db,
        pageIds: new Set(pages.filter((p) => p.order >= 2).map((p) => p.id)),
    });
    for (let i = 0; i < 4; i++) await createLastPage({ db, newPageCounts: 8 });
    await setTimelineFlag(db);
    await startTimelineResolver(db);
    const [a, b, c] = resolver().marcherIds();
    await move(db, PAGE1, [
        { marcherId: a!, xy: ONE },
        { marcherId: b!, xy: ONE },
    ]);
    await move(db, PAGE2, [{ marcherId: a!, xy: TWO }]);
    return { a: a!, b: b!, c: c! };
};

/** A placed shape's recipe, in the move (timeline) `timelineId`, holding `marcherId` at `xy`. */
const shapeRecipeIn = (
    db: DbConnection,
    timelineId: number,
    marcherId: number,
    xy: XY,
) =>
    transactionWithHistory(db, "test", async (tx) => {
        const [recipe] = await tx
            .insert(schema.timeline_shape_recipes)
            .values({
                timeline_id: timelineId,
                kind: "line",
                kind_version: 1,
                params: "{}",
                order_mode: "keep",
            })
            .returning();
        await tx.insert(schema.timeline_shape_recipe_marchers).values({
            recipe_id: recipe!.id,
            marcher_id: marcherId,
            slot: 0,
            x: xy[0],
            y: xy[1],
        });
    });

/** A follow-the-leader move of `marcherId` alone over `[start, end)`, onto a one-slot line. */
const followTheLeader = (
    db: DbConnection,
    marcherId: number,
    start: number,
    end: number,
) =>
    transactionWithHistory(db, "test", async (tx) => {
        const [line] = await createTimelineShapesInTransaction({
            tx,
            newShapes: [
                {
                    kind: "line",
                    geometry: { points: [FAR, AWAY] },
                },
            ],
        });
        const [timeline] = await createTimelinesInTransaction({
            tx,
            newTimelines: [{ startBeat: start, endBeat: end }],
        });
        const [transition] = await createTimelineTransitionsInTransaction({
            tx,
            newTransitions: [
                {
                    timelineId: timeline!.id,
                    startBeat: start,
                    endBeat: end,
                    slotCount: 1,
                    destination: { kind: "shape", shapeId: line!.id },
                    pathStyle: "follow_the_leader",
                    pathParams: { waypoints: [] },
                    orderMode: "inherit",
                },
            ],
        });
        await createTimelineAssignmentsInTransaction({
            tx,
            newAssignments: [
                {
                    marcherId,
                    transitionId: transition!.id,
                    slotIndex: 0,
                    startBeat: start,
                    endBeat: end,
                    layer: 0,
                },
            ],
        });
    });

/** A mark written straight to the file, as a file from before this rule can hold, outside an edit. */
const leftover = (
    db: DbConnection,
    marcherId: number,
    start: number,
    end: number,
) =>
    db.insert(schema.timeline_held_marks).values({
        marcher_id: marcherId,
        start_beat: start,
        end_beat: end,
    });

const OVER = (start: number, end: number) => ({ start, end });

/** `c`'s part of a move over `[9, 25)` ends at `end` (page 2's flag by default); the move doesn't. */
const partOfALongerMove = (db: DbConnection, c: number, end = 17) =>
    transactionWithHistory(db, "test", async (tx) => {
        const [line] = await tx
            .insert(schema.timelines)
            .values({ start_beat: 9, end_beat: 25 })
            .returning();
        const [tr] = await tx
            .insert(schema.timeline_transitions)
            .values({
                timeline_id: line!.id,
                slot_count: 1,
                start_beat: 9,
                end_beat: 25,
            })
            .returning();
        await tx.insert(schema.timeline_slot_destinations).values({
            transition_id: tr!.id,
            slot_index: 0,
            x: FAR[0],
            y: FAR[1],
        });
        await tx.insert(schema.timeline_assignments).values({
            transition_id: tr!.id,
            marcher_id: c,
            slot_index: 0,
            layer: 0,
            start_beat: 9,
            end_beat: end,
        });
    });

describeDbTests("Hold from last keyframe reaches back", (it) => {
    it("from a move: one Held hold over Pages 3–5, growing out of Page 2's diamond", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        const before = await snapshot(db);
        const standing = await atFlags(db, a);

        const result = await holdFromPreviousPage({
            db,
            pageBox: PAGE5,
            marcherIds: [a],
        });
        expect(result).toEqual({
            held: [a],
            skipped: [],
            pagesCovered: ["3", "4", "5"],
        });
        expect(await marksOf(db, a)).toEqual([OVER(17, 41)]);
        // Nobody moves: a Not defined gap already stands at the last spot
        expect(await atFlags(db, a)).toEqual(standing);
        await roundTrip(db, before, await snapshot(db));
    });

    it("from a last arrival mid-page: the hold starts on that count", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        await move(db, { start: 9, end: 13 }, [{ marcherId: c, xy: FAR }]);
        const result = await holdFromPreviousPage({
            db,
            pageBox: PAGE3,
            marcherIds: [c],
        });
        expect(result.pagesCovered).toEqual(["2", "3"]);
        expect(await marksOf(db, c)).toEqual([OVER(13, 25)]);
        expect(await atCounts(db, c, 13, 25)).toEqual(
            Array.from({ length: 13 }, () => FAR),
        );
    });

    it("from the marcher's earlier hold: they merge into one", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [a] });
        expect(await marksOf(db, a)).toEqual([PAGE3]);
        const before = await snapshot(db);

        const result = await holdFromPreviousPage({
            db,
            pageBox: PAGE5,
            marcherIds: [a],
        });
        expect(result.pagesCovered).toEqual(["4", "5"]);
        expect(await marksOf(db, a)).toEqual([OVER(17, 41)]);
        await roundTrip(db, before, await snapshot(db));
    });

    it("a hold right after an earlier one covers just the page", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [a] });
        const result = await holdFromPreviousPage({
            db,
            pageBox: PAGE4,
            marcherIds: [a],
        });
        expect(result).toEqual({ held: [a], skipped: [] });
        expect(await marksOf(db, a)).toEqual([OVER(17, 33)]);
    });

    it("from the starting spot, for a marcher who never moved", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        const before = await snapshot(db);
        const result = await holdFromPreviousPage({
            db,
            pageBox: PAGE3,
            marcherIds: [c],
        });
        expect(result).toEqual({
            held: [c],
            skipped: [],
            pagesCovered: ["1", "2", "3"],
        });
        expect(await marksOf(db, c)).toEqual([OVER(1, 25)]);
        await roundTrip(db, before, await snapshot(db));
    });

    it("a never-moved marcher held on two pages with a gap is one hold from the start", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        await holdFromPreviousPage({ db, pageBox: PAGE2, marcherIds: [c] });
        expect(await marksOf(db, c)).toEqual([OVER(1, 17)]);
        await holdFromPreviousPage({ db, pageBox: PAGE4, marcherIds: [c] });
        expect(await marksOf(db, c)).toEqual([OVER(1, 33)]);
    });

    it("takes each marcher back to its own last arrival", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b, c } = await show(db);
        const result = await holdFromPreviousPage({
            db,
            pageBox: PAGE4,
            marcherIds: [c, b, a],
        });
        expect(result.held).toEqual([a, b, c].sort((x, y) => x - y));
        expect(result.pagesCovered).toEqual(["1", "2", "3", "4"]);
        expect(await marksOf(db, a)).toEqual([OVER(17, 33)]);
        expect(await marksOf(db, b)).toEqual([OVER(9, 33)]);
        expect(await marksOf(db, c)).toEqual([OVER(1, 33)]);
    });

    it("takes the marcher's own move on the page out, then reaches back", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await move(db, PAGE5, [{ marcherId: a, xy: FAR }]);
        const before = await snapshot(db);
        await holdFromPreviousPage({ db, pageBox: PAGE5, marcherIds: [a] });
        expect(await spansOf(db, a)).toEqual([
            [1, 9],
            [9, 17],
        ]);
        expect(await marksOf(db, a)).toEqual([OVER(17, 41)]);
        await roundTrip(db, before, await snapshot(db));
    });
});

describeDbTests("Hold from last keyframe skips what it can't hold", (it) => {
    it("a marcher whose last move is a placed shape's move", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        await shapeRecipeIn(db, await moveEndingAt(db, a, PAGE2.end), a, TWO);
        const result = await holdFromPreviousPage({
            db,
            pageBox: PAGE4,
            marcherIds: [a, b],
        });
        expect(result.held).toEqual([b]);
        expect(result.skipped).toEqual([
            { marcherId: a, reason: "arrivalShape" },
        ]);
        expect(await marksOf(db, a)).toEqual([]);
    });

    it("a marcher whose last move follows the leader", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        // c follows the leader over counts 9–13, mid-page 2; nothing arrives at page 3's flag
        await followTheLeader(db, c, 9, 13);
        const result = await holdFromPreviousPage({
            db,
            pageBox: PAGE3,
            marcherIds: [c],
        });
        expect(result).toEqual({
            held: [],
            skipped: [{ marcherId: c, reason: "arrivalFollowLeader" }],
        });
        expect(await marksOf(db, c)).toEqual([]);
    });

    it("a row ending at the flag without arriving", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        await partOfALongerMove(db, c);
        const result = await holdFromPreviousPage({
            db,
            pageBox: PAGE3,
            marcherIds: [c],
        });
        expect(result.skipped).toEqual([{ marcherId: c, reason: "noArrival" }]);
        expect(await marksOf(db, c)).toEqual([]);
    });

    it("a row further back that ends without arriving, naming that page", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        await partOfALongerMove(db, c);
        const result = await holdFromPreviousPage({
            db,
            pageBox: PAGE5,
            marcherIds: [c],
        });
        expect(result).toEqual({
            held: [],
            skipped: [{ marcherId: c, reason: "noArrival", atPage: "3" }],
        });
        expect(await marksOf(db, c)).toEqual([]);
    });

    it("a row ending mid-page without arriving, naming the page it ended on", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        await partOfALongerMove(db, c, 13);
        const result = await holdFromPreviousPage({
            db,
            pageBox: PAGE5,
            marcherIds: [c],
        });
        expect(result).toEqual({
            held: [],
            skipped: [{ marcherId: c, reason: "noArrival", atPage: "2" }],
        });
    });

    it("joining an earlier hold whose arrival has since become a shape's move", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [a] });
        await shapeRecipeIn(db, await moveEndingAt(db, a, PAGE2.end), a, TWO);
        for (const pageBox of [PAGE4, PAGE5]) {
            const result = await holdFromPreviousPage({
                db,
                pageBox,
                marcherIds: [a],
            });
            expect(result).toEqual({
                held: [],
                skipped: [{ marcherId: a, reason: "arrivalShape" }],
            });
        }
        expect(await marksOf(db, a)).toEqual([PAGE3]);
    });

    it("joining an earlier hold whose arrival follows the leader", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        await followTheLeader(db, c, 9, 13);
        await leftover(db, c, 13, 17);
        const result = await holdFromPreviousPage({
            db,
            pageBox: PAGE4,
            marcherIds: [c],
        });
        expect(result).toEqual({
            held: [],
            skipped: [{ marcherId: c, reason: "arrivalFollowLeader" }],
        });
        expect(await marksOf(db, c)).toEqual([OVER(13, 17)]);
    });

    it("a move running across the page's flag, whatever came before", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        await move(db, { start: 21, end: 29 }, [{ marcherId: c, xy: FAR }]);
        const result = await holdFromPreviousPage({
            db,
            pageBox: PAGE4,
            marcherIds: [c],
        });
        expect(result.skipped).toEqual([
            { marcherId: c, reason: "crossesFlag" },
        ]);
        expect(await marksOf(db, c)).toEqual([]);
    });

    it("a marcher already Held on the page", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await holdFromPreviousPage({ db, pageBox: PAGE4, marcherIds: [a] });
        const result = await holdFromPreviousPage({
            db,
            pageBox: PAGE4,
            marcherIds: [a],
        });
        expect(result.skipped).toEqual([{ marcherId: a, reason: "held" }]);
    });
});

describeDbTests("A drag inside a reached-back hold", (it) => {
    for (const [mode, target] of [
        ["Expert, inside a page it filled", { kind: "range", ...PAGE3 }],
        ["Basic, on a later page", { kind: "point", beat: 29, box: PAGE4 }],
    ] as const)
        it(`moves the whole hold and where it arrives (${mode})`, async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await show(db);
            await holdFromPreviousPage({ db, pageBox: PAGE4, marcherIds: [a] });
            const spans = await spansOf(db, a);
            const before = await snapshot(db);

            await edit(db, target, [{ marcherId: a, xy: FAR }]);
            expect(await spansOf(db, a)).toEqual(spans);
            expect(await marksOf(db, a)).toEqual([OVER(17, 33)]);
            // Page 2's arrival moved, and the whole hold with it
            expect((await atFlags(db, a)).slice(1, 5)).toEqual([
                ONE,
                FAR,
                FAR,
                FAR,
            ]);
            await roundTrip(db, before, await snapshot(db));
        });

    it("Basic refuses when the hold reaches back to a mid-page end of an Expert move", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        // Over [5, 13): it crosses page 2's flag at 9, and ends mid-page
        await move(db, { start: 5, end: 13 }, [{ marcherId: c, xy: FAR }]);
        const held = await holdFromPreviousPage({
            db,
            pageBox: PAGE4,
            marcherIds: [c],
        });
        expect(held.held).toEqual([c]);
        expect(await marksOf(db, c)).toEqual([OVER(13, PAGE4.end)]);
        const before = await snapshot(db);
        const error = await edit(db, { kind: "point", beat: 29, box: PAGE4 }, [
            { marcherId: c, xy: AWAY },
        ]).catch((e: unknown) => e);
        expect((error as Error).name).toBe("TimelineEditRefusedError");
        expect((error as Error).message).toMatch(/is Held from an Expert move/);
        expect(await snapshot(db)).toEqual(before);
    });

    it("from the starting spot, a drag on the hold's first page moves the starting spot", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [c] });
        // The hold starts at count 1, and so does Page 1's window: it moves the hold. A later
        // page's window would start inside the hold and win (#476)
        const result = await edit(db, { kind: "range", start: 1, end: 9 }, [
            { marcherId: c, xy: FAR },
        ]);
        expect(result.homes).toEqual([c]);
        expect(await atFlags(db, c)).toEqual(
            Array.from({ length: 6 }, () => FAR),
        );
        expect(await marksOf(db, c)).toEqual([OVER(1, 25)]);
        expect(await spansOf(db, c)).toEqual([]);
    });

    it("whose arrival has since become a shape's move is skipped and named", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await holdFromPreviousPage({ db, pageBox: PAGE4, marcherIds: [a] });
        await shapeRecipeIn(db, await moveEndingAt(db, a, PAGE2.end), a, TWO);
        const before = await snapshot(db);
        const result = await edit(db, { kind: "range", ...PAGE3 }, [
            { marcherId: a, xy: FAR },
        ]);
        expect(result.skipped?.message).toContain("shape");
        expect(await snapshot(db)).toEqual(before);
    });

    it("then removing the keyframe it grows out of takes the hold away (decision 17)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await holdFromPreviousPage({ db, pageBox: PAGE4, marcherIds: [a] });
        const before = await snapshot(db);
        await unsetMarchersAt({
            db,
            beat: PAGE2.end,
            marcherIds: [a],
            keepLaterPages: false,
        });
        expect(await spansOf(db, a)).toEqual([[1, 9]]);
        expect(await marksOf(db, a)).toEqual([]);
        await roundTrip(db, before, await snapshot(db));
    });
});

describeDbTests(
    "The upkeep keeps every hold growing out of something",
    (it) => {
        it("a leftover with nothing arriving reaches back to the last row end", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b } = await show(db);
            await leftover(db, a, 25, 33);
            const before = await snapshot(db);
            await move(db, PAGE3, [{ marcherId: b, xy: FAR }]);
            expect(await marksOf(db, a)).toEqual([OVER(17, 33)]);
            await roundTrip(db, before, await snapshot(db));
        });

        it("a leftover reaches back to the marcher's earlier hold and merges", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b } = await show(db);
            await leftover(db, a, 17, 21);
            await leftover(db, a, 29, 33);
            const before = await snapshot(db);
            await move(db, PAGE3, [{ marcherId: b, xy: FAR }]);
            expect(await marksOf(db, a)).toEqual([OVER(17, 33)]);
            await roundTrip(db, before, await snapshot(db));
        });

        it("a leftover from the starting spot reaches back to the start of the show", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { b, c } = await show(db);
            await leftover(db, c, 17, 25);
            await move(db, PAGE3, [{ marcherId: b, xy: FAR }]);
            expect(await marksOf(db, c)).toEqual([OVER(1, 25)]);
        });

        it("a new move before a hold from the starting spot: the hold reaches back to it", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { c } = await show(db);
            await leftover(db, c, 17, 25);
            const before = await snapshot(db);
            await move(db, PAGE1, [{ marcherId: c, xy: ONE }]);
            expect(await marksOf(db, c)).toEqual([OVER(9, 25)]);
            expect((await atFlags(db, c)).slice(1, 4)).toEqual([ONE, ONE, ONE]);
            await roundTrip(db, before, await snapshot(db));
        });

        it("Set as shown before a hold from the starting spot: the same", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { c } = await show(db);
            await leftover(db, c, 17, 25);
            const result = await setAsShownOnPage({
                db,
                pageBox: PAGE1,
                marcherIds: [c],
            });
            expect(result.changed).toEqual([c]);
            expect(await marksOf(db, c)).toEqual([OVER(9, 25)]);
        });

        it("a row ending at its start without arriving leaves it nothing, so it goes", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { c } = await show(db);
            await leftover(db, c, 17, 25);
            await partOfALongerMove(db, c);
            expect(await marksOf(db, c)).toEqual([]);
        });

        it("a deleted page flag at its start: the move runs to the next flag, and the hold follows it", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await show(db);
            await holdFromPreviousPage({ db, pageBox: PAGE4, marcherIds: [a] });
            const before = await snapshot(db);
            // Page 2 now runs over page 3's counts too: the flag at 17 goes
            await deletePages({ db, pageIds: new Set([await pageId(db, 3)]) });
            await timelineResolverSettled();
            expect(await spansOf(db, a)).toEqual([
                [1, 9],
                [9, 25],
            ]);
            expect(await marksOf(db, a)).toEqual([OVER(25, 33)]);
            await roundTrip(db, before, await snapshot(db));
        });

        for (const [what, run, mark, spans] of [
            [
                "a resize of the move it grows out of",
                (db: DbConnection, id: number) =>
                    resizeTimeline({ db, timelineId: id, start: 9, end: 29 }),
                OVER(29, 33),
                [
                    [1, 9],
                    [9, 29],
                ],
            ],
            [
                "a clip drag of the move it grows out of",
                (db: DbConnection, id: number) =>
                    shiftTimeline({ db, timelineId: id, delta: 10 }),
                OVER(27, 33),
                [
                    [1, 9],
                    [19, 27],
                ],
            ],
        ] as const) {
            it(`${what}: the hold's start follows it`, async ({
                db,
                marchersAndPages: _,
            }) => {
                const { a } = await show(db);
                await holdFromPreviousPage({
                    db,
                    pageBox: PAGE4,
                    marcherIds: [a],
                });
                const before = await snapshot(db);
                await run(db, await moveEndingAt(db, a, PAGE2.end));
                expect(await spansOf(db, a)).toEqual(spans);
                expect(await marksOf(db, a)).toEqual([mark]);
                await roundTrip(db, before, await snapshot(db));
            });

            it(`${what}, over a leftover's start: trimmed to that row's end`, async ({
                db,
                marchersAndPages: _,
            }) => {
                const { a } = await show(db);
                await leftover(db, a, 25, 33);
                const before = await snapshot(db);
                await run(db, await moveEndingAt(db, a, PAGE2.end));
                expect(await marksOf(db, a)).toEqual([mark]);
                await roundTrip(db, before, await snapshot(db));
            });
        }

        it("a re-time past the hold's end leaves it no counts, so it goes; undo brings it back", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await show(db);
            await holdFromPreviousPage({ db, pageBox: PAGE4, marcherIds: [a] });
            const before = await snapshot(db);
            await resizeTimeline({
                db,
                timelineId: await moveEndingAt(db, a, PAGE2.end),
                start: 9,
                end: 35,
            });
            expect(await marksOf(db, a)).toEqual([]);
            await roundTrip(db, before, await snapshot(db));
        });
    },
);
