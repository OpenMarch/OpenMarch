/**
 * What the timeline's Equipment lane draws (fork #991's option E, picked by the owner on
 * 2026-11-15): one row per group of performers with the same Equipment history, folding into a
 * stacked summary of how many hold each thing (option C). Only performers with an Equipment cue
 * are in the lane; everyone else is on their section's usual and left out.
 *
 * Counts are the compile's (`showCues.ts`); `spanBeats` turns them into the timeline's spec beats.
 * Pure, so the lane and its tests read the same answers.
 */
import {
    cueValueLookup,
    type CompiledCues,
    type CueSegment,
    type PerformerCarry,
    type SegmentKind,
} from "@openmarch/core";
import type { DatabaseCue } from "@/db-functions/cues";

const lookup = cueValueLookup();

/** One piece of a row: a value held over `[from, to)` counts. */
export interface LanePiece {
    readonly from: number;
    readonly to: number;
    /** `default` is the section's usual (not a cue); `lasting` and `momentary` are cues. */
    readonly kind: SegmentKind;
    readonly holds: PerformerCarry;
    /** The cue that set it; null for the default. */
    readonly cueId: number | null;
}

export interface LaneRow {
    /** Stable while the row's performers and history stay the same. */
    readonly key: string;
    /** Its performers, ascending. */
    readonly marcherIds: readonly number[];
    /** The label of a cue made for exactly these performers, or null (the caller names them). */
    readonly label: string | null;
    readonly pieces: readonly LanePiece[];
}

/** One slice of the folded summary: how many of the lane's performers hold each thing. */
export interface SummarySlice {
    readonly from: number;
    readonly to: number;
    /** In `SUMMARY_ORDER`, only what someone holds. */
    readonly counts: readonly { holds: PerformerCarry; count: number }[];
}

/** A cue's mark on the folded summary. */
export interface SummaryMark {
    readonly cueId: number;
    readonly count: number;
    readonly holds: PerformerCarry;
}

export interface EquipmentLane {
    readonly rows: readonly LaneRow[];
    /** Everyone in the lane. */
    readonly marcherIds: readonly number[];
    readonly summary: readonly SummarySlice[];
    readonly marks: readonly SummaryMark[];
}

/** The order the summary stacks values in, top to bottom. */
export const SUMMARY_ORDER: readonly PerformerCarry[] = [
    "flag",
    "rifle",
    "sabre",
    "winds",
    "battery",
    "none",
];

const holdsOf = (value: string | null, usual: PerformerCarry): PerformerCarry =>
    (value !== null ? lookup(value)?.holds : undefined) ?? usual;

/** A performer's Equipment history as pieces, neighbors with one value and cue merged. */
function piecesOf(
    segments: readonly CueSegment[],
    usual: PerformerCarry,
): LanePiece[] {
    const out: LanePiece[] = [];
    for (const seg of segments) {
        if (seg.to <= seg.from) continue;
        const piece: LanePiece = {
            from: seg.from,
            to: seg.to,
            kind: seg.kind === "transition" ? "lasting" : seg.kind,
            holds: holdsOf(seg.value, usual),
            cueId: seg.cueId,
        };
        const last = out[out.length - 1];
        if (
            last &&
            last.to === piece.from &&
            last.cueId === piece.cueId &&
            last.kind === piece.kind &&
            last.holds === piece.holds
        )
            out[out.length - 1] = { ...last, to: piece.to };
        else out.push(piece);
    }
    return out;
}

const pieceKey = (p: LanePiece) =>
    `${p.from}:${p.to}:${p.kind}:${p.holds}:${p.cueId ?? ""}`;

/**
 * The lane for the show's Equipment cues: a row per group of performers sharing one history, in
 * order of their first cue, then their first performer.
 */
