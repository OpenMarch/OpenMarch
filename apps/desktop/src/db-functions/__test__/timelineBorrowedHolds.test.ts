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
 * **Borrowed holds** (fork #474; holds 04-anchors, "Borrowed hold"; demo scenario "Anchors ·
 * Borrowed hold"). A Held hold that nothing arrives at borrows its spot from the last set: it holds
 * wherever the marcher already is there. Which kind a hold is follows from the rows, so nothing
 * extra is stored:
 *
 * - Hold from previous page makes one where nothing arrives at the previous flag;
 * - removing the set it borrows from leaves it, now borrowing from the set before;
 * - a deleted page flag at its start leaves it mid-page;
 * - a drag inside adds a move ending at its start, from the latest of the last arrival, an earlier
 *   hold's end and the page flag before, and the hold then grows out of that diamond (and goes with
 *   it, decision 17).
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

/** `show`, with `a` Held on page 4: nothing arrives at page 3's flag, so it borrows page 2's spot. */
const borrowedShow = async (db: DbConnection) => {
    const ids = await show(db);
    const result = await holdFromPreviousPage({
        db,
        pageBox: PAGE4,
        marcherIds: [ids.a],
    });
    expect(result).toEqual({ held: [ids.a], skipped: [] });
    return ids;
};

describeDbTests("Hold from previous page where nothing arrives", (it) => {
    it("makes a borrowed hold over this page only, standing where the last set left it", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        const flags = await atFlags(db, a);
        const before = await snapshot(db);
        const result = await holdFromPreviousPage({
            db,
            pageBox: PAGE4,
            marcherIds: [a],
        });
        expect(result).toEqual({ held: [a], skipped: [] });
        expect(await marksOf(db, a)).toEqual([PAGE4]);
        // Nothing moves, and no move is written: page 3 stays Not defined
        expect(await atFlags(db, a)).toEqual(flags);
        expect(await spansOf(db, a)).toEqual([
            [1, 9],
            [9, 17],
        ]);
        await roundTrip(db, before, await snapshot(db));
    });

    it("a marcher whose move ends mid-page borrows that spot", async ({
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
        expect(result).toEqual({ held: [c], skipped: [] });
        expect(await marksOf(db, c)).toEqual([PAGE3]);
        expect((await atFlags(db, c)).slice(2, 5)).toEqual([FAR, FAR, FAR]);
    });

    it("holding the next page too joins the borrowed hold", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await borrowedShow(db);
        await holdFromPreviousPage({ db, pageBox: PAGE5, marcherIds: [a] });
        expect(await marksOf(db, a)).toEqual([
            { start: PAGE4.start, end: PAGE5.end },
        ]);
    });
});

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

describeDbTests(
    "Hold from previous page checks the borrowed spot's move",
    (it) => {
        // A carried shape is the shape's hold (owner, 2026-11-01): the move a hold would borrow from is
        // checked as an arrival is
        it("skips, and names, a marcher whose last move is a placed shape's move", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b } = await show(db);
            await shapeRecipeIn(
                db,
                await moveEndingAt(db, a, PAGE2.end),
                a,
                TWO,
            );
            const result = await holdFromPreviousPage({
                db,
                pageBox: PAGE4,
                marcherIds: [a, b],
            });
            expect(result).toEqual({
                held: [b],
                skipped: [{ marcherId: a, reason: "arrivalShape" }],
            });
            expect(await marksOf(db, a)).toEqual([]);
        });

        it("skips, and names, a marcher whose last move follows the leader", async ({
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
    },
);

describeDbTests("A borrowed hold stays through edits", (it) => {
    it("removing the set it borrows from leaves it, borrowing from the set before", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await borrowedShow(db);
        const before = await snapshot(db);
        // Remove keyframe on page 2's flag, its pages moving back too (the demo's step 3)
        await unsetMarchersAt({
            db,
            beat: PAGE2.end,
            marcherIds: [a],
            keepLaterPages: false,
        });
        expect(await spansOf(db, a)).toEqual([[1, 9]]);
        expect(await marksOf(db, a)).toEqual([PAGE4]);
        // It now stands at page 1's spot, through the hold
        expect((await atFlags(db, a)).slice(1)).toEqual([
            ONE,
            ONE,
            ONE,
            ONE,
            ONE,
        ]);
        await roundTrip(db, before, await snapshot(db));
    });

    it("a move on an earlier page that doesn't end at its start leaves it", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await borrowedShow(db);
        await move(db, PAGE2, [{ marcherId: a, xy: FAR }]);
        expect(await marksOf(db, a)).toEqual([PAGE4]);
        expect((await atFlags(db, a)).slice(3, 6)).toEqual([FAR, FAR, FAR]);
    });

    it("a deleted page flag at its start leaves it mid-page, on the same counts", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await borrowedShow(db);
        const before = await snapshot(db);
        // Page 3 now runs over page 4's counts too: the flag at 25 goes
        await deletePages({ db, pageIds: new Set([await pageId(db, 4)]) });
        await timelineResolverSettled();
        expect(await marksOf(db, a)).toEqual([PAGE4]);
        await roundTrip(db, before, await snapshot(db));
    });

    it("a hold from the starting spot that an earlier move no longer leads to borrows that move's spot", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [c] });
        const before = await snapshot(db);
        await move(db, PAGE1, [{ marcherId: c, xy: FAR }]);
        expect(await marksOf(db, c)).toEqual([PAGE3]);
        expect((await atFlags(db, c)).slice(1, 4)).toEqual([FAR, FAR, FAR]);
        await roundTrip(db, before, await snapshot(db));
    });

    it("Set as shown on an earlier page leaves a hold from the starting spot, now borrowed", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [c] });
        const result = await setAsShownOnPage({
            db,
            pageBox: PAGE1,
            marcherIds: [c],
        });
        expect(result.changed).toEqual([c]);
        expect(await marksOf(db, c)).toEqual([PAGE3]);
    });
});

