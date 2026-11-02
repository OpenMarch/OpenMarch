/**
 * Tempo mode. The writes tempo mode makes, each one undo
 * step: new count lengths, counts added or removed (with the drill choice), measures regrouped
 * for a time signature, rehearsal marks. Locks and measure-number overrides live in the
 * workspace settings, which have no undo (a prototype shortcut).
 */
import { setAudioOffsetInTransaction } from "./audioOffset";
import { and, asc, eq, gt, gte, inArray, lt } from "drizzle-orm";
import { db, schema } from "@/global/database/db";
import tolgee from "@/global/singletons/Tolgee";
import { transactionWithHistory } from "@/db-functions/history";
import type { DbTransaction } from "@/db-functions/types";
import {
    createBeatsInTransaction,
    deleteBeatsCarryingCuesInTransaction,
    updateBeatsInTransaction,
} from "@/db-functions/beat";
import { withTimelinePageRipple } from "@/db-functions/timelineRipple";
import { ensureCountsInTransaction } from "@/db-functions/endlessCounts";
import { resizeTimelineInTransaction } from "@/db-functions/timelineResize";
import {
    createMeasuresInTransaction,
    deleteMeasuresInTransaction,
    updateMeasuresInTransaction,
} from "@/db-functions/measures";
import {
    getWorkspaceSettingsParsed,
    updateWorkspaceSettingsParsed,
} from "@/db-functions/workspaceSettings";
import type { WorkspaceSettings } from "@/settings/workspaceSettings";

/** Beat flags tempo mode writes, as sets of spec beats; a missing set is left as it is */
export interface TempoMarks {
    pins?: ReadonlySet<number>;
    holds?: ReadonlySet<number>;
    /** Where tempo changes start: the tempo lane's points */
    changes?: ReadonlySet<number>;
}

/** Beat ids by ordinal (position order), beat 0 first */
export async function beatIdsInTransaction(
    tx: DbTransaction,
): Promise<number[]> {
    const rows = await tx
        .select({ id: schema.beats.id })
        .from(schema.beats)
        .orderBy(asc(schema.beats.position));
    return rows.map((r) => r.id);
}

/**
 * Give the counts new lengths. `durations` is indexed by spec beat and may run past the stored
 * counts (the endless ones get stored). Only changed counts are written.
 */
export async function writeDurations({
    before,
    after,
    pins,
    holds,
    changes,
    audioOffset,
}: {
    before: readonly number[];
    after: readonly number[];
    /** The pinned spec beats after the edit, written in the same undo step */
    pins?: ReadonlySet<number>;
    /** The held spec beats after the edit */
    holds?: ReadonlySet<number>;
    /** Where tempo changes start after the edit */
    changes?: ReadonlySet<number>;
    /** The music offset after the edit (a fit that moved the music), in the same undo step */
    audioOffset?: number;
}): Promise<void> {
    const changed: number[] = [];
    for (let b = 1; b < after.length; b++)
        if (
            Math.abs((before[b] ?? NaN) - after[b]!) > 1e-9 ||
            b >= before.length
        )
            changed.push(b);
    const marks = [...(pins ?? []), ...(holds ?? []), ...(changes ?? [])];
    // An edit that changes nothing writes nothing: history refuses an empty step
    if (
        changed.length === 0 &&
        audioOffset === undefined &&
        !(await marksWouldChange({ pins, holds, changes }))
    )
        return;
    const last = Math.max(changed[changed.length - 1] ?? 0, ...marks);
    await transactionWithHistory(db, "tempoEdit", async (tx) => {
        await ensureCountsInTransaction({ tx, through: last + 1 });
        const ids = await beatIdsInTransaction(tx);
        if (changed.length)
            await updateBeatsInTransaction({
                tx,
                modifiedBeats: changed
                    .filter((b) => ids[b] !== undefined)
                    .map((b) => ({ id: ids[b]!, duration: after[b]! })),
            });
        await writeMarksInTransaction(tx, ids, { pins, holds, changes });
        if (audioOffset !== undefined)
            await setAudioOffsetInTransaction(tx, audioOffset);
    });
}

