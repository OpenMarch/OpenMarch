/**
 * Tempo mode: take a MusicXML score's timing into the show, the way a music app takes a tempo map
 * into its tempo track. The score's count lengths, measures, time signatures and rehearsal marks
 * replace the show's; every count stays where it is, so pages, moves, cues and props stay on
 * their counts and play at the score's tempos. One undo step.
 *
 * Unlike the new-show import (`components/music/MusicXmlImport.ts`), no page moves: that one lays
 * pages on measures, for a show that has none yet.
 */
import { asc, eq, or } from "drizzle-orm";
import type { Measure as ScoreMeasure } from "@openmarch/musicxml-parser";
import { db, schema } from "@/global/database/db";
import tolgee from "@/global/singletons/Tolgee";
import { transactionWithHistory } from "@/db-functions/history";
import type { DbTransaction } from "@/db-functions/types";
import { updateBeatsInTransaction } from "@/db-functions/beat";
import { ensureCountsInTransaction } from "@/db-functions/endlessCounts";
import {
    createMeasuresInTransaction,
    deleteMeasuresInTransaction,
} from "@/db-functions/measures";
import { parseMeter } from "./meters";
import { storedMeter } from "./meterWrites";

/** A measure to store: its first count, and what's written on it */
export interface ScoreMeasureRow {
    start: number;
    rehearsal_mark: string | null;
    notes: string | null;
    meter: string | null;
    grouping: string | null;
}

/** The time signature written on a score measure, as tempo mode stores it, where it changes */
function meterOf(m: ScoreMeasure) {
    if (!m.meterChanged || !m.meter) return storedMeter(null);
    const meter = parseMeter(
        m.meter.grouping ? `${m.meter.text} ${m.meter.grouping}` : m.meter.text,
    );
    // A meter tempo mode can't write (3/4+3/8, 5/16) still has its counts; only its name goes
    return storedMeter(
        meter && meter.grouping.length === m.beats.length ? meter : null,
    );
}

/**
 * The score as counts from count 1: each count's length, and the measures. Counts the show has
 * past the end of the score keep their lengths, in measures as long as the score's last one.
 */
export function scoreTiming(
    measures: readonly ScoreMeasure[],
    storedCount: number,
): { lengths: number[]; measures: ScoreMeasureRow[] } {
    const lengths: number[] = [];
    const rows: ScoreMeasureRow[] = [];
    for (const m of measures) {
        if (m.beats.length === 0) continue;
        const repeat = m.time !== undefined && m.time > 1;
        rows.push({
            start: lengths.length + 1,
            // Each pass of a repeated section gets its own mark: A, A-2, A-3
            rehearsal_mark: m.rehearsalMark
                ? repeat
                    ? `${m.rehearsalMark}-${m.time}`
                    : m.rehearsalMark
                : null,
            // A measure played again by a repeat says which written measure it is
            notes:
                m.notes ??
                (repeat
                    ? tolgee.t("music.repeatPlayNote", {
                          label: m.label ?? "",
                          time: m.time,
                      })
                    : null),
            ...meterOf(m),
        });
        for (const b of m.beats) lengths.push(b.duration);
    }
    const last = measures.findLast((m) => m.beats.length > 0);
    const every = last?.beats.length ?? 4;
    for (let s = lengths.length + 1; s < storedCount; s += every)
        rows.push({
            start: s,
            rehearsal_mark: null,
            notes: null,
            meter: null,
            grouping: null,
        });
    return { lengths, measures: rows };
}

async function importInTransaction(
    tx: DbTransaction,
    measures: readonly ScoreMeasure[],
): Promise<void> {
    const before = await tx
        .select({ id: schema.beats.id })
        .from(schema.beats)
        .orderBy(asc(schema.beats.position));
    const timing = scoreTiming(measures, before.length);
    if (timing.lengths.length === 0)
        throw new Error("The file has no measures");
    // The score's counts are all stored, the endless ones it reaches too
    await ensureCountsInTransaction({ tx, through: timing.lengths.length + 1 });
    const ids = (
        await tx
            .select({ id: schema.beats.id })
            .from(schema.beats)
            .orderBy(asc(schema.beats.position))
    ).map((r) => r.id);

    await updateBeatsInTransaction({
        tx,
        modifiedBeats: timing.lengths.map((duration, i) => ({
            id: ids[i + 1]!,
            duration,
        })),
    });
    // Holds and tempo points were the show's timing: the score's lengths replace them (the
    // tempo lane reads its points from the counts again)
    await tx
        .update(schema.beats)
        .set({ tempo_hold: 0, tempo_change: 0 })
        .where(
            or(
                eq(schema.beats.tempo_hold, 1),
                eq(schema.beats.tempo_change, 1),
            ),
        );

    const old = await tx
        .select({ id: schema.measures.id })
        .from(schema.measures);
    if (old.length)
        await deleteMeasuresInTransaction({
            tx,
            itemIds: new Set(old.map((m) => m.id)),
        });
    await createMeasuresInTransaction({
        tx,
        newItems: timing.measures
            .filter((m) => ids[m.start] !== undefined)
            .map(({ start, ...facts }) => ({
                start_beat: ids[start]!,
                ...facts,
            })),
    });
}

/** Replace the show's timing with the score's, keeping every count where it is: one undo step */
export async function importScoreTiming(
    measures: readonly ScoreMeasure[],
): Promise<void> {
    await transactionWithHistory(db, "tempoImportMusicXml", (tx) =>
        importInTransaction(tx, measures),
    );
}
