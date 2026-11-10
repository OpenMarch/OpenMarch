import { afterEach, expect } from "vitest";
import { eq, getTableName, sql } from "drizzle-orm";
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
import { performRedo, performUndo } from "../history";
import { createLastPage, deletePages } from "../page";
import {
    moveMarchersInTarget,
    type TimelineEditTarget,
} from "../timelineMoves";
import { readHeldMarks } from "../timelineHeldMarks";
import {
    arrivalHoldsLostInTransaction,
    keepHeldMarksTrueInTransaction,
    readHeldArrivalsBefore,
    readHeldUpkeepBefore,
} from "../timelineHeldUpkeep";
import { holdFromPreviousPage } from "../timelineHoldFromPrevious";
import { unsetMarchersAt } from "../timelineUnset";
import { resizeTimeline } from "../timelineResize";
import { shiftTimeline } from "../timelineCommands";
import { splitTimelineAtBeat } from "../timelineSplitAtBeat";
import { mergeMoves, splitMarchersIntoNewMove } from "../timelineSplitMoves";

keepFixturesInPageMode(
    "its tests trim the show, write timeline rows and set the flag themselves",
);

/**
 * **Holds stay correct across every edit** (fork #473; holds README decision 17, 01-edit-rules,
 * 04-anchors "Keeping it true"; ADR 0012 amendment 2026-10-30, Upkeep): a Held mark follows its
 * arrival when a clip drag, resize or merge refit re-times it, a move re-timed into a hold trims it,
 * Split at playhead leaves it attached, Basic's cleanup sweep stops at it, and Remove keyframe at
 * its arrival takes it away with nothing written inside it. Undo restores the marks exactly.
 *
 * The show: home, page 1 [1, 9), page 2 [9, 17), page 3 [17, 25), page 4 [25, 33); beat ids equal
 * their ordinals. Marchers `a` and `b` move on page 2 (one page move) and are Not defined on pages
 * 3 and 4; `c` never moves.
 */

afterEach(() => stopTimelineResolver());

const UP: XY = [100, 100];
const UP2: XY = [200, 100];
const FAR: XY = [500, 260];
const LEFT: XY = [60, 300];
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

/** Where `marcherId` stands at each flag: home, pages 1–4. */
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
    options: { clearPage?: boolean } = {},
) => {
    const result = await moveMarchersInTarget({
        db,
        target,
        moves: moves.map(({ marcherId, xy: [x, y] }) => ({ marcherId, x, y })),
        ...options,
    });
    await timelineResolverSettled();
    return result;
};

const move = (
    db: DbConnection,
    range: { start: number; end: number },
    moves: { marcherId: number; xy: XY }[],
) => edit(db, { kind: "range", ...range }, moves);

/** A Basic point edit: `marcherId` at `xy` on count `beat` of the page box `box`. */
const point = (
    db: DbConnection,
    beat: number,
    box: { start: number; end: number },
    marcherId: number,
    xy: XY,
) => edit(db, { kind: "point", beat, box }, [{ marcherId, xy }]);

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

/** The move (timeline) of `marcherId`'s row ending at `beat`. */
const moveEndingAt = async (
    db: DbConnection,
    marcherId: number,
    beat: number,
) => {
    const row = (await rowsOf(db, marcherId)).find((r) => r.end_beat === beat)!;
    return (await db
        .select()
        .from(schema.timeline_transitions)
        .where(eq(schema.timeline_transitions.id, row.transition_id))
        .get())!.timeline_id;
};

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

