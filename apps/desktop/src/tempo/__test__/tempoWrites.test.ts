import { expect } from "vitest";
import { asc } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import {
    deleteCounts,
    endMovesEarly,
    insertCounts,
    writeDurations,
    writeMarks,
} from "../tempoWrites";
import { performRedo, performUndo } from "@/db-functions/history";
import { createCues } from "@/db-functions/cues";

/**
 * Tempo mode's count edits on the `marchersAndPages` show, converted to timelines on open: beat 0,
 * then pages 1 to 6 starting at beats 1, 9, 17, 25, 33 and 41 (8 counts each), one move per page
 * over exactly its counts.
 */

const moveRanges = async (db: DbConnection) =>
    (
        await db
            .select()
            .from(schema.timelines)
            .orderBy(asc(schema.timelines.start_beat))
            .all()
    ).map((t) => [t.start_beat, t.end_beat]);

const pageStarts = async (db: DbConnection) => {
    const beats = await db
        .select()
        .from(schema.beats)
        .orderBy(asc(schema.beats.position))
        .all();
    const ordinal = new Map(beats.map((b, i) => [b.id, i]));
    return (await db.select().from(schema.pages).all())
        .map((p) => ordinal.get(p.start_beat)!)
        .sort((a, b) => a - b);
};

describeDbTests("tempo mode count edits", (it) => {
    it("a count added at a page boundary with keep: the move before keeps its counts and holds", async ({
        db,
        marchersAndPages: _,
    }) => {
        expect(await moveRanges(db)).toEqual([
            [1, 9],
            [9, 17],
            [17, 25],
            [25, 33],
            [33, 41],
            [41, 49],
        ]);
        // Before page 3's count 1: page 2 takes the count
        const result = await insertCounts({
            at: 17,
            count: 1,
            duration: 0.5,
            drill: "keep",
        });
        expect(result).toEqual({ kept: 1, couldNotKeep: 0 });
        // Page 2 is 9 counts; its move is still 8, so the marchers hold on count 17
        expect(await pageStarts(db)).toEqual([0, 1, 9, 18, 26, 34, 42]);
        expect(await moveRanges(db)).toEqual([
            [1, 9],
            [9, 17],
            [18, 26],
            [26, 34],
            [34, 42],
            [42, 50],
        ]);
    });

    it("a count added at a page boundary with adjust: the move before stretches", async ({
        db,
        marchersAndPages: _,
    }) => {
        const result = await insertCounts({
            at: 17,
            count: 1,
            duration: 0.5,
            drill: "adjust",
        });
        expect(result).toEqual({ kept: 0, couldNotKeep: 0 });
        expect((await moveRanges(db)).slice(0, 3)).toEqual([
            [1, 9],
            [9, 18],
            [18, 26],
        ]);
    });

    it("a count added inside a move with keep: the move keeps its counts", async ({
        db,
        marchersAndPages: _,
    }) => {
        const result = await insertCounts({
            at: 13,
            count: 1,
            duration: 0.5,
            drill: "keep",
        });
        expect(result).toEqual({ kept: 1, couldNotKeep: 0 });
        expect((await moveRanges(db)).slice(0, 3)).toEqual([
            [1, 9],
            [9, 17],
            [18, 26],
        ]);
    });

    it("holding the drill instead: the move ends a count early and no count is added", async ({
        db,
        marchersAndPages: _,
    }) => {
        const beatsBefore = (await db.select().from(schema.beats).all()).length;
        const [, second] = await db
            .select()
            .from(schema.timelines)
            .orderBy(asc(schema.timelines.start_beat))
            .all();
        await endMovesEarly({ timelineIds: [second!.id] });
        expect((await moveRanges(db)).slice(0, 3)).toEqual([
            [1, 9],
            [9, 16],
            [17, 25],
        ]);
        expect((await db.select().from(schema.beats).all()).length).toBe(
            beatsBefore,
        );
        expect(await pageStarts(db)).toEqual([0, 1, 9, 17, 25, 33, 41]);
    });
});

/** The spec beats whose flag `column` is set */
const flagged = async (db: DbConnection, column: "tempo_change") => {
    const beats = await db
        .select()
        .from(schema.beats)
        .orderBy(asc(schema.beats.position))
        .all();
    return beats.flatMap((b, i) => (b[column] === 1 ? [i] : []));
};

describeDbTests("tempo changes (the tempo lane's points)", (it) => {
    it("are stored as beat flags, and undo", async ({
        db,
        marchersAndPages: _,
    }) => {
        await writeMarks({ changes: new Set([9, 17]) });
        expect(await flagged(db, "tempo_change")).toEqual([9, 17]);
        await writeMarks({ changes: new Set([17]) });
        expect(await flagged(db, "tempo_change")).toEqual([17]);
        await performUndo(db);
        expect(await flagged(db, "tempo_change")).toEqual([9, 17]);
    });

    it("are written with the new lengths in one undo step, and a no-op writes nothing", async ({
        db,
        marchersAndPages: _,
    }) => {
        const lengths = async () =>
            (
                await db
                    .select()
                    .from(schema.beats)
                    .orderBy(asc(schema.beats.position))
                    .all()
            ).map((b) => b.duration);
        const before = await lengths();
        const after = before.map((d, b) => (b >= 9 && b < 17 ? 0.4 : d));
        await writeDurations({ before, after, changes: new Set([9, 17]) });
        expect((await lengths())[9]).toBe(0.4);
        expect(await flagged(db, "tempo_change")).toEqual([9, 17]);
        // the same again changes nothing, so it makes no undo step
        await writeDurations({
            before: after,
            after,
            changes: new Set([9, 17]),
        });
        await performUndo(db);
        expect(await lengths()).toEqual(before);
        expect(await flagged(db, "tempo_change")).toEqual([]);
    });
});