describeDbTests("A move re-timed over a borrowed hold's start", (it) => {
    // 04-anchors: a re-time over a hold's start trims it from the start, and the hold then grows
    // out of that move's end (demo `normalize`: `k.start = cover.end`)
    for (const [what, run, mark, spans] of [
        [
            "a resize of the move before it to end inside it",
            (db: DbConnection, id: number) =>
                resizeTimeline({ db, timelineId: id, start: 9, end: 29 }),
            { start: 29, end: 33 },
            [
                [1, 9],
                [9, 29],
            ],
        ],
        [
            "a clip drag of the move before it over its start",
            (db: DbConnection, id: number) =>
                shiftTimeline({ db, timelineId: id, delta: 10 }),
            { start: 27, end: 33 },
            [
                [1, 9],
                [19, 27],
            ],
        ],
    ] as const)
        it(`${what}: the hold is trimmed from its start and grows out of that move`, async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await borrowedShow(db);
            const before = await snapshot(db);
            await run(db, await moveEndingAt(db, a, PAGE2.end));
            expect(await spansOf(db, a)).toEqual(spans);
            expect(await marksOf(db, a)).toEqual([mark]);
            // Held from the move's new end to the hold's end, on page 2's spot
            expect(await atCounts(db, a, mark.start, mark.end)).toEqual(
                Array.from({ length: mark.end - mark.start + 1 }, () => TWO),
            );
            await roundTrip(db, before, await snapshot(db));
            expect(await marksOf(db, a)).toEqual([mark]);
        });

    it("a re-time past the hold's end leaves it no counts, so it goes; undo brings it back", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await borrowedShow(db);
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
});

