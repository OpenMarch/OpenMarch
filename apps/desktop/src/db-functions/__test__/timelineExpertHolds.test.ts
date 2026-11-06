import { afterEach, expect } from "vitest";
import { getTableName } from "drizzle-orm";
import { FieldProperties, type XY } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { legacyMockNCAAFieldProperties } from "@/__mocks__/globalMocks";
import { readShowTiming } from "@/timeline/showTiming";
import { timelineStepSize } from "@/timeline/timelinePaths";
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
import { holdFromPreviousPage } from "../timelineHoldFromPrevious";
import { holdOverWindow } from "../timelineHoldOverWindow";
import { makeSelectedHeld } from "../timelineMakeHeld";
import { createTimelinesInTransaction } from "../timelines";
import { createTimelineShapesInTransaction } from "../timelineShapes";
import { createTimelineTransitionsInTransaction } from "../timelineTransitionsInTransaction";
import { createTimelineAssignmentsInTransaction } from "../timelineAssignments";

keepFixturesInPageMode(
    "its tests trim the show, write timeline rows and set the flag themselves",
);

/**
 * **Expert hold tools** (fork #476; holds README decisions 3, 4 and 6, review R1, R2 and R8;
 * 01-edit-rules E2, "Hold over the window", "Make all selected Held"; demo scenarios M6, B2, R8).
 *
 * The show: home, page 1 [1, 9), page 2 [9, 17), page 3 [17, 25), page 4 [25, 33); beat ids equal
 * their ordinals. Marchers `a` and `b` move on page 2 (one page move) and are Not defined on pages
 * 3 and 4; `c` never moves.
 */

afterEach(() => stopTimelineResolver());

const UP: XY = [100, 100];
const UP2: XY = [200, 100];
const FAR: XY = [500, 260];
const AWAY: XY = [320, 40];
const PAGE2 = { start: 9, end: 17 };
const PAGE3 = { start: 17, end: 25 };
const PAGE4 = { start: 25, end: 33 };

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

/** Where `marcherId` stands at each count of `[start, end]`. */
const atCounts = async (marcherId: number, start: number, end: number) => {
    await timelineResolverSettled();
    return Array.from(
        { length: end - start + 1 },
        (_, i) => resolver().positionAt(marcherId, start + i) as XY,
    );
};

const at = async (marcherId: number, beat: number) =>
    (await atCounts(marcherId, beat, beat))[0]!;

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

/** An Expert window drag: the start flag at `range.start`, the playhead at `range.end`. */
const move = (
    db: DbConnection,
    range: { start: number; end: number },
    moves: { marcherId: number; xy: XY }[],
) => edit(db, { kind: "range", ...range }, moves);

const rowsOf = async (db: DbConnection, marcherId: number) =>
    (await db.select().from(schema.timeline_assignments).all())
        .filter((r) => r.marcher_id === marcherId)
        .sort((x, y) => x.start_beat - y.start_beat);

const spansOf = async (db: DbConnection, marcherId: number) =>
    (await rowsOf(db, marcherId)).map((r) => [r.start_beat, r.end_beat]);

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

/** Pages 1–4 in timeline mode; `a` and `b` moved on page 2, Not defined on 3 and 4. */
const show = async (db: DbConnection) => {
    const pages = await pagesInOrder(db);
    await deletePages({
        db,
        pageIds: new Set(pages.filter((p) => p.order >= 2).map((p) => p.id)),
    });
    for (let i = 0; i < 3; i++) await createLastPage({ db, newPageCounts: 8 });
    await setTimelineFlag(db);
    await startTimelineResolver(db);
    const [a, b, c] = resolver().marcherIds();
    await move(db, PAGE2, [
        { marcherId: a!, xy: UP },
        { marcherId: b!, xy: UP2 },
    ]);
    return { a: a!, b: b!, c: c! };
};

/** `show`, with `a` Held on page 3, growing out of its page 2 move. */
const heldShow = async (db: DbConnection) => {
    const ids = await show(db);
    await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [ids.a] });
    expect(await marksOf(db, ids.a)).toEqual([PAGE3]);
    return ids;
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

