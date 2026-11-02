import { expect } from "vitest";
import { asc } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { performRedo, performUndo } from "@/db-functions/history";
import { writeDurations, writeMarks } from "../tempoWrites";
import { writeMeter, planMeter } from "../meterWrites";
import { parseMeter } from "../meters";
import { readAudioOffsetSeconds, writeAudioOffset } from "../audioOffset";

/**
 * ADR 0007 asks for these before it's accepted: pins, holds, meters and the music offset are in
 * the show's history, so undo and redo put them back with the counts they belong to. On the
 * `marchersAndPages` show: beat 0, then 48 counts.
 */

const beats = async (db: DbConnection) =>
    await db
        .select()
        .from(schema.beats)
        .orderBy(asc(schema.beats.position))
        .all();

/** The spec beats whose flag `column` is set */
const flagged = async (db: DbConnection, column: "tempo_pin" | "tempo_hold") =>
    (await beats(db)).flatMap((b, i) => (b[column] === 1 ? [i] : []));

const lengths = async (db: DbConnection) =>
    (await beats(db)).map((b) => b.duration);

describeDbTests("tempo mode undo and redo", (it) => {
    it("pins undo and redo", async ({ db, marchersAndPages: _ }) => {
        await writeMarks({ pins: new Set([5, 9]) });
        expect(await flagged(db, "tempo_pin")).toEqual([5, 9]);
        await performUndo(db);
        expect(await flagged(db, "tempo_pin")).toEqual([]);
        await performRedo(db);
        expect(await flagged(db, "tempo_pin")).toEqual([5, 9]);
    });

    it("a hold undoes with the length it was given", async ({
        db,
        marchersAndPages: _,
    }) => {
        const before = await lengths(db);
        await writeMarks({ holds: new Set([8]) });
        const after = [...before];
        after[8] = 3.5;
        await writeDurations({ before, after, holds: new Set([8]) });
        expect((await lengths(db))[8]).toBe(3.5);
        expect(await flagged(db, "tempo_hold")).toEqual([8]);
        // the length first, then the flag
        await performUndo(db);
        expect(await lengths(db)).toEqual(before);
        expect(await flagged(db, "tempo_hold")).toEqual([8]);
        await performUndo(db);
        expect(await flagged(db, "tempo_hold")).toEqual([]);
        await performRedo(db);
        await performRedo(db);
        expect((await lengths(db))[8]).toBe(3.5);
        expect(await flagged(db, "tempo_hold")).toEqual([8]);
    });

    it("a meter undoes with its measures and count lengths", async ({
        db,
        marchersAndPages: _,
    }) => {
        // measures of 4 counts from count 1 to 24
        const rows = await beats(db);
        await db
            .insert(schema.measures)
            .values(
                [1, 5, 9, 13, 17, 21].map((b) => ({
                    start_beat: rows[b]!.id,
                })),
            )
            .run();
        const measuresNow = async () =>
            (
                await db
                    .select()
                    .from(schema.measures)
                    .orderBy(asc(schema.measures.id))
                    .all()
            ).map((m) => [m.start_beat, m.meter, m.grouping]);
        const measuresBefore = await measuresNow();
        const before = await lengths(db);
        const meter = parseMeter("7/8")!;
        const plan = planMeter({
            durations: before,
            locks: new Set(),
            measureStarts: [1, 5, 9, 13, 17, 21],
            beatCount: rows.length,
            start: 5,
            meter,
            units: [],
        });
        await writeMeter({
            plan,
            before,
            meter: { meter: "7/8", grouping: meter.grouping.join("+") },
        });
        const measuresAfter = await measuresNow();
        const lengthsAfter = await lengths(db);
        expect(measuresAfter.some(([, m]) => m === "7/8")).toBe(true);
        expect(lengthsAfter).not.toEqual(before);

        await performUndo(db);
        expect(await measuresNow()).toEqual(measuresBefore);
        expect(await lengths(db)).toEqual(before);
        await performRedo(db);
        expect(await measuresNow()).toEqual(measuresAfter);
        expect(await lengths(db)).toEqual(lengthsAfter);
    });

    it("the music offset undoes, alone and with the counts it lined up", async ({
        db,
        marchersAndPages: _,
    }) => {
        const offset = () => readAudioOffsetSeconds(db, 0);
        expect(await offset()).toBe(0);
        await writeAudioOffset(1.25);
        expect(await offset()).toBe(1.25);

        // Fit that moved the music: the offset and the lengths in one step
        const before = await lengths(db);
        const after = before.map((d, b) => (b >= 1 && b < 9 ? 0.45 : d));
        await writeDurations({ before, after, audioOffset: 0.75 });
        expect(await offset()).toBe(0.75);

        await performUndo(db);
        expect(await offset()).toBe(1.25);
        expect(await lengths(db)).toEqual(before);
        await performUndo(db);
        expect(await offset()).toBe(0);
        await performRedo(db);
        await performRedo(db);
        expect(await offset()).toBe(0.75);
        expect((await lengths(db))[1]).toBe(0.45);
    });
});