describeDbTests(
    "A hold follows its arrival when the arrival is re-timed",
    (it) => {
        for (const [what, run, mark] of [
            [
                "a clip drag earlier",
                (db: DbConnection, id: number) =>
                    shiftTimeline({ db, timelineId: id, delta: -2 }),
                { start: 15, end: 25 },
            ],
            [
                "a clip drag later, into the hold",
                (db: DbConnection, id: number) =>
                    shiftTimeline({ db, timelineId: id, delta: 2 }),
                { start: 19, end: 25 },
            ],
            [
                "a resize of the end into the hold",
                (db: DbConnection, id: number) =>
                    resizeTimeline({ db, timelineId: id, start: 9, end: 21 }),
                { start: 21, end: 25 },
            ],
            [
                "a resize of the end away from it",
                (db: DbConnection, id: number) =>
                    resizeTimeline({ db, timelineId: id, start: 9, end: 13 }),
                { start: 13, end: 25 },
            ],
        ] as const)
            it(`${what}: the hold's start follows, its end stays, and undo restores it`, async ({
                db,
                marchersAndPages: _,
            }) => {
                const { a } = await heldShow(db);
                const before = await snapshot(db);
                await run(db, await moveEndingAt(db, a, PAGE3.start));
                expect(await marksOf(db, a)).toEqual([mark]);
                // Held from the arrival to the hold's end: standing on page 2's spot throughout
                expect(await atCounts(db, a, mark.start, mark.end)).toEqual(
                    Array(mark.end - mark.start + 1).fill(UP),
                );
                await roundTrip(db, before, await snapshot(db));
                expect(await marksOf(db, a)).toEqual([mark]);
            });

        it("R7: a clip drag earlier stretches the hold back over the pages that were Not defined", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, c } = await show(db);
            // c walks over counts 13–17 (a move of its own, not a page's) and is Held on page 3
            await move(db, { start: 13, end: 17 }, [{ marcherId: c, xy: FAR }]);
            await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [c] });
            expect(await marksOf(db, c)).toEqual([PAGE3]);
            const before = await snapshot(db);
            await shiftTimeline({
                db,
                timelineId: await moveEndingAt(db, c, PAGE3.start),
                delta: -4,
            });
            // The move now runs 9–13, and the hold grew back from 17 to 13
            expect(await spansOf(db, c)).toEqual([[9, 13]]);
            expect(await marksOf(db, c)).toEqual([{ start: 13, end: 25 }]);
            expect(await atCounts(db, c, 13, 25)).toEqual(Array(13).fill(FAR));
            await roundTrip(db, before, await snapshot(db));
            // a is untouched
            expect(await marksOf(db, a)).toEqual([]);
        });

        it("a resize past the hold's end leaves it no counts, so it goes; undo brings it back", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await heldShow(db);
            const before = await snapshot(db);
            await resizeTimeline({
                db,
                timelineId: await moveEndingAt(db, a, PAGE3.start),
                start: 9,
                end: 27,
            });
            expect(await marksOf(db, a)).toEqual([]);
            await roundTrip(db, before, await snapshot(db));
        });

        it("a merge that refits the arrival's move carries the hold to the new end", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, c } = await show(db);
            // c gets a move over counts 9–15; a is split off page 2's move into a move of its own
            await move(db, { start: 9, end: 15 }, [{ marcherId: c, xy: LEFT }]);
            const target = await moveEndingAt(db, c, 15);
            const split = await splitMarchersIntoNewMove({
                db,
                timelineId: await moveEndingAt(db, a, PAGE3.start),
                marcherIds: [a],
            });
            await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [a] });
            expect(await marksOf(db, a)).toEqual([PAGE3]);
            const before = await snapshot(db);

            // Merging a's move into c's fits it to counts 9–15: a now arrives at 15
            await mergeMoves({
                db,
                sourceId: split.timeline.id,
                targetId: target,
            });
            expect(await spansOf(db, a)).toEqual([[9, 15]]);
            expect(await marksOf(db, a)).toEqual([{ start: 15, end: 25 }]);
            expect(await atCounts(db, a, 15, 25)).toEqual(Array(11).fill(UP));
            await roundTrip(db, before, await snapshot(db));
        });

        it("Split at playhead of the arrival's move keeps the hold where it was", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await heldShow(db);
            const flags = await atFlags(db, a);
            const before = await snapshot(db);
            await splitTimelineAtBeat({
                db,
                timelineId: await moveEndingAt(db, a, PAGE3.start),
                beat: 13,
            });
            expect(await spansOf(db, a)).toEqual([
                [9, 13],
                [13, 17],
            ]);
            expect(await marksOf(db, a)).toEqual([PAGE3]);
            expect(await atFlags(db, a)).toEqual(flags);
            await roundTrip(db, before, await snapshot(db));
        });
    },
);