/** A follow-the-leader move of `marcherId` alone over `range`, onto a line. */
const followTheLeader = (
    db: DbConnection,
    marcherId: number,
    range: { start: number; end: number },
) =>
    transactionWithHistory(db, "ftl", async (tx) => {
        const [t] = await createTimelinesInTransaction({
            tx,
            newTimelines: [
                { name: "Ftl", startBeat: range.start, endBeat: range.end },
            ],
        });
        const [shape] = await createTimelineShapesInTransaction({
            tx,
            newShapes: [
                {
                    kind: "line",
                    geometry: {
                        points: [
                            [100, 300],
                            [900, 340],
                        ],
                    },
                },
            ],
        });
        const [made] = await createTimelineTransitionsInTransaction({
            tx,
            newTransitions: [
                {
                    timelineId: t!.id,
                    slotCount: 1,
                    destination: { kind: "shape", shapeId: shape!.id },
                    pathStyle: "follow_the_leader",
                    pathParams: { waypoints: [] },
                    orderMode: "slot",
                },
            ],
        });
        await createTimelineAssignmentsInTransaction({
            tx,
            newAssignments: [
                {
                    marcherId,
                    transitionId: made!.id,
                    slotIndex: 0,
                    startBeat: range.start,
                    endBeat: range.end,
                    layer: 1,
                },
            ],
        });
    });

describeDbTests("An Expert window and a Held hold (R2, M6)", (it) => {
    it("M6: a window that starts inside the hold wins: the hold ends at the start flag and the window is a move", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await heldShow(db);
        const before = await snapshot(db);
        const result = await move(db, { start: 19, end: 23 }, [
            { marcherId: a, xy: FAR },
        ]);
        expect(result.slots.length).toBeGreaterThan(0);
        expect(await marksOf(db, a)).toEqual([{ start: 17, end: 19 }]);
        expect(await spansOf(db, a)).toEqual([
            [9, 17],
            [19, 23],
        ]);
        // Held on page 2's spot up to the start flag, then walking to FAR at the playhead
        expect(await atCounts(a, 17, 19)).toEqual([UP, UP, UP]);
        expect(await at(a, 23)).toEqual(FAR);
        // Page 2's spot is unchanged: the hold's arrival wasn't edited
        expect(await at(a, 17)).toEqual(UP);
        await roundTrip(db, before, await snapshot(db));
        expect(await marksOf(db, a)).toEqual([{ start: 17, end: 19 }]);
    });

    it("a window starting at or before the hold's start and ending inside it moves the whole hold", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await heldShow(db);
        await move(db, { start: 13, end: 21 }, [{ marcherId: a, xy: FAR }]);
        expect(await marksOf(db, a)).toEqual([PAGE3]);
        expect(await spansOf(db, a)).toEqual([[9, 17]]);
        expect(await atCounts(a, 17, 25)).toEqual(Array(9).fill(FAR));
    });

    it("a window that covers the hold takes it away: the window is a move", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await heldShow(db);
        const before = await snapshot(db);
        await move(db, { start: 17, end: 33 }, [{ marcherId: a, xy: FAR }]);
        expect(await marksOf(db, a)).toEqual([]);
        expect(await spansOf(db, a)).toEqual([
            [9, 17],
            [17, 33],
        ]);
        expect(await at(a, 33)).toEqual(FAR);
        await roundTrip(db, before, await snapshot(db));
    });

    it("B2: a mixed drag edits each marcher by its own kind", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await heldShow(db);
        const result = await move(db, { start: 17, end: 21 }, [
            { marcherId: a, xy: FAR },
            { marcherId: b, xy: AWAY },
        ]);
        expect(result.skipped).toBeUndefined();
        // a, Held: its whole hold moved with its page 2 arrival
        expect(await marksOf(db, a)).toEqual([PAGE3]);
        expect(await spansOf(db, a)).toEqual([[9, 17]]);
        expect(await atCounts(a, 17, 25)).toEqual(Array(9).fill(FAR));
        // b, Not defined: a new move on page 3, from page 2's spot
        expect(await spansOf(db, b)).toEqual([
            [9, 17],
            [17, 21],
        ]);
        expect(await at(b, 17)).toEqual(UP2);
        expect(await at(b, 21)).toEqual(AWAY);
    });
});

