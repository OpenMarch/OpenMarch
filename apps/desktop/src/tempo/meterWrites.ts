/**
 * PROTOTYPE (tempo mode): setting a meter with a grouping from a measure on (`planMeter`). The
 * counts stay; they're regrouped into measures of the grouping's counts, and the measures after
 * move to follow, so no short measure is left behind. Each count keeps its quarter-note tempo, so
 * the music doesn't drift. Counts after a count whose length changed, up to the next pin, re-space
 * to keep that pin (`retime`). One undo step.
 */
import { db } from "@/global/database/db";
import { transactionWithHistory } from "@/db-functions/history";
import { ensureCountsInTransaction } from "@/db-functions/endlessCounts";
import { updateBeatsInTransaction } from "@/db-functions/beat";
import {
    beatIdsInTransaction,
    regroupMeasuresInTransaction,
    shiftMeasuresInTransaction,
    writeMarksInTransaction,
} from "./tempoWrites";
import type { MeterPlan } from "./meterPlan";
import type { Meter } from "./meters";

export { planMeter, type MeterPlan } from "./meterPlan";

/** A meter as stored on a measure: "7/8" and "2+2+3" */
export const storedMeter = (m: Meter) => ({
    meter: `${m.top}/${m.bottom}`,
    grouping: m.grouping.join("+"),
});

/** Write a meter plan: measures, their meters, the count lengths and the pins, as one edit */
export async function writeMeter({
    plan,
    before,
}: {
    plan: MeterPlan;
    before: readonly number[];
}): Promise<void> {
    await transactionWithHistory(db, "tempoMeter", async (tx) => {
        await ensureCountsInTransaction({
            tx,
            through: Math.max(...plan.steps.map((s) => s.to)) + 1,
        });
        for (const step of plan.steps)
            await regroupMeasuresInTransaction(tx, {
                from: step.from,
                to: step.to,
                starts: step.starts,
                meter: storedMeter(step.meter),
            });
        if (plan.shift) await shiftMeasuresInTransaction(tx, plan.shift);
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
