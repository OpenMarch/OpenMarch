import { describe, expect } from "vitest";
import { getTableName, sql } from "drizzle-orm";
import { createResolver, type Resolver } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/test/convertPages";
import { readTimelineTables } from "@/timeline/timelineRows";
import { TimelineEditRefusedError } from "@/timeline/timelineEditRefusals";
import { performRedo, performUndo } from "../history";
import { moveMarchersInTarget, shiftSlotDestinations } from "../timelineMoves";
import {
    removePositionAtBeat,
    splitMovesAtBeatInTransaction,
} from "../timelinePointMoves";
import { transactionWithHistory } from "../history";
import { readBasicRows } from "../basicRows";
import { pointsInBox } from "@/timeline/basicSimple";

keepFixturesInPageMode(
    "its tests build their own timeline state: a show made in timeline mode",
);

/**
 * Basic mode's point writer (docs/timeline/research/basic-mode/README.md, "How Basic writes"):
 * `moveMarchersInTarget` with `{kind: "point"}` and `removePositionAtBeat`.
 *
 * The show is `marchersAndPages` made in timeline mode with no stored moves: page 0 plus pages 1
 * to 6, 8 counts each, so page N's box is `[8N - 7, 8N + 1)`. Page 2 is `[9, 17)`.
 */

type XY = [number, number];
type Box = { start: number; end: number };
const PAGE2 = { start: 9, end: 17 };
const A: XY = [300, 200];
const B: XY = [120, 80];
const C: XY = [200, 260];

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

const violations = async (db: DbConnection) =>
    await db.all(
        sql`SELECT code, transition_id, detail FROM timeline_commit_violations`,
    );

const undoSteps = async (db: DbConnection) =>
    new Set(
        (await db.select().from(schema.history_undo).all()).map(
            (r) => r.history_group,
        ),
    ).size;

/** A show made in timeline mode with no stored moves: everyone holds at home. */
const madeInTimelineMode = async (db: DbConnection) => {
    await db.delete(schema.workspace_settings);
    await db.insert(schema.workspace_settings).values({
        id: 1,
        json_data: JSON.stringify({ timelineMode: true }),
    });
    await convertPagesToTimeline(db);
    for (const table of [
        "timeline_slot_destinations",
        "timeline_assignments",
        "timeline_transitions",
        "timeline_shapes",
        "timelines",
    ])
        await db.run(sql.raw(`DELETE FROM ${table}`));
    await db.run(sql`DELETE FROM history_undo`);
    await db.run(sql`DELETE FROM history_redo`);
    const ids = (
        await db.select({ id: schema.marchers.id }).from(schema.marchers).all()
    )
        .map((m) => m.id)
        .sort((x, y) => x - y);
    return { a: ids[0]!, b: ids[1]!, c: ids[2]! };
};

const resolverOf = async (db: DbConnection): Promise<Resolver> =>
    createResolver((await readTimelineTables(db)).snapshot);

/** A marcher's rows as `[start, end, layer]`, by start. */
const rowsOf = async (db: DbConnection, marcherId: number) =>
    (await readBasicRows(db, { marcherIds: [marcherId] })).map((r) => [
        r.start,
        r.end,
        r.layer,
    ]);

/** Every timeline's range, sorted. */
const timelineRanges = async (db: DbConnection) =>
    (await db.select().from(schema.timelines).all())
        .map((t) => [t.start_beat, t.end_beat])
        .sort((x, y) => x[0]! - y[0]! || x[1]! - y[1]!);

const range = async (
    db: DbConnection,
    marcherId: number,
    start: number,
    end: number,
    [x, y]: XY,
) =>
    await moveMarchersInTarget({
        db,
        target: { kind: "range", start, end },
        moves: [{ marcherId, x, y }],
    });

const point = async (
    db: DbConnection,
    beat: number,
    moves: [number, XY][],
    { box = PAGE2, clearPage = false } = {},
) =>
    await moveMarchersInTarget({
        db,
        target: { kind: "point", beat, box },
        moves: moves.map(([marcherId, [x, y]]) => ({ marcherId, x, y })),
        clearPage,
    });