describeDbTests("Hold over the window (R8)", (it) => {
    it("removes the selected marchers' moves inside the window and holds them over it", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        // a takes a short walk inside page 3
        await move(db, { start: 19, end: 23 }, [{ marcherId: a, xy: FAR }]);
        const before = await snapshot(db);
        const bBefore = await atCounts(b, 0, 33);

        const result = await holdOverWindow({
            db,
            window: { start: 17, end: 29 },
            marcherIds: [a],
        });
        await timelineResolverSettled();
        expect(result).toEqual({ held: [a], skipped: [] });
        expect(await spansOf(db, a)).toEqual([[9, 17]]);
        expect(await marksOf(db, a)).toEqual([{ start: 17, end: 29 }]);
        expect(await atCounts(a, 17, 29)).toEqual(Array(13).fill(UP));
        // Unselected marchers are untouched
        expect(await atCounts(b, 0, 33)).toEqual(bBefore);
        await roundTrip(db, before, await snapshot(db));
    });

    it("R8: with nothing arriving at the start flag, the hold starts where the marcher last arrived", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await move(db, { start: 21, end: 23 }, [{ marcherId: a, xy: FAR }]);
        const result = await holdOverWindow({
            db,
            window: { start: 19, end: 31 },
            marcherIds: [a],
        });
        await timelineResolverSettled();
        expect(result.held).toEqual([a]);
        expect(await spansOf(db, a)).toEqual([[9, 17]]);
        // Standing on page 2's spot throughout, as it already did up to the start flag
        expect(await marksOf(db, a)).toEqual([{ start: 17, end: 31 }]);
        expect(await atCounts(a, 17, 31)).toEqual(Array(15).fill(UP));
    });

    it("cuts a move crossing each edge: the one crossing the playhead keeps its destination and walks faster, which the step-size warning flags", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        // c walks over counts 13–29 at an even pace
        await move(db, { start: 13, end: 29 }, [{ marcherId: c, xy: FAR }]);
        const along = await atCounts(c, 13, 29);
        const pages = await pagesInOrder(db);
        const page4 = pages[4]!;
        const page3 = pages[3]!;
        const fieldProperties = new FieldProperties(
            legacyMockNCAAFieldProperties,
        );
        const stepOnPage4 = () =>
            timelineStepSize({
                resolver: resolver(),
                marcherId: c,
                page: page4,
                previousPage: page3,
                fieldProperties,
            })!;
        const evenStep = stepOnPage4();
        const before = await snapshot(db);

        const result = await holdOverWindow({
            db,
            window: { start: 17, end: 25 },
            marcherIds: [c],
        });
        await timelineResolverSettled();
        expect(result.held).toEqual([c]);
        expect(await spansOf(db, c)).toEqual([
            [13, 17],
            [25, 29],
        ]);
        expect(await marksOf(db, c)).toEqual([PAGE3]);
        // Unchanged up to the start flag, then held there, then on to FAR at the same count
        expect(await atCounts(c, 13, 17)).toEqual(along.slice(0, 5));
        expect(await atCounts(c, 17, 25)).toEqual(Array(9).fill(along[4]));
        expect(await at(c, 29)).toEqual(FAR);
        // Three times the distance per count after the window: 12 sixteenths in 4 counts
        const compressed = stepOnPage4();
        expect(compressed.inchesPerStep).toBeCloseTo(
            evenStep.inchesPerStep * 3,
            5,
        );
        // A threshold the even walk is under: the compressed one is over it, so it's flagged
        const threshold = evenStep.inchesPerStep * 2;
        expect(evenStep.exceedsThreshold(threshold)).toBe(false);
        expect(compressed.exceedsThreshold(threshold)).toBe(true);
        await roundTrip(db, before, await snapshot(db));
    });

    it("joins a hold it touches, and leaves a marcher Held over the whole window alone", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await heldShow(db);
        const joined = await holdOverWindow({
            db,
            window: { start: 25, end: 29 },
            marcherIds: [a],
        });
        expect(joined.held).toEqual([a]);
        expect(await marksOf(db, a)).toEqual([{ start: 17, end: 29 }]);
        const rows = await snapshot(db);
        const again = await holdOverWindow({
            db,
            window: { start: 19, end: 27 },
            marcherIds: [a],
        });
        expect(again).toEqual({
            held: [],
            skipped: [{ marcherId: a, reason: "held" }],
        });
        expect(await snapshot(db)).toEqual(rows);
    });

    it("a follow-the-leader member keeps its move and is named with why; the others are Held", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, c } = await show(db);
        await followTheLeader(db, c, { start: 19, end: 27 });
        await timelineResolverSettled();
        const cBefore = await spansOf(db, c);
        const result = await holdOverWindow({
            db,
            window: { start: 17, end: 25 },
            marcherIds: [a, c],
        });
        expect(result).toEqual({
            held: [a],
            skipped: [{ marcherId: c, reason: "followLeader" }],
        });
        expect(await spansOf(db, c)).toEqual(cBefore);
        expect(await marksOf(db, c)).toEqual([]);
        expect(await marksOf(db, a)).toEqual([PAGE3]);
    });
});