describeDbTests("removing a whole measure", (it) => {
    /** Measures of 4 counts from count 1 to the end of the stored counts, `facts` on some */
    const setMeasures = async (
        db: DbConnection,
        facts: Record<
            number,
            Partial<typeof schema.measures.$inferInsert> | undefined
        >,
    ) => {
        const rows = await db
            .select()
            .from(schema.beats)
            .orderBy(asc(schema.beats.position))
            .all();
        await db.delete(schema.measures).run();
        await db
            .insert(schema.measures)
            .values(
                Array.from(
                    { length: Math.floor((rows.length - 1) / 4) },
                    (_, i) => ({
                        start_beat: rows[1 + 4 * i]!.id,
                        ...facts[1 + 4 * i],
                    }),
                ),
            )
            .run();
    };
    /** [start count, meter, grouping, number, rehearsal mark] of the first `n` measures */
    const measuresNow = async (db: DbConnection, n = 8) => {
        const rows = await db
            .select()
            .from(schema.beats)
            .orderBy(asc(schema.beats.position))
            .all();
        const ordinal = new Map(rows.map((b, i) => [b.id, i]));
        return (await db.select().from(schema.measures).all())
            .map((m) => [
                ordinal.get(m.start_beat)!,
                m.meter,
                m.grouping,
                m.number_override,
                m.rehearsal_mark,
            ])
            .sort((a, b) => (a[0] as number) - (b[0] as number))
            .slice(0, n);
    };

    it("keeps the time signature, number and mark written on it for the measures after", async ({
        db,
        marchersAndPages: _,
    }) => {
        // 4/4 from m1, 3/4 (marked C, numbered 101) written on m5 at count 17 and carried on
        await setMeasures(db, {
            1: { meter: "4/4", grouping: "2+2+2+2" },
            17: {
                meter: "3/4",
                grouping: "2+2+2",
                number_override: 101,
                rehearsal_mark: "C",
            },
        });
        const before = await measuresNow(db);
        const result = await deleteCounts({
            from: 17,
            to: 21,
            drill: "adjust",
        });
        expect(result.cues).toEqual({ moved: [], dropped: [] });
        expect(await measuresNow(db, 6)).toEqual([
            [1, "4/4", "2+2+2+2", null, null],
            [5, null, null, null, null],
            [9, null, null, null, null],
            [13, null, null, null, null],
            // m6 now starts at 17 and reads 3/4 as before, with m5's number and mark
            [17, "3/4", "2+2+2", 101, "C"],
            [21, null, null, null, null],
        ]);
        await performUndo(db);
        expect(await measuresNow(db)).toEqual(before);
        await performRedo(db);
        expect((await measuresNow(db))[4]).toEqual([
            17,
            "3/4",
            "2+2+2",
            101,
            "C",
        ]);
    });

    it("clears a time signature that now repeats the one before", async ({
        db,
        marchersAndPages: _,
    }) => {
        // one 3/4 bar at m5, 4/4 written again on m6
        await setMeasures(db, {
            1: { meter: "4/4", grouping: "2+2+2+2" },
            17: { meter: "3/4", grouping: "2+2+2" },
            21: { meter: "4/4", grouping: "2+2+2+2" },
        });
        const before = await measuresNow(db);
        await deleteCounts({ from: 17, to: 21, drill: "adjust" });
        expect((await measuresNow(db)).slice(3, 6)).toEqual([
            [13, null, null, null, null],
            [17, null, null, null, null],
            [21, null, null, null, null],
        ]);
        await performUndo(db);
        expect(await measuresNow(db)).toEqual(before);
    });

    it("writes nothing on a show that has no time signatures written", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setMeasures(db, {});
        await deleteCounts({ from: 17, to: 21, drill: "adjust" });
        expect(
            (await measuresNow(db, 20)).every(
                ([, meter, grouping]) => meter === null && grouping === null,
            ),
        ).toBe(true);
    });

    it("says where the cues on the removed counts went", async ({
        db,
        marchersAndPages: _,
    }) => {
        const rows = await db
            .select()
            .from(schema.beats)
            .orderBy(asc(schema.beats.position))
            .all();
        await createCues({
            db,
            newCues: [
                {
                    channel: "horn_equipment",
                    kind: "state",
                    target: { kind: "band" },
                    beatId: rows[18]!.id,
                    value: "builtin:horn_equipment.horn.up",
                },
            ],
        });
        const result = await deleteCounts({
            from: 17,
            to: 21,
            drill: "adjust",
        });
        expect(result.cues?.moved).toHaveLength(1);
        expect(result.cues?.moved[0]!.toBeatId).toBe(rows[21]!.id);
    });
});
