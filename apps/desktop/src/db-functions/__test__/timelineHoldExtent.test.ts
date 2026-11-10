import { afterEach, expect } from "vitest";
import { countDistinct, getTableName } from "drizzle-orm";
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
import { timelineErrorCode } from "@/timeline/timelineErrorMessages";
import { performRedo, performUndo } from "../history";
import { createLastPage, deletePages } from "../page";
import {
    moveMarchersInTarget,
    type TimelineEditTarget,
} from "../timelineMoves";
import { timelineDisplayVersion } from "../timelineDisplay";
import { readHeldMarks } from "../timelineHeldMarks";
import { holdFromPreviousPage } from "../timelineHoldFromPrevious";
import { setHoldEdge, splitHoldAt } from "../timelineHoldExtent";

keepFixturesInPageMode(
    "its tests trim the show, write timeline rows and set the flag themselves",
);

/**
 * **Shaping a hold** (holds README decisions 3, 5 and 6; fork #475): dragging a Held hold's end,
 * Split hold here, leaving early, and touching holds becoming one.
 *
 * The show: home, page 1 [1, 9), page 2 [9, 17), page 3 [17, 25), page 4 [25, 33); beat ids equal
 * their ordinals. Marchers `a` and `b` move on page 2 and are Held over pages 3 and 4 (the demo's
 * scenario 4); `c` never moves.
 */

afterEach(() => stopTimelineResolver());

const UP: XY = [100, 100];
const UP2: XY = [200, 100];
const ELSEWHERE: XY = [400, 400];
const FAR: XY = [500, 260];
const PAGE2 = { start: 9, end: 17 };
const PAGE3 = { start: 17, end: 25 };
const PAGE4 = { start: 25, end: 33 };
const SHOW_END = PAGE4.end;

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

const undoGroups = async (db: DbConnection) =>
    (
        await db
            .select({ n: countDistinct(schema.history_undo.history_group) })
            .from(schema.history_undo)
            .get()
    )?.n ?? 0;

const resolver = () => useTimelineResolverStore.getState().resolver!;

const positionAt = async (marcherId: number, beat: number) => {
    await timelineResolverSettled();
    return resolver().positionAt(marcherId, beat) as XY;
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

/** Basic's point edit: `marcherId` at `xy` on count `beat` of the page box `box`. */
const point = (
    db: DbConnection,
    box: { start: number; end: number },
    beat: number,
    moves: { marcherId: number; xy: XY }[],
) => edit(db, { kind: "point", beat, box }, moves);

const rowsOf = async (db: DbConnection, marcherId: number) =>
    (await db.select().from(schema.timeline_assignments).all())
        .filter((r) => r.marcher_id === marcherId)
        .map((r) => ({ start: r.start_beat, end: r.end_beat }))
        .sort((x, y) => x.start - y.start);

const marksOf = async (db: DbConnection, marcherId: number) =>
    (await readHeldMarks(db, [marcherId])).map(({ start, end }) => ({
        start,
        end,
    }));

const pagesInOrder = async (db: DbConnection) =>
    [...(await readShowTiming(db)).pages].sort((a, b) => a.order - b.order);

const setTimelineFlag = async (db: DbConnection) => {
    await db.delete(schema.workspace_settings);
    await db.insert(schema.workspace_settings).values({
        id: 1,
        json_data: JSON.stringify({ timelineMode: true }),
    });
};

/** Pages 1–4 in timeline mode; `a` and `b` move on page 2 and are Held over pages 3 and 4. */
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
    expect(
        (await pagesInOrder(db)).map((p) => (p.id === 0 ? 0 : pageEndBeat(p))),
    ).toEqual([0, 9, 17, 25, 33]);
    await move(db, PAGE2, [
        { marcherId: a!, xy: UP },
        { marcherId: b!, xy: UP2 },
    ]);
    for (const pageBox of [PAGE3, PAGE4])
        await holdFromPreviousPage({ db, pageBox, marcherIds: [a!, b!] });
    expect(await marksOf(db, a!)).toEqual([{ start: 17, end: 33 }]);
    return { a: a!, b: b!, c: c! };
};

/** Marcher `c` Held from the start through page 2 and over page 4, as a file can hold (see below). */
const HOME_TO_PAGE2 = { start: 1, end: 17 };
const twoHolds = async (db: DbConnection, c: number) => {
    // Written straight to the file: Hold from last keyframe would join them over the gap
    for (const { start, end } of [HOME_TO_PAGE2, PAGE4])
        await db
            .insert(schema.timeline_held_marks)
            .values({ marcher_id: c, start_beat: start, end_beat: end });
};