describeDbTests("Make all selected Held (R1, B2)", (it) => {
    it("gives the Not defined marchers a hold like the Held one's; undo restores it", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b, c } = await heldShow(db);
        // c walks through count 21, so it can't be Held there
        await move(db, { start: 19, end: 23 }, [{ marcherId: c, xy: FAR }]);
        const before = await snapshot(db);
        const result = await makeSelectedHeld({
            db,
            beat: 21,
            marcherIds: [a, b, c],
        });
        expect(result).toEqual({
            held: [b],
            skipped: [{ marcherId: c, reason: "moving" }],
        });
        expect(await marksOf(db, b)).toEqual([PAGE3]);
        expect(await marksOf(db, a)).toEqual([PAGE3]);
        await roundTrip(db, before, await snapshot(db));

        // Both Held now: a drag inside the hold moves both holds (B2, "Or: …")
        await move(db, { start: 17, end: 21 }, [
            { marcherId: a, xy: FAR },
            { marcherId: b, xy: AWAY },
        ]);
        expect(await atCounts(a, 17, 25)).toEqual(Array(9).fill(FAR));
        expect(await atCounts(b, 17, 25)).toEqual(Array(9).fill(AWAY));
        expect(await marksOf(db, b)).toEqual([PAGE3]);
    });

    it("ends the hold at the marcher's next move, and holds a marcher on its starting spot from the Held one's start", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b, c } = await heldShow(db);
        await holdFromPreviousPage({ db, pageBox: PAGE4, marcherIds: [a] });
        expect(await marksOf(db, a)).toEqual([{ start: 17, end: 33 }]);
        // b walks again from count 27
        await move(db, { start: 27, end: 31 }, [{ marcherId: b, xy: FAR }]);
        const result = await makeSelectedHeld({
            db,
            beat: 21,
            marcherIds: [a, b, c],
        });
        expect(result.held).toEqual([b, c]);
        expect(await marksOf(db, b)).toEqual([{ start: 17, end: 27 }]);
        expect(await marksOf(db, c)).toEqual([{ start: 17, end: 33 }]);
    });

    it("with a marcher whose own last arrival is earlier, its hold starts there", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        // a walks again over page 3 and is Held on page 4; b last arrived at 17
        await move(db, PAGE3, [{ marcherId: a, xy: FAR }]);
        await holdFromPreviousPage({ db, pageBox: PAGE4, marcherIds: [a] });
        const result = await makeSelectedHeld({
            db,
            beat: 29,
            marcherIds: [a, b],
        });
        expect(result.held).toEqual([b]);
        expect(await marksOf(db, b)).toEqual([{ start: 17, end: 33 }]);
        expect(await atCounts(b, 17, 33)).toEqual(Array(17).fill(UP2));
    });
});
