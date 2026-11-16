import { afterEach, expect } from "vitest";
import { countDistinct, eq, getTableName } from "drizzle-orm";
import type { XY } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { readShowTiming } from "@/timeline/showTiming";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import type { HoldStyle } from "@/timeline/holdStyle";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import { performRedo, performUndo } from "../history";
import { deleteBeats } from "../beat";
import { createLastPage, deletePages } from "../page";
import { moveMarchersInTarget } from "../timelineMoves";
import { shiftTimeline } from "../timelineCommands";
import { timelineDisplayVersion } from "../timelineDisplay";
import { readHeldMarks } from "../timelineHeldMarks";
import { holdFromPreviousPage } from "../timelineHoldFromPrevious";
import { holdOverWindow } from "../timelineHoldOverWindow";
import { setHoldEdge, splitHoldAt } from "../timelineHoldExtent";
import { readStyledHeldMarks, setHoldStyle } from "../timelineHoldStyle";

keepFixturesInPageMode(
    "its tests trim the show, write timeline rows and set the flag themselves",
);

/**
 * **Hold style** (ADR 0015 D-5; fork #775): a Held hold's own style, and every edit that rewrites
 * a Held mark carrying it along.
 *
 * The show: home, page 1 [1, 9), page 2 [9, 17), page 3 [17, 25), page 4 [25, 33); beat ids equal
 * their ordinals. Marchers `a` and `b` move on page 2 and are Held on page 3; `c` never moves.
 */

afterEach(() => stopTimelineResolver());

const UP: XY = [100, 100];
const UP2: XY = [200, 100];
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

const undoGroups = async (db: DbConnection) =>
    (
        await db
            .select({ n: countDistinct(schema.history_undo.history_group) })
            .from(schema.history_undo)
            .get()
    )?.n ?? 0;

const resolver = () => useTimelineResolverStore.getState().resolver!;

const move = async (
    db: DbConnection,
    range: { start: number; end: number },
    moves: { marcherId: number; xy: XY }[],
) => {
    await moveMarchersInTarget({
        db,
        target: { kind: "range", ...range },
        moves: moves.map(({ marcherId, xy: [x, y] }) => ({ marcherId, x, y })),
    });
    await timelineResolverSettled();
};

/** A marcher's holds: where they are and the style each carries. */
const holdsOf = async (db: DbConnection, marcherId: number) =>
    (await readHeldMarks(db, [marcherId])).map(({ start, end, style }) => ({
        start,
        end,
        style,
    }));

const pagesInOrder = async (db: DbConnection) =>
    [...(await readShowTiming(db)).pages].sort((a, b) => a.order - b.order);

/** Pages 1–4 in timeline mode; `a` and `b` move on page 2 and are Held on page 3. */
const show = async (db: DbConnection) => {
    const pages = await pagesInOrder(db);
    await deletePages({
        db,
        pageIds: new Set(pages.filter((p) => p.order >= 2).map((p) => p.id)),
    });
    for (let i = 0; i < 3; i++) await createLastPage({ db, newPageCounts: 8 });
    await db.delete(schema.workspace_settings);
    await db.insert(schema.workspace_settings).values({
        id: 1,
        json_data: JSON.stringify({ timelineMode: true }),
    });
    await startTimelineResolver(db);
    const [a, b, c] = resolver().marcherIds();
    expect(
        (await pagesInOrder(db)).map((p) => (p.id === 0 ? 0 : pageEndBeat(p))),
    ).toEqual([0, 9, 17, 25, 33]);
    await move(db, PAGE2, [
        { marcherId: a!, xy: UP },
        { marcherId: b!, xy: UP2 },
    ]);
    await holdFromPreviousPage({ db, pageBox: PAGE3, marcherIds: [a!, b!] });
    expect(await holdsOf(db, a!)).toEqual([{ ...PAGE3, style: null }]);
    return { a: a!, b: b!, c: c! };
};

/** `show`, with `a`'s hold on page 3 set to `style`. */
const styledShow = async (db: DbConnection, style: HoldStyle = "markTime") => {
    const ids = await show(db);
    await setHoldStyle({ db, marcherIds: [ids.a], beat: 20, style });
    expect(await holdsOf(db, ids.a)).toEqual([{ ...PAGE3, style }]);
    return ids;
};

/** The id of the move of `marcherId` that ends at `beat`. */
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