/** Undo once: the data is `before`; redo once: it is `after` again. */
const oneUndoStep = async (
    db: DbConnection,
    before: Record<string, unknown[]>,
    after: Record<string, unknown[]>,
) => {
    expect((await performUndo(db)).success).toBe(true);
    expect(await snapshot(db)).toEqual(before);
    expect((await performRedo(db)).success).toBe(true);
    expect(await snapshot(db)).toEqual(after);
};

describeDbTests("Basic point writes: the spec table", (it) => {
    it("on the flag with no move: [a, b) → (x, y), carried to later pages", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await madeInTimelineMode(db);
        const before = await snapshot(db);
        const result = await point(db, 17, [[a, A]]);
        expect(result.slots).toHaveLength(1);
        expect(await rowsOf(db, a)).toEqual([[9, 17, 0]]);
        const r = await resolverOf(db);
        for (const beat of [17, 25, 49])
            expect(r.positionAt(a, beat)).toEqual(A);
        expect(await violations(db)).toEqual([]);
        await oneUndoStep(db, before, await snapshot(db));
    });

    it("on a move's end at the flag: that move's destination is set, nothing else", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await madeInTimelineMode(db);
        await range(db, a, 9, 17, A);
        const transitionsBefore = await db
            .select({ id: schema.timeline_transitions.id })
            .from(schema.timeline_transitions)
            .all();
        const before = await snapshot(db);
        await point(db, 17, [[a, B]]);
        expect(await rowsOf(db, a)).toEqual([[9, 17, 0]]);
        expect(
            await db
                .select({ id: schema.timeline_transitions.id })
                .from(schema.timeline_transitions)
                .all(),
        ).toEqual(transitionsBefore);
        const r = await resolverOf(db);
        expect(r.positionAt(a, 17)).toEqual(B);
        expect(r.positionAt(a, 33)).toEqual(B);
        expect(await violations(db)).toEqual([]);
        await oneUndoStep(db, before, await snapshot(db));
    });

    it("inside a move: [s, P) → (x, y) and [P, e) → the old destination; the page end and later pages are unchanged", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await madeInTimelineMode(db);
        await range(db, a, 9, 17, A);
        const home = (await resolverOf(db)).positionAt(a, 9);
        const before = await snapshot(db);
        await point(db, 13, [[a, B]]);
        expect(await rowsOf(db, a)).toEqual([
            [9, 13, 0],
            [13, 17, 0],
        ]);
        const r = await resolverOf(db);
        expect(r.positionAt(a, 9)).toEqual(home);
        expect(r.positionAt(a, 13)).toEqual(B);
        for (const beat of [17, 25, 49])
            expect(r.positionAt(a, beat)).toEqual(A);
        // One timeline per range; the emptied page timeline [9, 17) is gone
        expect(await timelineRanges(db)).toEqual([
            [9, 13],
            [13, 17],
        ]);
        expect(await violations(db)).toEqual([]);
        await oneUndoStep(db, before, await snapshot(db));
    });

    it("in a hold with no move on the page (e = a): [a, P) → (x, y) and [P, b) → the held position", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await madeInTimelineMode(db);
        const home = (await resolverOf(db)).positionAt(a, 0);
        await point(db, 13, [[a, B]]);
        expect(await rowsOf(db, a)).toEqual([
            [9, 13, 0],
            [13, 17, 0],
        ]);
        const r = await resolverOf(db);
        expect(r.positionAt(a, 13)).toEqual(B);
        for (const beat of [17, 25])
            expect(r.positionAt(a, beat)).toEqual(home);
        expect(await violations(db)).toEqual([]);
    });

    it("in a hold after the last move (a < e < P < b): [e, P) → (x, y) and [P, b) → the held position", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await madeInTimelineMode(db);
        await range(db, a, 9, 13, A);
        await point(db, 15, [[a, B]]);
        expect(await rowsOf(db, a)).toEqual([
            [9, 13, 0],
            [13, 15, 0],
            [15, 17, 0],
        ]);
        const r = await resolverOf(db);
        expect(r.positionAt(a, 13)).toEqual(A);
        expect(r.positionAt(a, 15)).toEqual(B);
        expect(r.positionAt(a, 17)).toEqual(A);
        expect(r.positionAt(a, 33)).toEqual(A);
        expect(await violations(db)).toEqual([]);
    });

    it("on the flag with no move ending there (a < e): [e, b) → (x, y)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await madeInTimelineMode(db);
        await range(db, a, 9, 13, A);
        await point(db, 17, [[a, B]]);
        expect(await rowsOf(db, a)).toEqual([
            [9, 13, 0],
            [13, 17, 0],
        ]);
        const r = await resolverOf(db);
        expect(r.positionAt(a, 13)).toEqual(A);
        expect(r.positionAt(a, 17)).toEqual(B);
        expect(r.positionAt(a, 25)).toEqual(B);
        expect(await violations(db)).toEqual([]);
    });

    it("a marcher left where it is writes nothing, and an edit that changes nobody opens no undo step", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await madeInTimelineMode(db);
        await range(db, a, 9, 17, A);
        const atB13 = (await resolverOf(db)).positionAt(b, 13) as XY;
        const atA13 = (await resolverOf(db)).positionAt(a, 13) as XY;
        const before = await snapshot(db);
        const steps = await undoSteps(db);
        const result = await point(db, 13, [
            [a, atA13],
            [b, atB13],
        ]);
        expect(result.slots).toEqual([]);
        expect(await snapshot(db)).toEqual(before);
        expect(await undoSteps(db)).toBe(steps);
        // With one marcher moved, only it is written
        await point(db, 13, [
            [a, B],
            [b, atB13],
        ]);
        expect(await rowsOf(db, b)).toEqual([]);
    });

    it("dragging back onto the previous point's position removes the point (the moves merge)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await madeInTimelineMode(db);
        await range(db, a, 9, 17, A);
        await point(db, 13, [[a, B]]);
        const start = (await resolverOf(db)).positionAt(a, 9) as XY;
        const before = await snapshot(db);
        await point(db, 13, [[a, start]]);
        expect(await rowsOf(db, a)).toEqual([[9, 17, 0]]);
        const r = await resolverOf(db);
        expect(r.positionAt(a, 17)).toEqual(A);
        expect(await timelineRanges(db)).toEqual([[9, 17]]);
        expect(await violations(db)).toEqual([]);
        await oneUndoStep(db, before, await snapshot(db));
    });

    it("on the flag, a single move [a, b) dragged back to its start is removed (UI-18)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await madeInTimelineMode(db);
        await range(db, a, 9, 17, A);
        const start = (await resolverOf(db)).positionAt(a, 9) as XY;
        const result = await point(db, 17, [[a, start]]);
        expect(result.cleared).toEqual([a]);
        expect(await rowsOf(db, a)).toEqual([]);
        expect(await timelineRanges(db)).toEqual([]);
        expect((await resolverOf(db)).positionAt(a, 25)).toEqual(start);
        expect(await violations(db)).toEqual([]);
    });
});