const refusalOf = async (run: Promise<unknown>) => {
    try {
        await run;
    } catch (error) {
        return timelineErrorCode(error);
    }
    return null;
};

describeDbTests("Dragging a Held hold's end (#475)", (it) => {
    it("shortens one marcher's hold: it leaves early, the other still holds", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        const before = await snapshot(db);
        const groups = await undoGroups(db);
        let display = timelineDisplayVersion();

        const result = await setHoldEdge({
            db,
            marcherIds: [a],
            from: 33,
            to: 21,
        });
        expect(result.changed).toEqual([a]);
        expect(await marksOf(db, a)).toEqual([{ start: 17, end: 21 }]);
        expect(await marksOf(db, b)).toEqual([{ start: 17, end: 33 }]);
        // Only the mark changed: nobody moves
        expect(await positionAt(a, 29)).toEqual(UP);
        expect(await undoGroups(db)).toBe(groups + 1);
        expect(timelineDisplayVersion()).toBeGreaterThan(display);
        const after = await snapshot(db);

        display = timelineDisplayVersion();
        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(before);
        expect(timelineDisplayVersion()).toBeGreaterThan(display);
        expect((await performRedo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(after);
    });

    it("lengthens up to the marcher's next move and refuses past it", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await setHoldEdge({
            db,
            marcherIds: [a],
            from: 33,
            to: 21,
        });
        // a's next move starts at 29
        await move(db, { start: 29, end: 33 }, [{ marcherId: a, xy: FAR }]);
        await setHoldEdge({
            db,
            marcherIds: [a],
            from: 21,
            to: 29,
        });
        expect(await marksOf(db, a)).toEqual([{ start: 17, end: 29 }]);

        await setHoldEdge({
            db,
            marcherIds: [a],
            from: 29,
            to: 24,
        });
        const before = await snapshot(db);
        const groups = await undoGroups(db);
        expect(
            await refusalOf(
                setHoldEdge({
                    db,
                    marcherIds: [a],
                    from: 24,
                    to: 30,
                }),
            ),
        ).toBe("E-ARGS");
        expect(await snapshot(db)).toEqual(before);
        expect(await undoGroups(db)).toBe(groups);
    });

    it("stops at the show's end, and keeps at least one count", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await setHoldEdge({
            db,
            marcherIds: [a],
            from: 33,
            to: 25,
        });
        expect(
            await refusalOf(
                setHoldEdge({
                    db,
                    marcherIds: [a],
                    from: 25,
                    to: SHOW_END + 1,
                }),
            ),
        ).toBe("E-ARGS");
        expect(
            await refusalOf(
                setHoldEdge({
                    db,
                    marcherIds: [a],
                    from: 25,
                    to: 17,
                }),
            ),
        ).toBe("E-ARGS");
        await setHoldEdge({
            db,
            marcherIds: [a],
            from: 25,
            to: 18,
        });
        expect(await marksOf(db, a)).toEqual([{ start: 17, end: 18 }]);
    });

    it("writes nothing for a drop where it started, or for marchers with no hold edge there", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, c } = await show(db);
        const before = await snapshot(db);
        const groups = await undoGroups(db);
        expect(
            (
                await setHoldEdge({
                    db,
                    marcherIds: [a],
                    from: 33,
                    to: 33,
                })
            ).changed,
        ).toEqual([]);
        expect(
            (
                await setHoldEdge({
                    db,
                    marcherIds: [c],
                    from: 33,
                    to: 29,
                })
            ).changed,
        ).toEqual([]);
        expect(await snapshot(db)).toEqual(before);
        expect(await undoGroups(db)).toBe(groups);
    });
});

describeDbTests("Touching holds become one (#475)", (it) => {
    it("an end dragged onto the next hold's start joins them, and undo splits them again", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        await twoHolds(db, c);
        expect(await marksOf(db, c)).toEqual([HOME_TO_PAGE2, PAGE4]);
        const before = await snapshot(db);

        await setHoldEdge({
            db,
            marcherIds: [c],
            from: 17,
            to: 25,
        });
        expect(await marksOf(db, c)).toEqual([{ start: 1, end: 33 }]);
        const joined = await snapshot(db);

        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(before);
        expect((await performRedo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(joined);
    });

    it("an end dragged past the next hold's start takes it in", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        await twoHolds(db, c);

        await setHoldEdge({
            db,
            marcherIds: [c],
            from: 17,
            to: 29,
        });
        expect(await marksOf(db, c)).toEqual([{ start: 1, end: 33 }]);
    });
});