/** Pins, holds and changes, as beat flags: the beats that change get the new value, in one statement each */
export async function writeMarksInTransaction(
    tx: DbTransaction,
    ids: readonly number[],
    { pins, holds, changes }: TempoMarks,
) {
    const write = async (
        column: "tempo_pin" | "tempo_hold" | "tempo_change",
        set: ReadonlySet<number> | undefined,
    ) => {
        if (!set) return;
        const want = [...set].flatMap((b) =>
            ids[b] === undefined ? [] : [ids[b]!],
        );
        const now = (
            await tx
                .select({ id: schema.beats.id })
                .from(schema.beats)
                .where(eq(schema.beats[column], 1))
        ).map((r) => r.id);
        const off = now.filter((id) => !want.includes(id));
        const on = want.filter((id) => !now.includes(id));
        if (off.length)
            await tx
                .update(schema.beats)
                .set({ [column]: 0 })
                .where(inArray(schema.beats.id, off));
        if (on.length)
            await tx
                .update(schema.beats)
                .set({ [column]: 1 })
                .where(inArray(schema.beats.id, on));
    };
    await write("tempo_pin", pins);
    await write("tempo_hold", holds);
    await write("tempo_change", changes);
}

/** Whether writing these flags (spec beats) would change any beat's flags */
async function marksWouldChange({
    pins,
    holds,
    changes,
}: TempoMarks): Promise<boolean> {
    if (!pins && !holds && !changes) return false;
    const rows = await db
        .select({
            id: schema.beats.id,
            pin: schema.beats.tempo_pin,
            hold: schema.beats.tempo_hold,
            change: schema.beats.tempo_change,
        })
        .from(schema.beats)
        .orderBy(asc(schema.beats.position));
    const differs = (
        set: ReadonlySet<number> | undefined,
        flag: (r: (typeof rows)[number]) => number,
    ) => {
        if (!set) return false;
        for (const b of set)
            if (b >= rows.length || flag(rows[b]!) !== 1) return true;
        const count = rows.filter((r) => flag(r) === 1).length;
        return count !== [...set].filter((b) => b < rows.length).length;
    };
    return (
        differs(pins, (r) => r.pin) ||
        differs(holds, (r) => r.hold) ||
        differs(changes, (r) => r.change)
    );
}

/** Pin, hold or tempo-change flags (spec beats) on their own: one undo step */
export async function writeMarks(marks: TempoMarks): Promise<void> {
    if (!(await marksWouldChange(marks))) return;
    await transactionWithHistory(db, "tempoMarks", async (tx) => {
        const last = Math.max(
            0,
            ...(marks.pins ?? []),
            ...(marks.holds ?? []),
            ...(marks.changes ?? []),
        );
        await ensureCountsInTransaction({ tx, through: last + 1 });
        await writeMarksInTransaction(
            tx,
            await beatIdsInTransaction(tx),
            marks,
        );
    });
}

/** Set (or clear, with null) the number a measure gets by hand: one undo step */
export async function setMeasureNumber({
    measureId,
    number,
}: {
    measureId: number;
    number: number | null;
}): Promise<void> {
    await transactionWithHistory(db, "tempoMeasureNumber", async (tx) => {
        await updateMeasuresInTransaction({
            tx,
            modifiedItems: [{ id: measureId, number_override: number }],
        });
    });
}

/** Write count lengths for ordinals `from`.. inside an edit (after counts were added or removed) */
async function writeLengthsInTransaction(
    tx: DbTransaction,
    respaced: { from: number; lengths: readonly number[] } | undefined,
) {
    if (!respaced) return;
    const ids = await beatIdsInTransaction(tx);
    await updateBeatsInTransaction({
        tx,
        modifiedBeats: respaced.lengths.flatMap((duration, i) => {
            const id = ids[respaced.from + i];
            return id === undefined || id === ids[0] ? [] : [{ id, duration }];
        }),
    });
}

/** How the moves over an added or removed count change (the drill choice) */
export type DrillChoice =
    /** The move over the spot gets longer or shorter by the counts (today's ripple) */
    | "adjust"
    /** The move keeps its counts: an added count becomes a hold at its end; a removed one comes out of a hold after it */
    | "keep";