describeDbTests("Basic point writes: a merge that goes nowhere", (it) => {
    /** The ticks Basic draws for `marcherId` on page 2 (`pointsInBox`) */
    const ticks = async (db: DbConnection, marcherId: number) =>
        pointsInBox(
            await readBasicRows(db, { marcherIds: [marcherId] }),
            marcherId,
            PAGE2,
        );

    /** Holds over [9, 13), then moves 13 → 17 to A: no tick inside page 2 */
    const holdThenMove = async (db: DbConnection) => {
        const { a, b } = await madeInTimelineMode(db);
        await range(db, a, 13, 17, A);
        await point(db, 11, [[a, B]]);
        expect(await rowsOf(db, a)).toEqual([
            [9, 11, 0],
            [11, 13, 0],
            [13, 17, 0],
        ]);
        expect(await ticks(db, a)).toEqual([11, 13]);
        return { a, b };
    };

    it("removing a point set in a hold restores the hold: no move that goes nowhere, no extra tick", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await holdThenMove(db);
        const held = (await resolverOf(db)).positionAt(a, 9) as XY;
        const before = await snapshot(db);
        const result = await removePositionAtBeat({
            db,
            beat: 11,
            box: PAGE2,
            marcherIds: [a],
        });
        expect(result.cleared).toEqual([a]);
        expect(await rowsOf(db, a)).toEqual([[13, 17, 0]]);
        expect(await ticks(db, a)).toEqual([]);
        expect(await timelineRanges(db)).toEqual([[13, 17]]);
        const r = await resolverOf(db);
        for (const beat of [9, 11, 13])
            expect(r.positionAt(a, beat)).toEqual(held);
        expect(r.positionAt(a, 17)).toEqual(A);
        expect(await violations(db)).toEqual([]);
        await oneUndoStep(db, before, await snapshot(db));
    });

    it("dragging a point set in a hold back onto the held spot restores the hold", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await holdThenMove(db);
        const held = (await resolverOf(db)).positionAt(a, 9) as XY;
        const before = await snapshot(db);
        const result = await point(db, 11, [[a, held]]);
        expect(result.cleared).toEqual([a]);
        expect(await rowsOf(db, a)).toEqual([[13, 17, 0]]);
        expect(await ticks(db, a)).toEqual([]);
        expect((await resolverOf(db)).positionAt(a, 17)).toEqual(A);
        expect(await violations(db)).toEqual([]);
        await oneUndoStep(db, before, await snapshot(db));
    });

    it("on a page it held through, the page follows earlier pages again", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await madeInTimelineMode(db);
        await point(db, 13, [[a, B]]);
        await removePositionAtBeat({
            db,
            beat: 13,
            box: PAGE2,
            marcherIds: [a],
        });
        expect(await rowsOf(db, a)).toEqual([]);
        expect(await timelineRanges(db)).toEqual([]);
        // An edit to page 1's flag carries through page 2, as before the point was set
        await point(db, 9, [[a, C]], { box: { start: 1, end: 9 } });
        const r = await resolverOf(db);
        for (const beat of [9, 13, 17, 25])
            expect(r.positionAt(a, beat)).toEqual(C);
    });

    it("a chain of points in a hold: removing the first takes the moves that go nowhere after it too", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await madeInTimelineMode(db);
        const held = (await resolverOf(db)).positionAt(a, 9) as XY;
        const before = await snapshot(db);
        await point(db, 11, [[a, B]]);
        // Inside [11, 17) → H, back at H by count 15: both halves, the second going nowhere
        await point(db, 15, [[a, held]]);
        expect(await rowsOf(db, a)).toEqual([
            [9, 11, 0],
            [11, 15, 0],
            [15, 17, 0],
        ]);
        expect(await ticks(db, a)).toEqual([11, 15]);
        await removePositionAtBeat({
            db,
            beat: 11,
            box: PAGE2,
            marcherIds: [a],
        });
        // [15, 17) → H had its only tick at 15, the end of the deleted merge: it goes too
        expect(await rowsOf(db, a)).toEqual([]);
        expect(await ticks(db, a)).toEqual([]);
        expect(await snapshot(db)).toEqual(before);
    });

    it("a point set inside a move at that move's end position keeps both halves; Remove takes it out again", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await madeInTimelineMode(db);
        await range(db, a, 9, 17, A);
        await point(db, 13, [[a, A]]);
        expect(await rowsOf(db, a)).toEqual([
            [9, 13, 0],
            [13, 17, 0],
        ]);
        expect(await ticks(db, a)).toEqual([13]);
        await removePositionAtBeat({
            db,
            beat: 13,
            box: PAGE2,
            marcherIds: [a],
        });
        expect(await rowsOf(db, a)).toEqual([[9, 17, 0]]);
        expect(await ticks(db, a)).toEqual([]);
        expect((await resolverOf(db)).positionAt(a, 17)).toEqual(A);
    });

    it("a later point keeps its tick and position when an earlier one is set to the same spot and edited again", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await madeInTimelineMode(db);
        await range(db, a, 9, 17, A);
        await point(db, 14, [[a, C]]);
        await point(db, 11, [[a, C]]);
        expect(await ticks(db, a)).toEqual([11, 14]);
        await point(db, 11, [[a, B]]);
        expect(await ticks(db, a)).toEqual([11, 14]);
        const r = await resolverOf(db);
        expect(r.positionAt(a, 11)).toEqual(B);
        expect(r.positionAt(a, 14)).toEqual(C);
        expect(r.positionAt(a, 17)).toEqual(A);
    });

    it("removing one marcher's no-motion merge and another's real merge in one step", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await holdThenMove(db);
        await range(db, b, 9, 17, A);
        await point(db, 11, [[b, C]]);
        const before = await snapshot(db);
        const result = await removePositionAtBeat({
            db,
            beat: 11,
            box: PAGE2,
            marcherIds: [a, b],
        });
        expect(result.cleared).toEqual([a]);
        expect(result.slots.map((s) => s.marcherId)).toEqual([b]);
        expect(await rowsOf(db, a)).toEqual([[13, 17, 0]]);
        expect(await rowsOf(db, b)).toEqual([[9, 17, 0]]);
        expect(await violations(db)).toEqual([]);
        await oneUndoStep(db, before, await snapshot(db));
    });
});

