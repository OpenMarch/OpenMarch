import { expect } from "vitest";
import { asc } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import {
    endMovesEarly,
    insertCounts,
    writeDurations,
    writeMarks,
} from "../tempoWrites";
import { performUndo } from "@/db-functions/history";

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
const flagged = async (
    db: DbConnection,
    column: "tempo_change" | "tempo_pin",
) => {
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