describeDbTests("A drag inside a borrowed hold", (it) => {
    it("adds a move ending at the hold's start, from the flag before, and the hold grows out of it", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await borrowedShow(db);
        const before = await snapshot(db);
        await move(db, { start: PAGE4.start, end: 29 }, [
            { marcherId: a, xy: AWAY },
        ]);
        // A move on page 3, ending at the hold's start; pages 1 and 2 untouched
        expect(await spansOf(db, a)).toEqual([
            [1, 9],
            [9, 17],
            [17, 25],
        ]);
        expect(await marksOf(db, a)).toEqual([PAGE4]);
        const flags = await atFlags(db, a);
        expect(flags.slice(1, 3)).toEqual([ONE, TWO]);
        expect(flags.slice(3)).toEqual([AWAY, AWAY, AWAY]);
        await roundTrip(db, before, await snapshot(db));
    });

    it("whose source has since become a shape's move still adds a move of its own, leaving the shape's move alone", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await borrowedShow(db);
        // A later edit puts a shape on page 2: its recipe holds a in the move the hold borrows from
        const source = await moveEndingAt(db, a, PAGE2.end);
        await shapeRecipeIn(db, source, a, TWO);
        const before = await snapshot(db);
        const result = await move(db, { start: PAGE4.start, end: 29 }, [
            { marcherId: a, xy: AWAY },
        ]);
        // The drag rewrites only the move it adds on page 3, not the shape's move, so nothing is
        // skipped: the hold now grows out of the added move's diamond
        expect(result.skipped).toBeUndefined();
        expect(await spansOf(db, a)).toEqual([
            [1, 9],
            [9, 17],
            [17, 25],
        ]);
        expect(await moveEndingAt(db, a, PAGE2.end)).toBe(source);
        expect(await marksOf(db, a)).toEqual([PAGE4]);
        const flags = await atFlags(db, a);
        expect(flags.slice(1, 3)).toEqual([ONE, TWO]);
        expect(flags.slice(3)).toEqual([AWAY, AWAY, AWAY]);
        await roundTrip(db, before, await snapshot(db));
    });

    it("then removing that keyframe takes the hold away (decision 17)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await borrowedShow(db);
        await move(db, { start: PAGE4.start, end: 29 }, [
            { marcherId: a, xy: AWAY },
        ]);
        await unsetMarchersAt({
            db,
            beat: PAGE4.start,
            marcherIds: [a],
            keepLaterPages: false,
        });
        expect(await marksOf(db, a)).toEqual([]);
        expect(await spansOf(db, a)).toEqual([
            [1, 9],
            [9, 17],
        ]);
    });

    it("a Basic point edit inside it does the same", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await borrowedShow(db);
        await edit(db, { kind: "point", beat: 29, box: PAGE4 }, [
            { marcherId: a, xy: AWAY },
        ]);
        expect(await spansOf(db, a)).toEqual([
            [1, 9],
            [9, 17],
            [17, 25],
        ]);
        expect(await marksOf(db, a)).toEqual([PAGE4]);
        expect((await atFlags(db, a)).slice(3)).toEqual([AWAY, AWAY, AWAY]);
    });

    it("starts the move at the last arrival when that's after the flag before", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        await move(db, { start: 9, end: 13 }, [{ marcherId: c, xy: FAR }]);
        // c's move ends mid-page 2: Held on page 3, it borrows the spot reached at 13
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [c] });
        expect(await marksOf(db, c)).toEqual([PAGE3]);
        await move(db, { start: PAGE3.start, end: 21 }, [
            { marcherId: c, xy: AWAY },
        ]);
        expect(await spansOf(db, c)).toEqual([
            [9, 13],
            [13, 17],
        ]);
        expect(await atCounts(db, c, 13, 13)).toEqual([FAR]);
        expect((await atFlags(db, c)).slice(3, 5)).toEqual([AWAY, AWAY]);
    });

    it("starts the move where an earlier hold ends, so it never covers it", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { b } = await show(db);
        // b: Held on page 2, from its page 1 arrival; then page 2's flag goes, so that hold
        // ends mid-page (17) on page 2's counts [9, 25)
        await holdFromPreviousPage({ db, pageBox: PAGE2, marcherIds: [b] });
        await deletePages({ db, pageIds: new Set([await pageId(db, 3)]) });
        await timelineResolverSettled();
        expect(await marksOf(db, b)).toEqual([PAGE2]);
        // Held on page 4 [25, 33) borrows page 1's spot; the flag before it is 9 now
        await holdFromPreviousPage({ db, pageBox: PAGE4, marcherIds: [b] });
        expect(await marksOf(db, b)).toEqual([PAGE2, PAGE4]);
        await move(db, { start: PAGE4.start, end: 29 }, [
            { marcherId: b, xy: AWAY },
        ]);
        expect(await spansOf(db, b)).toEqual([
            [1, 9],
            [17, 25],
        ]);
        expect(await marksOf(db, b)).toEqual([PAGE2, PAGE4]);
        expect(await atCounts(db, b, 17, 17)).toEqual([ONE]);
        expect(await atCounts(db, b, 25, 33)).toEqual(
            Array.from({ length: 9 }, () => AWAY),
        );
    });

    it("a drag inside a mid-page borrowed hold starts its move at the flag before", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await borrowedShow(db);
        await deletePages({ db, pageIds: new Set([await pageId(db, 4)]) });
        await timelineResolverSettled();
        // Page 3 is now [17, 33); the hold [25, 33) starts mid-page
        await move(db, { start: 17, end: 29 }, [{ marcherId: a, xy: AWAY }]);
        expect(await spansOf(db, a)).toEqual([
            [1, 9],
            [9, 17],
            [17, 25],
        ]);
        expect(await marksOf(db, a)).toEqual([PAGE4]);
        expect(await atCounts(db, a, 25, 33)).toEqual(
            Array.from({ length: 9 }, () => AWAY),
        );
    });
});