describeDbTests("Basic point writes: repeated and mixed edits", (it) => {
    it("splitting twice gives three moves; the page end stays", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await madeInTimelineMode(db);
        await range(db, a, 9, 17, A);
        await point(db, 13, [[a, B]]);
        await point(db, 11, [[a, C]]);
        expect(await rowsOf(db, a)).toEqual([
            [9, 11, 0],
            [11, 13, 0],
            [13, 17, 0],
        ]);
        const r = await resolverOf(db);
        expect(r.positionAt(a, 11)).toEqual(C);
        expect(r.positionAt(a, 13)).toEqual(B);
        expect(r.positionAt(a, 17)).toEqual(A);
        expect(await violations(db)).toEqual([]);
    });

    it("marchers split at different counts get different timelines; at the same count they share them", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b, c } = await madeInTimelineMode(db);
        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 9, end: 17 },
            moves: [
                { marcherId: a, x: A[0], y: A[1] },
                { marcherId: b, x: B[0], y: B[1] },
                { marcherId: c, x: C[0], y: C[1] },
            ],
        });
        await point(db, 11, [[a, C]]);
        await point(db, 13, [
            [b, A],
            [c, A],
        ]);
        expect(await rowsOf(db, a)).toEqual([
            [9, 11, 0],
            [11, 17, 0],
        ]);
        expect(await rowsOf(db, b)).toEqual([
            [9, 13, 0],
            [13, 17, 0],
        ]);
        expect(await timelineRanges(db)).toEqual([
            [9, 11],
            [9, 13],
            [11, 17],
            [13, 17],
        ]);
        const r = await resolverOf(db);
        expect(r.positionAt(a, 17)).toEqual(A);
        expect(r.positionAt(b, 17)).toEqual(B);
        expect(r.positionAt(c, 17)).toEqual(C);
        expect(await violations(db)).toEqual([]);
    });

    it("the page timeline stays for marchers that don't split", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await madeInTimelineMode(db);
        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 9, end: 17 },
            moves: [
                { marcherId: a, x: A[0], y: A[1] },
                { marcherId: b, x: B[0], y: B[1] },
            ],
        });
        await point(db, 13, [[a, C]]);
        expect(await rowsOf(db, b)).toEqual([[9, 17, 0]]);
        expect(await timelineRanges(db)).toEqual([
            [9, 13],
            [9, 17],
            [13, 17],
        ]);
    });

    it("set to previous page (clearPage on the flag) deletes every move in the box", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await madeInTimelineMode(db);
        await range(db, a, 1, 9, B);
        await range(db, a, 9, 17, A);
        await point(db, 13, [[a, C]]);
        const before = await snapshot(db);
        const result = await point(db, 17, [[a, B]], { clearPage: true });
        expect(result.cleared).toEqual([a]);
        expect(await rowsOf(db, a)).toEqual([[1, 9, 0]]);
        expect(await timelineRanges(db)).toEqual([[1, 9]]);
        const r = await resolverOf(db);
        for (const beat of [9, 13, 17, 25])
            expect(r.positionAt(a, beat)).toEqual(B);
        expect(await violations(db)).toEqual([]);
        await oneUndoStep(db, before, await snapshot(db));
    });
});