describeDbTests("Setting a hold's style (#775)", (it) => {
    it("sets it on the Held holds at the count, as one undo step that undo and redo restore", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b, c } = await show(db);
        const before = await snapshot(db);
        const groups = await undoGroups(db);
        let display = timelineDisplayVersion();

        // c isn't Held there: left alone
        const result = await setHoldStyle({
            db,
            marcherIds: [a, c],
            beat: 20,
            style: "markTime",
        });
        expect(result.changed).toEqual([a]);
        expect(await holdsOf(db, a)).toEqual([{ ...PAGE3, style: "markTime" }]);
        expect(await holdsOf(db, b)).toEqual([{ ...PAGE3, style: null }]);
        expect(await holdsOf(db, c)).toEqual([]);
        expect(await undoGroups(db)).toBe(groups + 1);
        // The marks aren't in the change log: the views follow the display version
        expect(timelineDisplayVersion()).toBeGreaterThan(display);
        const after = await snapshot(db);

        display = timelineDisplayVersion();
        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(before);
        expect(await holdsOf(db, a)).toEqual([{ ...PAGE3, style: null }]);
        expect(timelineDisplayVersion()).toBeGreaterThan(display);
        expect((await performRedo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(after);
        expect(await holdsOf(db, a)).toEqual([{ ...PAGE3, style: "markTime" }]);
    });

    it("reads a count as the holds do: the hold's last count is inside it, its start is not", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await show(db);
        expect(
            (
                await setHoldStyle({
                    db,
                    marcherIds: [a],
                    beat: PAGE3.start,
                    style: "stand",
                })
            ).changed,
        ).toEqual([]);
        expect(
            (
                await setHoldStyle({
                    db,
                    marcherIds: [a],
                    beat: PAGE3.end,
                    style: "stand",
                })
            ).changed,
        ).toEqual([a]);
    });

    it("goes back to the show setting, and opens no edit when nothing would change", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await styledShow(db, "highMarkTime");
        const groups = await undoGroups(db);
        expect(
            (
                await setHoldStyle({
                    db,
                    marcherIds: [a],
                    beat: 20,
                    style: "highMarkTime",
                })
            ).changed,
        ).toEqual([]);
        expect(await undoGroups(db)).toBe(groups);
        await setHoldStyle({ db, marcherIds: [a], beat: 20, style: null });
        expect(await holdsOf(db, a)).toEqual([{ ...PAGE3, style: null }]);
        expect(await undoGroups(db)).toBe(groups + 1);
    });

    it("lists the styled holds for the 3D View, skipping a style this build doesn't know", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await styledShow(db);
        expect(await readStyledHeldMarks(db)).toEqual([
            { marcherId: a, ...PAGE3, style: "markTime" },
        ]);
        // A later build's value stays in the file and reads as the show setting
        await db
            .update(schema.timeline_held_marks)
            .set({ style: "slowMarkTime" })
            .where(eq(schema.timeline_held_marks.marcher_id, b));
        expect(await holdsOf(db, b)).toEqual([{ ...PAGE3, style: null }]);
        expect(await readStyledHeldMarks(db)).toEqual([
            { marcherId: a, ...PAGE3, style: "markTime" },
        ]);
    });
});

describeDbTests("A hold keeps its style through edits (#775)", (it) => {
    it("a dragged end and Split hold here keep it", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await styledShow(db);
        await setHoldEdge({ db, marcherIds: [a], from: 25, to: 29 });
        expect(await holdsOf(db, a)).toEqual([
            { start: 17, end: 29, style: "markTime" },
        ]);
        await splitHoldAt({ db, marcherIds: [a], beat: 21 });
        expect(await holdsOf(db, a)).toEqual([
            { start: 17, end: 21, style: "markTime" },
        ]);
    });

    it("the next page held from it joins it and takes its style", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await styledShow(db);
        await holdFromPreviousPage({ db, pageBox: PAGE4, marcherIds: [a, b] });
        expect(await holdsOf(db, a)).toEqual([
            { start: 17, end: 33, style: "markTime" },
        ]);
        // b's hold had none: still the show setting
        expect(await holdsOf(db, b)).toEqual([
            { start: 17, end: 33, style: null },
        ]);
    });

    it("a hold over the window that joins it takes its style", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await styledShow(db);
        await holdOverWindow({
            db,
            window: { start: 25, end: 29 },
            marcherIds: [a],
        });
        expect(await holdsOf(db, a)).toEqual([
            { start: 17, end: 29, style: "markTime" },
        ]);
    });

    it("holds joined by a drag take the style of the earliest that has one", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { c } = await show(db);
        // Written straight to the file: Hold from last keyframe would join them over the gap
        const h = schema.timeline_held_marks;
        await db.insert(h).values([
            { marcher_id: c, start_beat: 1, end_beat: 17 },
            { marcher_id: c, start_beat: 25, end_beat: 33, style: "markTime" },
        ]);
        const before = await snapshot(db);
        await setHoldEdge({ db, marcherIds: [c], from: 17, to: 25 });
        expect(await holdsOf(db, c)).toEqual([
            { start: 1, end: 33, style: "markTime" },
        ]);
        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(before);

        // The earlier hold's own style wins over the later one's
        await setHoldStyle({ db, marcherIds: [c], beat: 5, style: "stand" });
        await setHoldEdge({ db, marcherIds: [c], from: 17, to: 25 });
        expect(await holdsOf(db, c)).toEqual([
            { start: 1, end: 33, style: "stand" },
        ]);
    });

    it("a hold that follows its re-timed arrival keeps it, and undo restores the row", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await styledShow(db);
        const before = await snapshot(db);
        // The upkeep deletes the mark and writes it again where the move now ends
        await shiftTimeline({
            db,
            timelineId: await moveEndingAt(db, a, PAGE3.start),
            delta: -2,
        });
        expect(await holdsOf(db, a)).toEqual([
            { start: 15, end: 25, style: "markTime" },
        ]);
        const after = await snapshot(db);
        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(before);
        expect((await performRedo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(after);
    });

    it("counts deleted before it move it with its style, and undo brings both back", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await styledShow(db);
        const before = await snapshot(db);
        // Two counts out of page 2: the ripple moves the hold with its arrival
        await deleteBeats({ db, beatIds: new Set([11, 12]) });
        await timelineResolverSettled();
        expect(await holdsOf(db, a)).toEqual([
            { start: 15, end: 23, style: "markTime" },
        ]);
        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(before);
    });
});