describeDbTests("Split hold here (#475)", (it) => {
    it("ends the selected marchers' holds at the count; the rest is Not defined", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        const before = await snapshot(db);
        const groups = await undoGroups(db);

        const result = await splitHoldAt({ db, marcherIds: [a], beat: 21 });
        expect(result.split).toEqual([a]);
        expect(await marksOf(db, a)).toEqual([{ start: 17, end: 21 }]);
        expect(await marksOf(db, b)).toEqual([{ start: 17, end: 33 }]);
        expect(await positionAt(a, 29)).toEqual(UP);
        expect(await undoGroups(db)).toBe(groups + 1);
        const split = await snapshot(db);

        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(before);
        expect((await performRedo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(split);
    });

    it("does nothing at a hold's own start or end, or outside it", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, c } = await show(db);
        const before = await snapshot(db);
        const groups = await undoGroups(db);
        for (const beat of [17, 33, 9])
            expect(
                (await splitHoldAt({ db, marcherIds: [a, c], beat })).split,
            ).toEqual([]);
        expect(await snapshot(db)).toEqual(before);
        expect(await undoGroups(db)).toBe(groups);
    });

    it("a drag in the Not defined rest starts a new keyframe where the hold ends (Expert)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        await splitHoldAt({ db, marcherIds: [a], beat: 21 });
        // The start flag at the hold's end, the playhead at count 29
        await move(db, { start: 21, end: 29 }, [
            { marcherId: a, xy: ELSEWHERE },
        ]);
        expect(await rowsOf(db, a)).toEqual([
            { start: 9, end: 17 },
            { start: 21, end: 29 },
        ]);
        expect(await marksOf(db, a)).toEqual([{ start: 17, end: 21 }]);
        expect(await positionAt(a, 21)).toEqual(UP);
        expect(await positionAt(a, 29)).toEqual(ELSEWHERE);
        // b still holds through: the same edit inside its hold moves the whole hold
        await move(db, { start: 9, end: 29 }, [{ marcherId: b, xy: FAR }]);
        expect(await marksOf(db, b)).toEqual([{ start: 17, end: 33 }]);
        expect(await positionAt(b, 17)).toEqual(FAR);
        expect(await positionAt(b, 33)).toEqual(FAR);
    });
});

describeDbTests("Leaving early in Basic (#475)", (it) => {
    it("a point after a hold that ends mid-page starts its move where the hold ends", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await splitHoldAt({ db, marcherIds: [a], beat: 27 });
        const before = await snapshot(db);
        await point(db, PAGE4, 29, [{ marcherId: a, xy: ELSEWHERE }]);
        expect(await marksOf(db, a)).toEqual([{ start: 17, end: 27 }]);
        expect(await rowsOf(db, a)).toEqual([
            { start: 9, end: 17 },
            { start: 27, end: 29 },
            { start: 29, end: 33 },
        ]);
        expect(await positionAt(a, 27)).toEqual(UP);
        expect(await positionAt(a, 29)).toEqual(ELSEWHERE);
        // Basic's point in a hold: the flag after it keeps its position
        expect(await positionAt(a, 33)).toEqual(UP);

        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(before);
    });

    it("a drag on the page's flag after a hold that ends mid-page starts there too", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        await splitHoldAt({ db, marcherIds: [a], beat: 27 });
        await point(db, PAGE4, 33, [{ marcherId: a, xy: ELSEWHERE }]);
        expect(await rowsOf(db, a)).toEqual([
            { start: 9, end: 17 },
            { start: 27, end: 33 },
        ]);
        expect(await positionAt(a, 27)).toEqual(UP);
        expect(await positionAt(a, 33)).toEqual(ELSEWHERE);
    });

    it("a point before a hold that starts mid-page stays before it", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        // c's last move ends mid-page 3, and the hold on page 4 reaches back to it
        await move(db, { start: 17, end: 21 }, [{ marcherId: c, xy: FAR }]);
        await holdFromPreviousPage({ db, pageBox: PAGE4, marcherIds: [c] });
        expect(await marksOf(db, c)).toEqual([{ start: 21, end: 33 }]);
        await point(db, PAGE3, 19, [{ marcherId: c, xy: ELSEWHERE }]);
        const rows = await rowsOf(db, c);
        expect(rows.every((r) => r.end <= 21)).toBe(true);
    });
});