describeDbTests("A move re-timed into a hold trims it", (it) => {
    for (const [what, run, mark] of [
        [
            "a clip drag of a later move back into the hold",
            (db: DbConnection, id: number) =>
                shiftTimeline({ db, timelineId: id, delta: -4 }),
            { start: 17, end: 23 },
        ],
        [
            "a resize of a later move's start back into the hold",
            (db: DbConnection, id: number) =>
                resizeTimeline({ db, timelineId: id, start: 21, end: 31 }),
            { start: 17, end: 21 },
        ],
    ] as const)
        it(`${what}: the hold ends where the move now starts`, async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await heldShow(db);
            // a walks again over counts 27–31, after the hold
            await move(db, { start: 27, end: 31 }, [{ marcherId: a, xy: FAR }]);
            expect(await marksOf(db, a)).toEqual([PAGE3]);
            const before = await snapshot(db);
            await run(db, await moveEndingAt(db, a, 31));
            expect(await marksOf(db, a)).toEqual([mark]);
            await roundTrip(db, before, await snapshot(db));
        });

    it("an Expert window written over a hold's start takes the hold away (#476, 01-edit-rules E2)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await heldShow(db);
        await move(db, { start: 17, end: 33 }, [{ marcherId: a, xy: FAR }]);
        expect(await marksOf(db, a)).toEqual([]);
    });
});

describeDbTests("Basic's cleanup sweep stops at a hold", (it) => {
    it("removing a point whose join goes nowhere keeps the next hold's arrival", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        const home = (await atFlags(db, c))[0]!;
        // A point at count 13 of page 2: c walks out and back, arriving home at page 2's flag
        await point(db, 13, PAGE2, c, AWAY);
        expect(await spansOf(db, c)).toEqual([
            [9, 13],
            [13, 17],
        ]);
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [c] });
        expect(await marksOf(db, c)).toEqual([PAGE3]);
        const before = await snapshot(db);

        // Drag the point back home: the join goes nowhere, but a hold grows out of its end
        await point(db, 13, PAGE2, c, home);
        expect(await marksOf(db, c)).toEqual([PAGE3]);
        expect(await spansOf(db, c)).toEqual([[9, 17]]);
        expect(await atCounts(db, c, 9, 25)).toEqual(Array(17).fill(home));
        await roundTrip(db, before, await snapshot(db));
    });

    it("the moves going nowhere after a removed point go, up to the one a hold grows out of", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        const home = (await atFlags(db, c))[0]!;
        // c walks out by count 11, back home by 13, and stays home (a move going nowhere) to 17
        await point(db, 11, PAGE2, c, AWAY);
        await point(db, 13, PAGE2, c, home);
        expect(await spansOf(db, c)).toEqual([
            [9, 11],
            [11, 13],
            [13, 17],
        ]);
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [c] });
        expect(await marksOf(db, c)).toEqual([PAGE3]);
        const before = await snapshot(db);

        // Remove the point at 11: the join (9–13) goes nowhere and goes; the sweep would take the
        // move after it too, but the hold grows out of its end
        await point(db, 11, PAGE2, c, home);
        expect(await spansOf(db, c)).toEqual([[13, 17]]);
        expect(await marksOf(db, c)).toEqual([PAGE3]);
        await roundTrip(db, before, await snapshot(db));
    });
});

describeDbTests("Remove keyframe at a hold's arrival", (it) => {
    it("takes the hold away and leaves its pages Not defined, with no move written inside", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [a] });
        await holdFromPreviousPage({ db, pageBox: PAGE4, marcherIds: [a] });
        expect(await marksOf(db, a)).toEqual([{ start: 17, end: 33 }]);
        const before = await snapshot(db);

        await unsetMarchersAt({ db, beat: PAGE3.start, marcherIds: [a] });
        expect(await marksOf(db, a)).toEqual([]);
        // Nothing of a's from page 2 on: pages 2–4 follow page 1
        expect(await rowsOf(db, a)).toEqual([]);
        const flags = await atFlags(db, a);
        expect(flags.slice(2)).toEqual([flags[1], flags[1], flags[1]]);
        // Not defined: a drag on page 2 now carries into pages 3 and 4
        const after = await snapshot(db);
        await move(db, PAGE2, [{ marcherId: a, xy: FAR }]);
        expect((await atFlags(db, a)).slice(2)).toEqual([FAR, FAR, FAR]);
        await performUndo(db);
        expect(await snapshot(db)).toEqual(after);
        await roundTrip(db, before, after);
    });
});

