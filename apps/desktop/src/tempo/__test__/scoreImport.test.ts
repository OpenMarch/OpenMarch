import { expect } from "vitest";
import { asc } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { performUndo } from "@/db-functions/history";
import { parseMusicXmlFile } from "@/components/music/MusicXmlImport";
import { importScoreTiming } from "../scoreImport";

/**
 * Tempo mode's MusicXML import on the `marchersAndPages` show (beat 0, then pages 1 to 6 starting at
 * counts 1, 9, 17, 25, 33 and 41, one move per page): the score's timing comes in, every count
 * stays where it is.
 */

const score = (measures: string) => {
    const bytes = new TextEncoder().encode(
        `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1">${measures}</part>
</score-partwise>`,
    );
    return { arrayBuffer: async () => bytes.buffer as ArrayBuffer };
};

/** A whole-note measure; the first sets 4/4 at ♩ = `tempo` and a rehearsal mark */
const measure = (
    n: number,
    opts: { tempo?: number; mark?: string; time?: string } = {},
) => {
    const [beats, type] = (opts.time ?? "4/4").split("/");
    const eighths = (Number(beats) * 8) / Number(type);
    return `<measure number="${n}">
  ${n === 1 || opts.time ? `<attributes><divisions>2</divisions><time><beats>${beats}</beats><beat-type>${type}</beat-type></time></attributes>` : ""}
  ${opts.mark ? `<direction><direction-type><rehearsal>${opts.mark}</rehearsal></direction-type></direction>` : ""}
  ${opts.tempo ? `<direction><sound tempo="${opts.tempo}"/></direction>` : ""}
  <note><rest/><duration>${eighths}</duration></note>
</measure>`;
};

const snapshot = async (db: DbConnection) => {
    const beats = await db
        .select()
        .from(schema.beats)
        .orderBy(asc(schema.beats.position))
        .all();
    const ordinal = new Map(beats.map((b, i) => [b.id, i]));
    return {
        beatIds: beats.map((b) => b.id),
        lengths: beats.map((b) => Math.round(b.duration * 1000) / 1000),
        pages: (await db.select().from(schema.pages).all())
            .map((p) => ordinal.get(p.start_beat)!)
            .sort((a, b) => a - b),
        moves: (await db.select().from(schema.timelines).all())
            .map((t) => [t.start_beat, t.end_beat])
            .sort((a, b) => a[0]! - b[0]!),
        measures: (await db.select().from(schema.measures).all())
            .map((m) => ({
                start: ordinal.get(m.start_beat)!,
                mark: m.rehearsal_mark,
                meter: m.meter,
            }))
            .sort((a, b) => a.start - b.start),
    };
};

describeDbTests("tempo mode's MusicXML import", (it) => {
    it("takes the score's lengths, measures and marks, and keeps every count where it is", async ({
        db,
        marchersAndPages: _,
    }) => {
        const before = await snapshot(db);
        const parsed = await parseMusicXmlFile(
            score(
                measure(1, { tempo: 60, mark: "A" }) +
                    measure(2) +
                    measure(3, { time: "3/4", mark: "B" }) +
                    // 3/4 written again: not a change, so not stored again
                    measure(4, { time: "3/4" }),
            ),
        );
        await importScoreTiming(parsed.measures);
        const after = await snapshot(db);

        // Same beats, pages and moves: drill stays on its counts
        expect(after.beatIds).toEqual(before.beatIds);
        expect(after.pages).toEqual(before.pages);
        expect(after.moves).toEqual(before.moves);
        // ♩ = 60 for the score's 14 counts; the show's counts after it keep their lengths
        expect(after.lengths.slice(1, 15)).toEqual(Array(14).fill(1));
        expect(after.lengths.slice(15)).toEqual(before.lengths.slice(15));
        // The score's measures, then measures as long as its last one to the end of the counts
        expect(after.measures.slice(0, 4)).toEqual([
            { start: 1, mark: "A", meter: "4/4" },
            { start: 5, mark: null, meter: null },
            { start: 9, mark: "B", meter: "3/4" },
            { start: 12, mark: null, meter: null },
        ]);
        const rest = after.measures.slice(4).map((m) => m.start);
        expect(rest[0]).toBe(15);
        expect(rest.every((s, i) => i === 0 || s - rest[i - 1]! === 3)).toBe(
            true,
        );
        expect(rest.at(-1)).toBeLessThan(before.beatIds.length);

        // One undo puts it all back
        await performUndo(db);
        expect(await snapshot(db)).toEqual(before);
    });

    it("stores the counts a score longer than the show reaches", async ({
        db,
        marchersAndPages: _,
    }) => {
        const before = await snapshot(db);
        // Five measures of 4/4 past the show's stored counts
        const count = Math.ceil(before.beatIds.length / 4) + 5;
        const parsed = await parseMusicXmlFile(
            score(
                Array.from({ length: count }, (_, i) =>
                    measure(i + 1, i === 0 ? { tempo: 120 } : {}),
                ).join(""),
            ),
        );
        await importScoreTiming(parsed.measures);
        const after = await snapshot(db);
        expect(after.lengths.length).toBe(count * 4 + 1);
        expect(after.lengths.slice(1)).toEqual(Array(count * 4).fill(0.5));
        expect(after.measures.map((m) => m.start)).toEqual(
            Array.from({ length: count }, (_, i) => 1 + i * 4),
        );
        expect(after.pages).toEqual(before.pages);
        expect(after.moves).toEqual(before.moves);
    });
});
