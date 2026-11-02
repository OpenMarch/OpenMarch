/**
 * Tempo mode: writing a time signature plan (`planMeter`): the measures, the time
 * signatures written on them, the count lengths and the pins, as one edit (one undo step).
 */
import { db, schema } from "@/global/database/db";
import { transactionWithHistory } from "@/db-functions/history";
import type { DbTransaction } from "@/db-functions/types";
import { ensureCountsInTransaction } from "@/db-functions/endlessCounts";
import { updateBeatsInTransaction } from "@/db-functions/beat";
import {
    createMeasuresInTransaction,
    deleteMeasuresInTransaction,
    updateMeasuresInTransaction,
} from "@/db-functions/measures";
import { beatIdsInTransaction, writeMarksInTransaction } from "./tempoWrites";
import type { MeterPlan, NewMeasure } from "./meterPlan";
import type { Meter } from "./meters";

export { planMeter, type MeterPlan } from "./meterPlan";

/** A time signature as stored on a measure ("7/8" and "2+2+3"), or none */
export const storedMeter = (m: Meter | null) => ({
    meter: m ? `${m.top}/${m.bottom}` : null,
    grouping: m ? m.grouping.join("+") : null,
});

/** Write a time signature plan as one edit */
export async function writeMeter({
    plan,
    before,
}: {
    plan: MeterPlan;
    before: readonly number[];
}): Promise<void> {
    await transactionWithHistory(db, "tempoMeter", async (tx) => {
        await writeMeasuresInTransaction(tx, plan.measures);
        const ids = await beatIdsInTransaction(tx);
        const after = plan.result.durations;
        const changed: { id: number; duration: number }[] = [];
        for (let b = 1; b < after.length && b < ids.length; b++)
            if (Math.abs((before[b] ?? NaN) - after[b]!) > 1e-9)
                changed.push({ id: ids[b]!, duration: after[b]! });
        if (changed.length)
            await updateBeatsInTransaction({ tx, modifiedBeats: changed });
        await writeMarksInTransaction(tx, ids, { pins: plan.result.locks });
    });
}

/**
 * Make the stored measures `measures`. A measure with `from` is the stored one that started
 * there, moved and given its time signature (it keeps its rehearsal mark and number); stored
 * measures no longer there are deleted, their rehearsal marks and notes going to the measure that
 * holds their first count now.
 */
async function writeMeasuresInTransaction(
    tx: DbTransaction,
    measures: readonly NewMeasure[],
): Promise<void> {
    const last = Math.max(...measures.map((m) => m.start));
    await ensureCountsInTransaction({ tx, through: last + 1 });
    const ids = await beatIdsInTransaction(tx);
    const ordinalOf = new Map(ids.map((id, i) => [id, i]));
    const rows = await tx.select().from(schema.measures);
    const byStart = new Map<number, (typeof rows)[number]>();
    for (const r of rows) {
        const o = ordinalOf.get(r.start_beat);
        if (o !== undefined && !byStart.has(o)) byStart.set(o, r);
    }
    const kept = new Set(
        measures.flatMap((m) => (m.from === null ? [] : [m.from])),
    );
    const gone = rows.filter((r) => {
        const o = ordinalOf.get(r.start_beat);
        return o === undefined || !kept.has(o) || byStart.get(o) !== r;
    });
    // rehearsal marks and notes of deleted measures: to the new measure holding their count
    const holderOf = (o: number) =>
        [...measures].reverse().find((m) => m.start <= o) ?? measures[0]!;
    const moved = new Map<
        NewMeasure,
        { mark: string | null; notes: string | null }
    >();
    for (const r of gone) {
        const o = ordinalOf.get(r.start_beat);
        if (o === undefined || !(r.rehearsal_mark || r.notes)) continue;
        const h = holderOf(o);
        const was = moved.get(h);
        moved.set(h, {
            mark: was?.mark ?? r.rehearsal_mark,
            notes: was?.notes ?? r.notes,
        });
    }
    if (gone.length)
        await deleteMeasuresInTransaction({
            tx,
            itemIds: new Set(gone.map((r) => r.id)),
        });
    const updates = measures.flatMap((m) => {
        if (m.from === null) return [];
        const r = byStart.get(m.from)!;
        const stored = storedMeter(m.meter);
        const got = moved.get(m);
        const change = {
            ...(r.start_beat !== ids[m.start]
                ? { start_beat: ids[m.start]! }
                : {}),
            ...(r.meter !== stored.meter || r.grouping !== stored.grouping
                ? stored
                : {}),
            ...(got && !r.rehearsal_mark && got.mark
                ? { rehearsal_mark: got.mark }
                : {}),
            ...(got && !r.notes && got.notes ? { notes: got.notes } : {}),
        };
        return Object.keys(change).length ? [{ id: r.id, ...change }] : [];
    });
    if (updates.length)
        await updateMeasuresInTransaction({ tx, modifiedItems: updates });
    const added = measures.filter((m) => m.from === null);
    if (added.length)
        await createMeasuresInTransaction({
            tx,
            newItems: added.map((m) => ({
                start_beat: ids[m.start]!,
                rehearsal_mark: moved.get(m)?.mark ?? null,
                notes: moved.get(m)?.notes ?? null,
                ...storedMeter(m.meter),
            })),
        });
}