describeDbTests("Basic: remove this count's position", (it) => {
    it("merges [s, P) and [P, e) into [s, e) with the second's destination; others untouched", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await madeInTimelineMode(db);
        await range(db, a, 9, 17, A);
        await range(db, b, 9, 17, B);
        await point(db, 13, [[a, C]]);
        await point(db, 11, [[b, C]]);
        const bRows = await rowsOf(db, b);
        const before = await snapshot(db);
        const result = await removePositionAtBeat({
            db,
            beat: 13,
            box: PAGE2,
            marcherIds: [a, b],
        });
        expect(result.slots.map((s) => s.marcherId)).toEqual([a]);
        expect(await rowsOf(db, a)).toEqual([[9, 17, 0]]);
        expect(await rowsOf(db, b)).toEqual(bRows);
        const r = await resolverOf(db);
        expect(r.positionAt(a, 17)).toEqual(A);
        expect(r.positionAt(a, 13)).not.toEqual(C);
        expect(await violations(db)).toEqual([]);
        await oneUndoStep(db, before, await snapshot(db));
    });

    it("writes nothing and opens no undo step when nobody has a split there", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await madeInTimelineMode(db);
        await range(db, a, 9, 17, A);
        const before = await snapshot(db);
        const steps = await undoSteps(db);
        const result = await removePositionAtBeat({
            db,
            beat: 13,
            box: PAGE2,
            marcherIds: [a],
        });
        expect(result.slots).toEqual([]);
        expect(await snapshot(db)).toEqual(before);
        expect(await undoSteps(db)).toBe(steps);
    });

    it("refuses a beat on the flag", async ({ db, marchersAndPages: _ }) => {
        const { a } = await madeInTimelineMode(db);
        await expect(
            removePositionAtBeat({ db, beat: 17, box: PAGE2, marcherIds: [a] }),
        ).rejects.toThrow(/strictly inside/);
    });
});