describeDbTests("Clear this page names a later hold it took away", (it) => {
    it("clearing the page a hold arrives from says the hold went", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await heldShow(db);
        const before = await snapshot(db);
        const result = await edit(
            db,
            { kind: "range", ...PAGE2 },
            [{ marcherId: a, xy: UP }],
            { clearPage: true },
        );
        expect(result.cleared).toEqual([a]);
        expect(await marksOf(db, a)).toEqual([]);
        const m = (await db.select().from(schema.marchers).all()).find(
            (r) => r.id === a,
        )!;
        expect(result.clearedLaterHolds).toEqual({
            names: [`${m.drill_prefix}${m.drill_order}`],
            pages: ["3"],
        });
        // b keeps its move
        expect(await spansOf(db, b)).toEqual([[9, 17]]);
        await roundTrip(db, before, await snapshot(db));
    });
});

describeDbTests("A mark written by the edit is a new mark", (it) => {
    it("holding the page before a hold joins it even when the joined mark reuses the old mark's id", async ({
        db,
        marchersAndPages: _,
    }) => {
        // a's only mark is the Held page 3 (the highest mark id), so the joined mark gets its id back
        const { a } = await heldShow(db);
        const home = (await atFlags(db, a))[0]!;
        const before = await snapshot(db);
        const result = await holdFromPreviousPage({
            db,
            pageBox: PAGE2,
            marcherIds: [a],
        });
        expect(result).toEqual({
            held: [a],
            skipped: [],
            pagesCovered: ["1", "2"],
        });
        expect(await marksOf(db, a)).toEqual([{ start: 1, end: 25 }]);
        expect(await rowsOf(db, a)).toEqual([]);
        expect((await atFlags(db, a)).slice(1, 4)).toEqual([home, home, home]);
        await roundTrip(db, before, await snapshot(db));
    });
});

describeDbTests("A row written by the edit is a new row", (it) => {
    type Tx = Parameters<Parameters<DbConnection["transaction"]>[0]>[0];

    /**
     * `a` Held on page 3, and `c` moved over [9, 13). `reuse` deletes `a`'s arrival row and inserts
     * a new row for `a` on `c`'s move, ending at 13, with the deleted row's id
     * (`timeline_assignments` has no AUTOINCREMENT, so SQLite can hand an id back).
     */
    const reusedArrivalShow = async (db: DbConnection) => {
        const { a, c } = await heldShow(db);
        await move(db, { start: 9, end: 13 }, [{ marcherId: c, xy: FAR }]);
        const arrival = (await rowsOf(db, a)).find(
            (r) => r.end_beat === PAGE3.start,
        )!;
        const other = (await rowsOf(db, c)).find((r) => r.end_beat === 13)!;
        expect(other.transition_id).not.toBe(arrival.transition_id);
        const A = schema.timeline_assignments;
        const T = schema.timeline_transitions;
        const reuse = async (tx: Tx) => {
            await tx.delete(A).where(eq(A.id, arrival.id));
            await tx
                .update(T)
                .set({ slot_count: sql`${T.slot_count} + 1` })
                .where(eq(T.id, other.transition_id));
            await tx.insert(A).values({
                ...arrival,
                transition_id: other.transition_id,
                slot_index: other.slot_index + 1,
                start_beat: 9,
                end_beat: 13,
            });
        };
        return { a, reuse };
    };

    it("a deleted arrival whose id a new row of the marcher reuses is deleted, so the hold goes", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, reuse } = await reusedArrivalShow(db);
        const held = await db.transaction(async (tx) => {
            const before = await readHeldUpkeepBefore(tx);
            await reuse(tx);
            await keepHeldMarksTrueInTransaction(tx, before);
            return await readHeldMarks(tx, [a]);
        });
        // Not moved to [13, 25): the row ending at 13 is not the hold's arrival re-timed
        expect(held).toEqual([]);
    });

    it("the edit names the hold as lost even though a new row reuses its arrival's id", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, reuse } = await reusedArrivalShow(db);
        const lost = await db.transaction(async (tx) => {
            const before = await readHeldArrivalsBefore(tx);
            await reuse(tx);
            return await arrivalHoldsLostInTransaction(tx, before);
        });
        expect(lost).toEqual([{ marcherId: a, beat: PAGE3.start }]);
    });
});