export function equipmentLane({
    compiled,
    cues,
    usual,
}: {
    compiled: CompiledCues;
    cues: readonly DatabaseCue[];
    /** Each performer's section's usual equipment; performers not here are left out. */
    usual: ReadonlyMap<number, PerformerCarry>;
}): EquipmentLane {
    const equipment = cues.filter((c) => c.type === "equipment");
    const inLane = [...new Set(equipment.flatMap((c) => c.marcherIds))]
        .filter((id) => usual.has(id))
        .sort((a, b) => a - b);
    const groups = new Map<string, { ids: number[]; pieces: LanePiece[] }>();
    for (const id of inLane) {
        const pieces = piecesOf(
            compiled.segments(id, "equipment"),
            usual.get(id)!,
        );
        const key = pieces.map(pieceKey).join("|");
        const group = groups.get(key);
        if (group) group.ids.push(id);
        else groups.set(key, { ids: [id], pieces });
    }
    const firstCue = (pieces: readonly LanePiece[]) =>
        pieces.find((p) => p.cueId !== null)?.from ?? Infinity;
    const rows = [...groups.values()]
        .sort(
            (a, b) =>
                firstCue(a.pieces) - firstCue(b.pieces) || a.ids[0] - b.ids[0],
        )
        .map(({ ids, pieces }): LaneRow => {
            const set = new Set(ids);
            const named = equipment.find(
                (c) =>
                    c.label &&
                    c.marcherIds.length === ids.length &&
                    c.marcherIds.every((id) => set.has(id)),
            );
            return {
                key: ids.join(","),
                marcherIds: ids,
                label: named?.label ?? null,
                pieces,
            };
        });
    return {
        rows,
        marcherIds: inLane,
        summary: summaryOf(rows),
        marks: marksOf(equipment, rows),
    };
}

/** How many of the lane hold each thing, slice by slice between the rows' piece edges. */
function summaryOf(rows: readonly LaneRow[]): SummarySlice[] {
    const edges = [
        ...new Set(
            rows.flatMap((r) => r.pieces.flatMap((p) => [p.from, p.to])),
        ),
    ].sort((a, b) => a - b);
    const out: SummarySlice[] = [];
    for (let i = 0; i + 1 < edges.length; i++) {
        const from = edges[i];
        const to = edges[i + 1];
        const tally = new Map<PerformerCarry, number>();
        for (const row of rows) {
            const piece = row.pieces.find((p) => p.from <= from && from < p.to);
            if (!piece) continue;
            tally.set(
                piece.holds,
                (tally.get(piece.holds) ?? 0) + row.marcherIds.length,
            );
        }
        const counts = SUMMARY_ORDER.flatMap((holds) =>
            tally.has(holds) ? [{ holds, count: tally.get(holds)! }] : [],
        );
        const last = out[out.length - 1];
        if (last && sameCounts(last.counts, counts))
            out[out.length - 1] = { ...last, to };
        else out.push({ from, to, counts });
    }
    return out;
}

const sameCounts = (
    a: SummarySlice["counts"],
    b: SummarySlice["counts"],
): boolean =>
    a.length === b.length &&
    a.every((c, i) => c.holds === b[i].holds && c.count === b[i].count);

/** A mark per cue that shows in some row, at the count it starts. */
function marksOf(
    equipment: readonly DatabaseCue[],
    rows: readonly LaneRow[],
): SummaryMark[] {
    const out = new Map<number, SummaryMark>();
    for (const row of rows)
        for (const p of row.pieces)
            if (p.cueId !== null && !out.has(p.cueId))
                out.set(p.cueId, {
                    cueId: p.cueId,
                    count: p.from,
                    holds: p.holds,
                });
    // Keep the cues' own order (newest last) for marks on one count
    return equipment.flatMap((c) => (out.has(c.id) ? [out.get(c.id)!] : []));
}

/**
 * The spec beat a compile count starts on (`beats` is the timeline's beats in order, `beatIds`
 * the compile's): count `c` is `beatIds[c]`'s click, and the count after the last ends one beat
 * after it.
 */
export function countToSpecBeat(
    count: number,
    beatIds: readonly number[],
    specOf: ReadonlyMap<number, number>,
): number {
    if (beatIds.length === 0) return 0;
    const whole = Math.floor(count);
    const at = (c: number) =>
        c < beatIds.length
            ? (specOf.get(beatIds[c]) ?? 0)
            : (specOf.get(beatIds[beatIds.length - 1]) ?? 0) +
              (c - beatIds.length + 1);
    return at(whole) + (count - whole) * (at(whole + 1) - at(whole));
}