/** What an added or removed count did to the moves */
export interface CountEditResult {
    /** Moves that kept their counts */
    kept: number;
    /** Moves that couldn't keep their counts and changed length after all */
    couldNotKeep: number;
}

/**
 * Moves (timelines) whose range strictly contains ordinal `beat`; with `orEnding`, also the moves
 * that end right there (a count added at a page boundary goes to the page, and its move, before)
 */
async function movesAround(
    tx: DbTransaction,
    beat: number,
    { orEnding = false }: { orEnding?: boolean } = {},
) {
    return await tx
        .select()
        .from(schema.timelines)
        .where(
            and(
                lt(schema.timelines.start_beat, beat),
                (orEnding ? gte : gt)(schema.timelines.end_beat, beat),
            ),
        );
}

/** A move's range in spec beats (`[start, end)`) */
export interface MoveSpan {
    id: number;
    start: number;
    end: number;
}

/** Every move's range, for saying what a count edit does to the drill */
export async function readMoves(): Promise<MoveSpan[]> {
    const rows = await db
        .select({
            id: schema.timelines.id,
            start: schema.timelines.start_beat,
            end: schema.timelines.end_beat,
        })
        .from(schema.timelines);
    return rows;
}

/**
 * A breath in the drill, not the music: each of the moves ends one count early, so its marchers
 * hold there for that count. No count is added. One undo step.
 */
export async function endMovesEarly({
    timelineIds,
}: {
    timelineIds: readonly number[];
}): Promise<void> {
    await transactionWithHistory(db, "tempoHoldDrill", async (tx) => {
        for (const id of timelineIds) {
            const move = await tx
                .select()
                .from(schema.timelines)
                .where(eq(schema.timelines.id, id))
                .get();
            if (!move || move.end_beat - move.start_beat < 2)
                throw new Error(tolgee.t("tempoMode.errors.moveOneCountLong"));
            await resizeTimelineInTransaction({
                tx,
                timelineId: id,
                start: move.start_beat,
                end: move.end_beat - 1,
            });
        }
    });
}

/**
 * Add `count` counts before spec beat `at`, each `duration` long. The moves after shift with the
 * music (the ripple); the move over the spot stretches (`adjust`) or holds (`keep`).
 */
export async function insertCounts({
    at,
    count,
    duration,
    drill,
    respaced,
}: {
    at: number;
    count: number;
    duration: number;
    drill: DrillChoice;
    /** Lengths to give the counts from `from` on afterwards (keep everything else in place) */
    respaced?: { from: number; lengths: readonly number[] };
}): Promise<CountEditResult> {
    return await transactionWithHistory(db, "tempoInsertCounts", async (tx) => {
        await ensureCountsInTransaction({ tx, through: at });
        // A count added right after a move's last count lengthens it too (the page before a page
        // boundary takes the count), so with `keep` that move holds as well
        const around = await movesAround(tx, at, { orEnding: true });
        await withTimelinePageRipple(tx, async () => {
            await createBeatsInTransaction({
                tx,
                newBeats: Array.from({ length: count }, () => ({
                    duration,
                    include_in_measure: true,
                })),
                startingPosition: at - 1,
            });
        });
        await writeLengthsInTransaction(tx, respaced);
        const result: CountEditResult = { kept: 0, couldNotKeep: 0 };
        if (drill === "keep")
            for (const move of around) {
                const now = await tx
                    .select()
                    .from(schema.timelines)
                    .where(eq(schema.timelines.id, move.id))
                    .get();
                if (!now) continue;
                const grew =
                    now.end_beat -
                    now.start_beat -
                    (move.end_beat - move.start_beat);
                if (grew <= 0) continue;
                try {
                    await resizeTimelineInTransaction({
                        tx,
                        timelineId: move.id,
                        start: now.start_beat,
                        end: now.end_beat - grew,
                    });
                    result.kept++;
                } catch {
                    result.couldNotKeep++;
                }
            }
        return result;
    });
}