describe("Basic point writes: refusals", () => {
    describeDbTests("not simple", (it) => {
        it("refuses a marcher with a move across the page's flag, writing nothing", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b } = await madeInTimelineMode(db);
            await range(db, a, 13, 21, A);
            const before = await snapshot(db);
            const error = await point(db, 15, [
                [a, B],
                [b, B],
            ]).catch((e: unknown) => e);
            expect(error).toBeInstanceOf(TimelineEditRefusedError);
            expect((error as TimelineEditRefusedError).refusal).toBe(
                "notSimple",
            );
            expect((error as TimelineEditRefusedError).marcherIds).toEqual([a]);
            expect(await snapshot(db)).toEqual(before);
        });

        it("refuses a marcher with moves overlapping on two layers", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await madeInTimelineMode(db);
            await range(db, a, 9, 17, A);
            await range(db, a, 11, 15, B);
            expect(await rowsOf(db, a)).toEqual([
                [9, 17, 0],
                [11, 15, 1],
            ]);
            await expect(point(db, 17, [[a, C]])).rejects.toBeInstanceOf(
                TimelineEditRefusedError,
            );
            await expect(
                removePositionAtBeat({
                    db,
                    beat: 15,
                    box: PAGE2,
                    marcherIds: [a],
                }),
            ).rejects.toBeInstanceOf(TimelineEditRefusedError);
        });

        it("refuses a beat outside the box and a box that isn't a page's", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await madeInTimelineMode(db);
            await expect(point(db, 9, [[a, A]])).rejects.toThrow(/isn't in/);
            await expect(point(db, 18, [[a, A]])).rejects.toThrow(/isn't in/);
            await expect(
                point(db, 12, [[a, A]], { box: { start: 9, end: 13 } }),
            ).rejects.toThrow(/page's box/);
        });
    });
});

