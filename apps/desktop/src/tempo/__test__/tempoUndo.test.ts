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
        await db.delete(schema.measures).run();
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
            measures: [1, 5, 9, 13, 17, 21].map((start) => ({ start })),
            beatCount: rows.length,
            start: 5,
            meter,
        });
        await writeMeter({ plan, before });
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

    it("one 2/4 bar moves the measures after it, and 4/4 for that bar puts them back", async ({
        db,
        marchersAndPages: _,
    }) => {
        // 4/4 from count 1, a 3/4 bar marked B at 13, 4/4 again from 16 to the end
        const rows = await beats(db);
        await db.delete(schema.measures).run();
        await db
            .insert(schema.measures)
            .values([
                { start_beat: rows[1]!.id, meter: "4/4", grouping: "2+2+2+2" },
                ...[5, 9].map((b) => ({ start_beat: rows[b]!.id })),
                {
                    start_beat: rows[13]!.id,
                    meter: "3/4",
                    grouping: "2+2+2",
                    rehearsal_mark: "B",
                },
                { start_beat: rows[16]!.id, meter: "4/4", grouping: "2+2+2+2" },
                // to the end of the stored counts, as in a show
                ...Array.from(
                    { length: Math.ceil((rows.length - 20) / 4) },
                    (_, i) => ({ start_beat: rows[20 + 4 * i]!.id }),
                ),
            ])
            .run();
        const ordinalOf = new Map(rows.map((r, i) => [r.id, i]));
        const all = async () => await db.select().from(schema.measures).all();
        const measuresNow = async () =>
            (await all())
                .map((m) => [
                    ordinalOf.get(m.start_beat)!,
                    m.meter,
                    m.rehearsal_mark,
                ])
                .sort((a, b) => (a[0] as number) - (b[0] as number));
        const stored = async () =>
            (await all()).map((m) => ({
                ...m,
                start: ordinalOf.get(m.start_beat)!,
            }));
        const before = await measuresNow();
        const durations = await lengths(db);
        const set = async (text: string) =>
            await writeMeter({
                plan: planMeter({
                    durations: await lengths(db),
                    locks: new Set(),
                    measures: await stored(),
                    beatCount: rows.length,
                    start: 5,
                    meter: parseMeter(text)!,
                    only: true,
                }),
                before: await lengths(db),
            });
        await set("2/4");
        expect((await measuresNow()).slice(0, 7)).toEqual([
            [1, "4/4", null],
            [5, "2/4", null],
            [7, "4/4", null],
            [11, "3/4", "B"],
            [14, "4/4", null],
            [18, null, null],
            [22, null, null],
        ]);
        expect(await lengths(db)).toEqual(durations);
        // one undo step
        await performUndo(db);
        expect(await measuresNow()).toEqual(before);
        await performRedo(db);
        // and 4/4 for that bar again puts everything back
        await set("4/4");
        expect(await measuresNow()).toEqual(before);
        expect(await lengths(db)).toEqual(durations);
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