/**
 * Remove spec beats `from`..`to - 1`. A measure or page starting on a removed count starts on the
 * next one left (or goes, when that one already starts one). With `keep`, a move that lost counts
 * takes them back from a hold after it where it can.
 */
export async function deleteCounts({
    from,
    to,
    drill,
    respaced,
}: {
    from: number;
    to: number;
    drill: DrillChoice;
    respaced?: { from: number; lengths: readonly number[] };
}): Promise<CountEditResult> {
    return await transactionWithHistory(db, "tempoDeleteCounts", async (tx) => {
        await ensureCountsInTransaction({ tx, through: to + 1 });
        const ids = await beatIdsInTransaction(tx);
        const doomed = ids.slice(Math.max(1, from), to);
        const survivor = ids[to];
        if (doomed.length === 0 || survivor === undefined)
            throw new Error(tolgee.t("tempoMode.errors.cantRemoveLastCount"));
        const around = new Map<number, typeof schema.timelines.$inferSelect>();
        for (let b = from; b < to; b++)
            for (const m of await movesAround(tx, b)) around.set(m.id, m);
        await withTimelinePageRipple(tx, async () => {
            // Measures and pages on the removed counts move to the next count left
            const measures = await tx
                .select()
                .from(schema.measures)
                .where(
                    inArray(schema.measures.start_beat, [...doomed, survivor]),
                );
            const onSurvivor = measures.find((m) => m.start_beat === survivor);
            const moving = measures.filter((m) => m.start_beat !== survivor);
            const keep = onSurvivor ? [] : moving.slice(0, 1);
            const drop = moving.filter((m) => !keep.includes(m));
            if (keep.length)
                await updateMeasuresInTransaction({
                    tx,
                    modifiedItems: keep.map((m) => ({
                        id: m.id,
                        start_beat: survivor,
                    })),
                });
            if (drop.length)
                await deleteMeasuresInTransaction({
                    tx,
                    itemIds: new Set(drop.map((m) => m.id)),
                });
            const pages = await tx
                .select()
                .from(schema.pages)
                .where(inArray(schema.pages.start_beat, [...doomed, survivor]));
            const pageOnSurvivor = pages.some((p) => p.start_beat === survivor);
            const movingPages = pages.filter((p) => p.start_beat !== survivor);
            if (
                movingPages.length > 1 ||
                (movingPages.length && pageOnSurvivor)
            )
                throw new Error(tolgee.t("tempoMode.errors.wouldRemovePage"));
            for (const p of movingPages)
                await tx
                    .update(schema.pages)
                    .set({ start_beat: survivor })
                    .where(eq(schema.pages.id, p.id));
            await deleteBeatsCarryingCuesInTransaction({
                tx,
                beatIds: new Set(doomed),
            });
        });
        await writeLengthsInTransaction(tx, respaced);
        const result: CountEditResult = { kept: 0, couldNotKeep: 0 };
        if (drill === "keep")
            for (const move of around.values()) {
                const now = await tx
                    .select()
                    .from(schema.timelines)
                    .where(eq(schema.timelines.id, move.id))
                    .get();
                if (!now) continue;
                const lost =
                    move.end_beat -
                    move.start_beat -
                    (now.end_beat - now.start_beat);
                if (lost <= 0) continue;
                try {
                    await resizeTimelineInTransaction({
                        tx,
                        timelineId: move.id,
                        start: now.start_beat,
                        end: now.end_beat + lost,
                    });
                    result.kept++;
                } catch {
                    result.couldNotKeep++;
                }
            }
        return result;
    });
}

/**
 * Regroup the stretch `[from, to)` (spec beats) into measures starting at `starts`: a time
 * signature change. Rehearsal marks stay on their measure's first count, or move to the new
 * measure that holds it.
 */
export async function regroupMeasuresWrite(args: {
    from: number;
    to: number;
    starts: readonly number[];
}): Promise<void> {
    await transactionWithHistory(db, "tempoTimeSignature", (tx) =>
        regroupMeasuresInTransaction(tx, args),
    );
}

/**
 * `regroupMeasuresWrite` inside an edit. With `meter`, every measure of the stretch gets that meter
 * and grouping (null clears them: counts per measure / 4).
 */
