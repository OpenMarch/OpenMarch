/**
 * Tempo mode: what the tempo lanes read from the show (count
 * lengths, holds, tempo changes, measures, the music offset) and how an edit is written back.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/App";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { type TempoEditResult } from "./tempoMath";
import { writeMarks, writeDurations } from "./tempoWrites";
import { useAudioOffsetSeconds } from "./audioOffset";

/** The toast a tempo edit's note goes in (one at a time; undo and leaving the mode clear it) */
export const NOTE_TOAST = "tempo-note";

export interface TempoMeasure {
    start: number;
    number: number;
    mark: string | null;
    counts: number;
    id: number | null;
    overridden: boolean;
    /** The time signature written here ("7/8"), and its grouping in eighths ("2+2+3") */
    meter?: string | null;
    grouping?: string | null;
}

export interface TempoData {
    /** Count lengths by spec beat, out to the axis end (endless counts included) */
    durations: number[];
    /** Held spec beats (fermatas) */
    holds: Set<number>;
    /** Where tempo changes start, as stored; empty for a show that has none yet (see `changesOf`) */
    changes: Set<number>;
    /** Beat id by spec beat, for the stored counts */
    ids: number[];
    measures: TempoMeasure[];
    storedCount: number;
    audioOffset: number;
}

/** Held beats and tempo changes (flags on the beats rows, so they're in undo with the edits) */
export const tempoMarksQuery = () => ({
    // under "beats", so whatever refreshes the beats (an edit, undo) refreshes these too
    queryKey: ["beats", "tempoMarks"] as const,
    queryFn: async () => {
        const { db, schema } = await import("@/global/database/db");
        const { or, eq } = await import("drizzle-orm");
        return await db
            .select({
                id: schema.beats.id,
                hold: schema.beats.tempo_hold,
                change: schema.beats.tempo_change,
            })
            .from(schema.beats)
            .where(
                or(
                    eq(schema.beats.tempo_hold, 1),
                    eq(schema.beats.tempo_change, 1),
                ),
            );
    },
});

export function useTempoData(beatCount: number): TempoData {
    const { beats, measures, countGrid } = useTimingObjects();
    const { data: marks } = useQuery(tempoMarksQuery());
    // The music offset in the show's history (it undoes with the counts it lines up)
    const audioOffset = useAudioOffsetSeconds();
    return useMemo(() => {
        const n = Math.max(beatCount + 1, beats.length);
        const durations = [0];
        for (let b = 1; b < n; b++) durations.push(countGrid.durationAt(b));
        const ids = beats.map((b) => b.id);
        const ordinalOf = new Map(ids.map((id, i) => [id, i]));
        const toOrdinals = (list: readonly number[]) => {
            const out = new Set<number>();
            for (const id of list) {
                const o = ordinalOf.get(id);
                if (o !== undefined && o >= 1) out.add(o);
            }
            return out;
        };
        const holds = toOrdinals(
            (marks ?? []).filter((m) => m.hold === 1).map((m) => m.id),
        );
        const changes = toOrdinals(
            (marks ?? []).filter((m) => m.change === 1).map((m) => m.id),
        );
        const ms: TempoMeasure[] = measures.map((m) => ({
            start: m.startBeat.index,
            number: m.number,
            mark: m.rehearsalMark,
            counts: m.counts,
            id: m.id,
            overridden:
                (m as { number_override?: number | null }).number_override !=
                null,
            meter: (m as { meter?: string | null }).meter ?? null,
            grouping: (m as { grouping?: string | null }).grouping ?? null,
        }));
        // The endless measures: where the timeline's count grid puts downbeats past the stored
        // counts (a short last measure is finished first, then its meter carries on)
        const last = ms[ms.length - 1];
        if (last) {
            const storedEnd = beats.length;
            // the last stored measure runs on to the grid's next downbeat
            let b = storedEnd;
            while (b < n && !countGrid.isDownbeat(b)) b++;
            last.counts = Math.max(last.counts, b - last.start);
            let number = last.number + 1;
            while (b < n) {
                let e = b + 1;
                while (e < n && !countGrid.isDownbeat(e)) e++;
                ms.push({
                    start: b,
                    number: number++,
                    mark: null,
                    counts: e - b,
                    id: null,
                    overridden: false,
                });
                b = e;
            }
        }
        return {
            durations,
            holds,
            changes,
            ids,
            measures: ms,
            storedCount: beats.length,
            audioOffset,
        };
    }, [beats, measures, countGrid, marks, beatCount, audioOffset]);
}

/** Save holds (spec beats) as beat flags: one undo step */
export async function saveHolds(holds: ReadonlySet<number>) {
    await writeMarks({ holds });
    await queryClient.invalidateQueries({ queryKey: ["beats"] });
}

/** Write a tempo edit: the new lengths and the tempo changes, in one undo step */
export async function commitEdit(
    before: TempoData,
    result: TempoEditResult & { changes?: ReadonlySet<number> },
    refetch: () => Promise<unknown>,
    /**
     * Where tempo changes start, when the edit doesn't say: the lane's points as they were. A show
     * with none stored gets the ones the lane read from its counts, so its points stay put from
     * the first edit on
     */
    changes?: ReadonlySet<number>,
) {
    await writeDurations({
        before: before.durations,
        after: result.durations,
        changes: result.changes ?? changes,
    });
    await refetch();
}