describeDbTests("Basic point writes on a converted show", (it) => {
    /** Converted pages share one shapeless transition per page (C-11), one slot per marcher */
    const converted = async (db: DbConnection) => {
        await db.delete(schema.workspace_settings);
        await db.insert(schema.workspace_settings).values({
            id: 1,
            json_data: JSON.stringify({ timelineMode: true }),
        });
        await convertPagesToTimeline(db);
        await db.run(sql`DELETE FROM history_undo`);
        await db.run(sql`DELETE FROM history_redo`);
        const rows = await readBasicRows(db);
        const shared = rows.find((r) => r.slotCount > 1);
        expect(shared).toBeDefined();
        const box = { start: shared!.start, end: shared!.end };
        const others = rows
            .filter(
                (r) =>
                    r.transitionId === shared!.transitionId &&
                    r.marcherId !== shared!.marcherId,
            )
            .map((r) => r.marcherId);
        expect(others.length).toBeGreaterThan(0);
        return { box, marcher: shared!.marcherId, others };
    };

    /** Every count of the show, for each marcher */
    const positionsOf = async (db: DbConnection, marcherIds: number[]) => {
        const r = await resolverOf(db);
        const last = Math.max(...(await readBasicRows(db)).map((x) => x.end));
        const beats = Array.from({ length: last + 1 }, (_, b) => b);
        return marcherIds.map((m) => beats.map((b) => r.positionAt(m, b)));
    };

    it("edits one marcher's slot on the flag, and only that marcher", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { box, marcher, others } = await converted(db);
        const othersBefore = await positionsOf(db, others);
        const before = await snapshot(db);
        await point(db, box.end, [[marcher, C]], { box });
        const r = await resolverOf(db);
        expect(r.positionAt(marcher, box.end)).toEqual(C);
        expect(await positionsOf(db, others)).toEqual(othersBefore);
        expect(await violations(db)).toEqual([]);
        await oneUndoStep(db, before, await snapshot(db));
    });

    it("splits one marcher mid-page out of the shared transition, and only that marcher", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { box, marcher, others } = await converted(db);
        const mid = box.start + Math.floor((box.end - box.start) / 2);
        const r0 = await resolverOf(db);
        const endBefore = r0.positionAt(marcher, box.end);
        const othersBefore = await positionsOf(db, others);
        await point(db, mid, [[marcher, C]], { box });
        const r = await resolverOf(db);
        expect(r.positionAt(marcher, mid)).toEqual(C);
        expect(r.positionAt(marcher, box.end)).toEqual(endBefore);
        expect(await rowsOf(db, marcher)).toEqual(
            expect.arrayContaining([
                [box.start, mid, expect.any(Number)],
                [mid, box.end, expect.any(Number)],
            ]),
        );
        expect(await positionsOf(db, others)).toEqual(othersBefore);
        expect(await violations(db)).toEqual([]);
    });

    it("a point set and removed inside a shared move: positions as before, the others untouched", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { box, marcher, others } = await converted(db);
        const mid = box.start + Math.floor((box.end - box.start) / 2);
        const mine = await positionsOf(db, [marcher]);
        const othersBefore = await positionsOf(db, others);
        await point(db, mid, [[marcher, C]], { box });
        await removePositionAtBeat({
            db,
            beat: mid,
            box,
            marcherIds: [marcher],
        });
        expect(await rowsOf(db, marcher)).toEqual(
            expect.arrayContaining([[box.start, box.end, expect.any(Number)]]),
        );
        const after = (await positionsOf(db, [marcher]))[0]!;
        mine[0]!.forEach(([x, y], i) => {
            expect(after[i]![0]).toBeCloseTo(x, 9);
            expect(after[i]![1]).toBeCloseTo(y, 9);
        });
        expect(await positionsOf(db, others)).toEqual(othersBefore);
        expect(await violations(db)).toEqual([]);
    });

    it("a point set and removed where the marcher holds leaves no move; the shared transition keeps the others", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { box, marcher, others } = await converted(db);
        // Dragged back on the flag: out of the shared transition, so it holds on the page
        const start = (await resolverOf(db)).positionAt(
            marcher,
            box.start,
        ) as XY;
        await point(db, box.end, [[marcher, start]], { box });
        const inBox = async () =>
            (await rowsOf(db, marcher)).filter(
                ([s, e]) => s! < box.end && e! > box.start,
            );
        expect(await inBox()).toEqual([]);
        const holding = await positionsOf(db, [marcher]);
        const othersBefore = await positionsOf(db, others);
        const mid = box.start + Math.floor((box.end - box.start) / 2);
        await point(db, mid, [[marcher, C]], { box });
        await removePositionAtBeat({
            db,
            beat: mid,
            box,
            marcherIds: [marcher],
        });
        expect(await inBox()).toEqual([]);
        expect(await positionsOf(db, [marcher])).toEqual(holding);
        expect(await positionsOf(db, others)).toEqual(othersBefore);
        expect(await violations(db)).toEqual([]);
    });

    const vacant = async (db: DbConnection) =>
        (await resolverOf(db))
            .diagnostics()
            .filter((d) => d.code === "D-VACANT");
    const transitionsOver = async (db: DbConnection, box: Box) =>
        (await db.select().from(schema.timeline_transitions).all()).filter(
            (t) => t.start_beat === box.start && t.end_beat === box.end,
        );

    it("set all to previous page deletes the shared transition and its timeline, with no vacant slots", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { box, marcher, others } = await converted(db);
        const before = await snapshot(db);
        await point(
            db,
            box.end,
            [marcher, ...others].map((m) => [m, C] as [number, XY]),
            { box, clearPage: true },
        );
        expect(await vacant(db)).toEqual([]);
        expect(await transitionsOver(db, box)).toEqual([]);
        expect(await timelineRanges(db)).not.toContainEqual([
            box.start,
            box.end,
        ]);
        expect(await violations(db)).toEqual([]);
        await oneUndoStep(db, before, await snapshot(db));
    });

    it("set to previous page for one marcher compacts the shared transition; the others are unchanged", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { box, marcher, others } = await converted(db);
        const othersBefore = await positionsOf(db, others);
        const before = await snapshot(db);
        await point(db, box.end, [[marcher, C]], { box, clearPage: true });
        expect(await vacant(db)).toEqual([]);
        const [shared] = await transitionsOver(db, box);
        expect(shared!.slot_count).toBe(others.length);
        expect(await positionsOf(db, others)).toEqual(othersBefore);
        expect(await violations(db)).toEqual([]);
        await oneUndoStep(db, before, await snapshot(db));
    });

    it("a Move them too shift planned before a compaction doesn't move the marcher compacted into that slot", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { box, others } = await converted(db);
        const [shared] = await transitionsOver(db, box);
        const rows = (await readBasicRows(db)).filter(
            (r) => r.transitionId === shared!.id,
        );
        const first = rows.find((r) => r.slotIndex === 0)!;
        const last = rows.find((r) => r.slotIndex === rows.length - 1)!;
        await point(db, box.end, [[first.marcherId, C]], {
            box,
            clearPage: true,
        });
        // The last slot's marcher now holds slot 0
        const moved = (
            await readBasicRows(db, { marcherIds: [last.marcherId] })
        ).find((r) => r.transitionId === shared!.id)!;
        expect(moved.slotIndex).toBe(0);
        const positions = await positionsOf(db, others);
        const written = await shiftSlotDestinations({
            db,
            shifts: [
                {
                    marcherId: first.marcherId,
                    transitionId: shared!.id,
                    slotIndex: 0,
                    dx: 5,
                    dy: 5,
                },
            ],
        });
        expect(written).toEqual([]);
        expect(await positionsOf(db, others)).toEqual(positions);
    });

    it("a mid-page split out of the shared transition leaves no vacant slot", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { box, marcher, others } = await converted(db);
        const mid = box.start + Math.floor((box.end - box.start) / 2);
        const othersBefore = await positionsOf(db, others);
        const before = await snapshot(db);
        await point(db, mid, [[marcher, C]], { box });
        expect(await vacant(db)).toEqual([]);
        expect(await positionsOf(db, others)).toEqual(othersBefore);
        expect(await violations(db)).toEqual([]);
        await oneUndoStep(db, before, await snapshot(db));
    });

    it("splitting every move at a new flag (Split page) leaves no vacant slot", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { box, marcher, others } = await converted(db);
        const mid = box.start + Math.floor((box.end - box.start) / 2);
        const all = [marcher, ...others];
        const positionsBefore = await positionsOf(db, all);
        const result = await transactionWithHistory(db, "split", (tx) =>
            splitMovesAtBeatInTransaction({ tx, beat: mid, box }),
        );
        expect(result.split).toEqual(expect.arrayContaining(all));
        expect(await vacant(db)).toEqual([]);
        expect(await transitionsOver(db, box)).toEqual([]);
        const after = await positionsOf(db, all);
        positionsBefore.forEach((beats, m) =>
            beats.forEach(([x, y], b) => {
                expect(after[m]![b]![0]).toBeCloseTo(x, 9);
                expect(after[m]![b]![1]).toBeCloseTo(y, 9);
            }),
        );
        expect(await violations(db)).toEqual([]);
    });
});

describeDbTests("Basic point writes: Expert moves", (it) => {
    it("refuses a marcher with a cross-flag move on the page", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await madeInTimelineMode(db);
        await range(db, b, 13, 21, B);
        await expect(
            point(db, 15, [
                [a, C],
                [b, C],
            ]),
        ).rejects.toBeInstanceOf(TimelineEditRefusedError);
    });
});