export async function regroupMeasuresInTransaction(
    tx: DbTransaction,
    {
        from,
        to,
        starts,
        meter,
    }: {
        from: number;
        to: number;
        starts: readonly number[];
        meter?: { meter: string | null; grouping: string | null };
    },
): Promise<void> {
    await ensureCountsInTransaction({ tx, through: to });
    const ids = await beatIdsInTransaction(tx);
    const ordinalOf = new Map(ids.map((id, i) => [id, i]));
    const all = await tx.select().from(schema.measures);
    const inside = all.filter((m) => {
        const o = ordinalOf.get(m.start_beat);
        return o !== undefined && o >= from && o < to;
    });
    const wanted = new Set(starts.map((s) => ids[s]!));
    const marks = new Map<
        number,
        { mark: string | null; notes: string | null }
    >();
    for (const m of inside)
        if (!wanted.has(m.start_beat) && (m.rehearsal_mark || m.notes)) {
            // the new measure holding this count
            const o = ordinalOf.get(m.start_beat)!;
            const holder = [...starts].reverse().find((s) => s <= o) ?? from;
            marks.set(ids[holder]!, {
                mark: m.rehearsal_mark,
                notes: m.notes,
            });
        }
    const drop = inside.filter((m) => !wanted.has(m.start_beat));
    if (drop.length)
        await deleteMeasuresInTransaction({
            tx,
            itemIds: new Set(drop.map((m) => m.id)),
        });
    const have = new Set(inside.map((m) => m.start_beat));
    const add = starts.map((s) => ids[s]!).filter((id) => !have.has(id));
    if (add.length)
        await createMeasuresInTransaction({
            tx,
            newItems: add.map((id) => ({
                start_beat: id,
                rehearsal_mark: marks.get(id)?.mark ?? null,
                notes: marks.get(id)?.notes ?? null,
            })),
        });
    const keptWithMark = inside.filter(
        (m) => wanted.has(m.start_beat) && marks.has(m.start_beat),
    );
    if (keptWithMark.length)
        await updateMeasuresInTransaction({
            tx,
            modifiedItems: keptWithMark.map((m) => ({
                id: m.id,
                rehearsal_mark:
                    m.rehearsal_mark ?? marks.get(m.start_beat)!.mark,
            })),
        });
    if (meter) {
        const ids2 = new Set(starts.map((s) => ids[s]!));
        const now = (await tx.select().from(schema.measures)).filter((m) =>
            ids2.has(m.start_beat),
        );
        if (now.length)
            await updateMeasuresInTransaction({
                tx,
                modifiedItems: now.map((m) => ({
                    id: m.id,
                    meter: meter.meter,
                    grouping: meter.grouping,
                })),
            });
    }
}

/** Move a rehearsal mark from one measure to another: one undo step */
export async function moveRehearsalMark({
    fromId,
    toId,
    mark,
}: {
    fromId: number;
    toId: number;
    mark: string;
}): Promise<void> {
    await transactionWithHistory(db, "tempoMoveRehearsalMark", async (tx) => {
        await updateMeasuresInTransaction({
            tx,
            modifiedItems: [
                { id: fromId, rehearsal_mark: null },
                { id: toId, rehearsal_mark: mark },
            ],
        });
    });
}

/** Set (or clear, with null) a measure's rehearsal mark */
export async function setRehearsalMark({
    measureId,
    mark,
}: {
    measureId: number;
    mark: string | null;
}): Promise<void> {
    await transactionWithHistory(db, "tempoRehearsalMark", async (tx) => {
        await updateMeasuresInTransaction({
            tx,
            modifiedItems: [{ id: measureId, rehearsal_mark: mark }],
        });
    });
}

/** Read-modify-write the workspace settings (the audio offset) */
export async function patchWorkspaceSettings(
    patch: (s: WorkspaceSettings) => Partial<WorkspaceSettings>,
): Promise<void> {
    const current = await getWorkspaceSettingsParsed({ db });
    await updateWorkspaceSettingsParsed({
        db,
        settings: { ...current, ...patch(current) },
    });
}
