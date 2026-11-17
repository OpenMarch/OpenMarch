/**
 * Tempo mode. The writes tempo mode makes, each one undo step: new count lengths, holds and
 * tempo points (beat flags), counts added or removed (with the drill choice), measure
 * numbers and rehearsal marks. They live in the show, with undo (ADR 0007); time signatures are
 * written by `meterWrites.ts`.
 */
import { setAudioOffsetInTransaction } from "./audioOffset";
import { and, asc, eq, gt, gte, inArray, lt, lte, ne, or } from "drizzle-orm";
import { db, schema } from "@/global/database/db";
import tolgee from "@/global/singletons/Tolgee";
import { transactionWithHistory } from "@/db-functions/history";
import type { DbTransaction } from "@/db-functions/types";
import {
    createBeatsInTransaction,
    deleteBeatsCarryingItemChangesInTransaction,
    updateBeatsInTransaction,
} from "@/db-functions/beat";
import {
    readPageGrid,
    withTimelinePageRipple,
} from "@/db-functions/timelineRipple";
import { FIRST_PAGE_ID, updateLastPageCounts } from "@/db-functions/page";
import { ensureCountsInTransaction } from "@/db-functions/endlessCounts";
import { resizeTimelineInTransaction } from "@/db-functions/timelineResize";
import {
    createMeasuresInTransaction,
    deleteMeasuresInTransaction,
    updateMeasuresInTransaction,
} from "@/db-functions/measures";
import { readMeters, sameMeter, storedMeterOf } from "./meters";

/** Beat flags tempo mode writes, as sets of spec beats; a missing set is left as it is */
export interface TempoMarks {
    holds?: ReadonlySet<number>;
    /** Where tempo changes start: the tempo lane's points */
    changes?: ReadonlySet<number>;
}

/**
 * A measure as tempo mode knows it: a stored one has its id; one past the stored counts (endless)
 * has none yet, only where it starts (a spec beat)
 */
export interface MeasureRef {
    id: number | null;
    start: number;
}

/** Counts in a measure tempo mode shows in a show with no measures stored (4/4 from count 1) */
export const DEFAULT_MEASURE_COUNTS = 4;

/**
 * In a show with no measures stored, store the 4/4 measures tempo mode shows (from count 1, over
 * the stored counts), so a count or measure edit changes what was on screen. Does nothing when
 * any measure is stored.
 */
export async function ensureMeasuresInTransaction(
    tx: DbTransaction,
): Promise<void> {
    const any = await tx
        .select({ id: schema.measures.id })
        .from(schema.measures)
        .limit(1)
        .get();
    if (any) return;
    const ids = await beatIdsInTransaction(tx);
    const newItems = [];
    for (let s = 1; s < ids.length; s += DEFAULT_MEASURE_COUNTS)
        newItems.push({
            start_beat: ids[s]!,
            rehearsal_mark: null,
            notes: null,
        });
    if (newItems.length) await createMeasuresInTransaction({ tx, newItems });
}

/**
 * The stored id of `measure`. One past the stored counts has the counts up to it stored first, in
 * the same edit; they continue the show's last measure, so a measure starts where it was drawn.
 */
async function measureIdInTransaction(
    tx: DbTransaction,
    measure: MeasureRef,
): Promise<number> {
    if (measure.id !== null) return measure.id;
    await ensureCountsInTransaction({ tx, through: measure.start + 1 });
    await ensureMeasuresInTransaction(tx);
    const beatId = (await beatIdsInTransaction(tx))[measure.start];
    const row =
        beatId === undefined
            ? undefined
            : await tx
                  .select({ id: schema.measures.id })
                  .from(schema.measures)
                  .where(eq(schema.measures.start_beat, beatId))
                  .get();
    if (!row)
        throw new Error(
            `no measure starts at count ${measure.start} once stored`,
        );
    return row.id;
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
    holds,
    changes,
    audioOffset,
}: {
    before: readonly number[];
    after: readonly number[];
    /** The held spec beats after the edit, written in the same undo step */
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
    const marks = [...(holds ?? []), ...(changes ?? [])];
    // An edit that changes nothing writes nothing: history refuses an empty step
    if (
        changed.length === 0 &&
        audioOffset === undefined &&
        !(await marksWouldChange({ holds, changes }))
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
        await writeMarksInTransaction(tx, ids, { holds, changes });
        if (audioOffset !== undefined)
            await setAudioOffsetInTransaction(tx, audioOffset);
    });
}

/** Holds and changes, as beat flags: the beats that change get the new value, in one statement each */
export async function writeMarksInTransaction(
    tx: DbTransaction,
    ids: readonly number[],
    { holds, changes }: TempoMarks,
) {
    const write = async (
        column: "tempo_hold" | "tempo_change",
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
    await write("tempo_hold", holds);
    await write("tempo_change", changes);
}

/** Whether writing these flags (spec beats) would change any beat's flags */
async function marksWouldChange({
    holds,
    changes,
}: TempoMarks): Promise<boolean> {
    if (!holds && !changes) return false;
    const rows = await db
        .select({
            id: schema.beats.id,
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
    return differs(holds, (r) => r.hold) || differs(changes, (r) => r.change);
}

/** Hold or tempo-change flags (spec beats) on their own: one undo step */
export async function writeMarks(marks: TempoMarks): Promise<void> {
    if (!(await marksWouldChange(marks))) return;
    await transactionWithHistory(db, "tempoMarks", async (tx) => {
        const last = Math.max(
            0,
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
    measure,
    number,
}: {
    measure: MeasureRef;
    number: number | null;
}): Promise<void> {
    await transactionWithHistory(db, "tempoMeasureNumber", async (tx) => {
        const id = await measureIdInTransaction(tx, measure);
        await updateMeasuresInTransaction({
            tx,
            modifiedItems: [{ id, number_override: number }],
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
    /** Removed counts only: their item Outline changes were carried onward (`afterCountEdit`) */
    removedCounts?: true;
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

/**
 * Whether `keep` must leave a move alone (it then changes length, and counts as couldn't keep):
 *
 * - a Held hold grows out of its end (an arrival): shortening or lengthening the move would carry
 *   the hold's start with it (the upkeep follows a re-timed arrival, #473), so the hold would no
 *   longer start where the count edit left it; a hold moves with its arrival only through the
 *   ripple;
 * - `shrink` (the counts at its end it would give up, after counts were added inside it) hold
 *   another move of its marchers (a keyframe the added counts pushed there), not one under it:
 *   that move would then run past the shortened move and win over its set;
 * - `grow` (the counts after its end it would take back) is not free for every marcher in it:
 *   another move of theirs, at any layer, or a Held hold is there. The move gets its counts back
 *   only "if nothing is in the way there"; growing over the next page's move would leave that
 *   page's set a count after its flag. A move it already runs over (the page's move under a
 *   keyframe) is not in the way, but it may not grow up to that move's end.
 */
async function keepIsBlocked(
    tx: DbTransaction,
    move: { id: number; start_beat: number; end_beat: number },
    {
        grow,
        shrink,
    }: {
        grow?: { from: number; to: number };
        shrink?: { from: number; to: number };
    } = {},
): Promise<boolean> {
    const a = schema.timeline_assignments;
    const t = schema.timeline_transitions;
    const members = [
        ...new Set(
            (
                await tx
                    .select({ marcher: a.marcher_id })
                    .from(a)
                    .innerJoin(t, eq(a.transition_id, t.id))
                    .where(eq(t.timeline_id, move.id))
                    .all()
            ).map((r) => r.marcher),
        ),
    ];
    if (members.length === 0) return false;
    const h = schema.timeline_held_marks;
    const held = await tx
        .select({ id: h.id, start: h.start_beat, end: h.end_beat })
        .from(h)
        .where(inArray(h.marcher_id, members))
        .all();
    if (
        held.some(
            (m) =>
                m.start === move.end_beat ||
                (grow && m.start < grow.to && m.end > grow.from),
        )
    )
        return true;
    if (shrink) {
        const pushedThere = await tx
            .select({ id: a.id })
            .from(a)
            .innerJoin(t, eq(a.transition_id, t.id))
            .where(
                and(
                    inArray(a.marcher_id, members),
                    ne(t.timeline_id, move.id),
                    lt(a.start_beat, shrink.to),
                    // ending where the move would end ties with it, and the higher one wins
                    gte(a.end_beat, shrink.from),
                    // not a move under it (one running over all of it)
                    or(
                        gt(a.start_beat, move.start_beat),
                        lt(a.end_beat, move.end_beat),
                    ),
                ),
            )
            .get();
        if (pushedThere) return true;
    }
    if (!grow) return false;
    const inTheWay = await tx
        .select({ id: a.id })
        .from(a)
        .innerJoin(t, eq(a.transition_id, t.id))
        .where(
            and(
                inArray(a.marcher_id, members),
                ne(t.timeline_id, move.id),
                lt(a.start_beat, grow.to),
                gt(a.end_beat, grow.from),
                // not a move it already runs over
                or(
                    gte(a.start_beat, move.end_beat),
                    lte(a.end_beat, move.start_beat),
                ),
            ),
        )
        .get();
    if (inTheWay) return true;
    // nor up to the end of a move under it: ending together, the higher one wins over its set
    const under = await tx
        .select({ id: a.id })
        .from(a)
        .innerJoin(t, eq(a.transition_id, t.id))
        .where(
            and(
                inArray(a.marcher_id, members),
                ne(t.timeline_id, move.id),
                lte(a.start_beat, move.start_beat),
                gt(a.end_beat, move.start_beat),
                lte(a.end_beat, grow.to),
            ),
        )
        .get();
    return under !== undefined;
}

/** The last page (by the page grid), or undefined when the show has only its first page */
async function lastPageInTransaction(tx: DbTransaction) {
    const last = (await readPageGrid(tx)).pages.at(-1);
    return last && last.id !== FIRST_PAGE_ID ? last : undefined;
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
    measure = false,
}: {
    at: number;
    count: number;
    duration: number;
    drill: DrillChoice;
    /** Lengths to give the counts from `from` on afterwards (keep everything else in place) */
    respaced?: { from: number; lengths: readonly number[] };
    /**
     * Add a measure before measure `at` (`at` starts one): the new counts are a measure of their
     * own, in the time signature of the measure after them, rather than more counts of the
     * measure before
     */
    measure?: boolean;
}): Promise<CountEditResult> {
    return await transactionWithHistory(db, "tempoInsertCounts", async (tx) => {
        await ensureCountsInTransaction({ tx, through: at });
        await ensureMeasuresInTransaction(tx);
        // A count added right after a move's last count lengthens it too (the page before a page
        // boundary takes the count), so with `keep` that move holds as well
        const around = await movesAround(tx, at, { orEnding: true });
        // The last page has no flag after it to move: counts added inside it (or right after it,
        // as at any page boundary) make it longer, so its move stretches like any page's
        const last = await lastPageInTransaction(tx);
        // `at` is a count number (an ordinal); beats are placed by position, which may have gaps
        const before = await tx
            .select({ position: schema.beats.position })
            .from(schema.beats)
            .orderBy(asc(schema.beats.position))
            .limit(1)
            .offset(at - 1)
            .get();
        await withTimelinePageRipple(tx, async () => {
            await createBeatsInTransaction({
                tx,
                newBeats: Array.from({ length: count }, () => ({
                    duration,
                    include_in_measure: true,
                })),
                startingPosition: before?.position ?? at - 1,
            });
            if (last && last.start < at && at <= last.end)
                await updateLastPageCounts({
                    tx,
                    lastPageCounts: last.end - last.start + count,
                });
        });
        if (measure) await addMeasureBeforeInTransaction(tx, at, count);
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
                if (
                    await keepIsBlocked(tx, now, {
                        shrink: {
                            from: now.end_beat - grew,
                            to: now.end_beat,
                        },
                    })
                ) {
                    result.couldNotKeep++;
                    continue;
                }
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
 * After `count` counts were added at `at` before the measure that started there: a measure starts
 * on the first new count. In a show with time signatures written, it gets the one in effect at the
 * measure after it, written only where it changes (ADR 0007), so the measure after keeps reading
 * as before. Does nothing when no measure started at `at`.
 */
async function addMeasureBeforeInTransaction(
    tx: DbTransaction,
    at: number,
    count: number,
): Promise<void> {
    const ids = await beatIdsInTransaction(tx);
    const ordinalOf = new Map(ids.map((id, i) => [id, i]));
    const rows = (await tx.select().from(schema.measures))
        .flatMap((m) => {
            const start = ordinalOf.get(m.start_beat);
            return start === undefined ? [] : [{ ...m, start }];
        })
        .sort((a, b) => a.start - b.start);
    const after = rows.find((m) => m.start === at + count);
    if (!after || ids[at] === undefined) return;
    const written = rows.some((m) => m.meter);
    const inEffect = [...rows]
        .reverse()
        .find((m) => m.start <= after.start && m.meter);
    const [created] = await createMeasuresInTransaction({
        tx,
        newItems: [
            {
                start_beat: ids[at]!,
                rehearsal_mark: null,
                notes: null,
                ...(written && inEffect
                    ? { meter: inEffect.meter, grouping: inEffect.grouping }
                    : {}),
            },
        ],
    });
    if (!written || !created) return;
    await clearRepeatedMeterInTransaction(tx, after.id);
    await clearRepeatedMeterInTransaction(tx, created.id);
}

type MeasureRow = typeof schema.measures.$inferSelect;
type MeasureFacts = Partial<
    Pick<
        MeasureRow,
        "meter" | "grouping" | "number_override" | "rehearsal_mark" | "notes"
    >
>;

/**
 * What the measure left starting on the survivor (`holder`) takes from the measures that go, when
 * counts are removed. `group` is every measure starting on a removed count or the survivor, in
 * order. Facts the holder has itself stay; it takes the time signature written last before the
 * survivor (the one in effect there), and the latest number and the first rehearsal mark and notes
 * of the measures that go.
 */
function carriedFacts(
    holder: MeasureRow,
    group: readonly MeasureRow[],
): MeasureFacts {
    const gone = group.filter((m) => m.id !== holder.id);
    const out: MeasureFacts = {};
    // The holder starts at the survivor, so the time signature in effect there is the last one
    // written in the group (the holder's own, when it is on the survivor already)
    const written = [...group].reverse().find((m) => m.meter);
    if (written && written.id !== holder.id) {
        out.meter = written.meter;
        out.grouping = written.grouping;
    }
    if (holder.number_override === null) {
        const numbered = [...gone]
            .reverse()
            .find((m) => m.number_override !== null);
        if (numbered) out.number_override = numbered.number_override;
    }
    const marked = gone.find((m) => m.rehearsal_mark);
    if (!holder.rehearsal_mark && marked)
        out.rehearsal_mark = marked.rehearsal_mark;
    const noted = gone.find((m) => m.notes);
    if (!holder.notes && noted) out.notes = noted.notes;
    return out;
}

/**
 * A time signature is written only where it changes (ADR 0007): after counts were removed, clear
 * the one on `measureId` when it is the same as the one the measure before carries on.
 */
async function clearRepeatedMeterInTransaction(
    tx: DbTransaction,
    measureId: number,
): Promise<void> {
    const ids = await beatIdsInTransaction(tx);
    const ordinalOf = new Map(ids.map((id, i) => [id, i]));
    const rows = (await tx.select().from(schema.measures))
        .flatMap((m) => {
            const start = ordinalOf.get(m.start_beat);
            return start === undefined ? [] : [{ ...m, start }];
        })
        .sort((a, b) => a.start - b.start);
    const i = rows.findIndex((m) => m.id === measureId);
    if (i < 1 || !rows[i]!.meter) return;
    const meters = readMeters(
        rows.map((m, j) => ({
            ...m,
            counts: (rows[j + 1]?.start ?? ids.length) - m.start,
        })),
    );
    if (sameMeter(meters[i - 1]!.meter, storedMeterOf(rows[i]!)))
        await updateMeasuresInTransaction({
            tx,
            modifiedItems: [{ id: measureId, meter: null, grouping: null }],
        });
}

/**
 * Measures starting on removed counts (`doomed`) move to the survivor, the next count left, or go
 * when one already starts there. Returns the measure starting on the survivor afterwards.
 */
async function moveMeasuresOffInTransaction(
    tx: DbTransaction,
    ids: readonly number[],
    doomed: readonly number[],
    survivor: number,
): Promise<number | undefined> {
    const ordinalOf = new Map(ids.map((id, i) => [id, i]));
    const measures = (
        await tx
            .select()
            .from(schema.measures)
            .where(inArray(schema.measures.start_beat, [...doomed, survivor]))
    ).sort(
        (a, b) => ordinalOf.get(a.start_beat)! - ordinalOf.get(b.start_beat)!,
    );
    const onSurvivor = measures.find((m) => m.start_beat === survivor);
    const moving = measures.filter((m) => m.start_beat !== survivor);
    const keep = onSurvivor ? [] : moving.slice(0, 1);
    const drop = moving.filter((m) => !keep.includes(m));
    // The measure starting on the survivor afterwards takes what was written on the
    // measures that go (as `writeMeasuresInTransaction` does): the time signature in
    // effect at the survivor, the measure number, the rehearsal mark and notes
    const holder = onSurvivor ?? keep[0];
    if (holder) {
        const carry = carriedFacts(holder, measures);
        if (keep.length || Object.keys(carry).length)
            await updateMeasuresInTransaction({
                tx,
                modifiedItems: [
                    { id: holder.id, start_beat: survivor, ...carry },
                ],
            });
    }
    if (drop.length)
        await deleteMeasuresInTransaction({
            tx,
            itemIds: new Set(drop.map((m) => m.id)),
        });
    return holder?.id;
}

/**
 * A move that removing counts would leave ending on the same count as a move it sits inside (one
 * sharing marchers with it): where two moves end together the one on top wins, so the marchers
 * would never stand on the other's set (the page's set, under a keyframe). The removal is refused
 * unless the move ends a count earlier (`endEarly`).
 */
export interface HiddenSet {
    /** The move inside (a keyframe) */
    moveId: number;
    /** The move it sits inside (usually a page's move), whose set it would hide */
    underId: number;
    /** The marchers they share */
    marchers: number[];
    /** Where both would end, as a count number after the removal */
    end: number;
    /** How many counts the move inside would have after the removal */
    counts: number;
}

async function hiddenSetsIn(
    q: DbTransaction,
    from: number,
    to: number,
): Promise<HiddenSet[]> {
    const removed = to - from;
    const mapped = (o: number) => (o <= from ? o : Math.max(from, o - removed));
    const moves = await q
        .select({
            id: schema.timelines.id,
            start: schema.timelines.start_beat,
            end: schema.timelines.end_beat,
        })
        .from(schema.timelines)
        .where(
            and(
                gte(schema.timelines.end_beat, from),
                lte(schema.timelines.start_beat, to),
            ),
        )
        .all();
    if (moves.length < 2) return [];
    const a = schema.timeline_assignments;
    const t = schema.timeline_transitions;
    const marchersOf = new Map<number, Set<number>>();
    for (const r of await q
        .select({ move: t.timeline_id, marcher: a.marcher_id })
        .from(a)
        .innerJoin(t, eq(a.transition_id, t.id))
        .where(
            inArray(
                t.timeline_id,
                moves.map((m) => m.id),
            ),
        )
        .all()) {
        const set = marchersOf.get(r.move) ?? new Set<number>();
        set.add(r.marcher);
        marchersOf.set(r.move, set);
    }
    const out: HiddenSet[] = [];
    for (const inner of moves) {
        if (inner.end < from || inner.end > to) continue;
        const mine = marchersOf.get(inner.id);
        if (!mine) continue;
        for (const outer of moves) {
            if (outer.id === inner.id) continue;
            if (!(outer.start <= inner.start && inner.end < outer.end))
                continue;
            if (mapped(inner.end) !== mapped(outer.end)) continue;
            const shared = [...(marchersOf.get(outer.id) ?? [])].filter((m) =>
                mine.has(m),
            );
            if (!shared.length) continue;
            out.push({
                moveId: inner.id,
                underId: outer.id,
                marchers: shared.sort((x, y) => x - y),
                end: mapped(inner.end),
                counts: mapped(inner.end) - mapped(inner.start),
            });
        }
    }
    return out;
}

/** The sets removing counts `from`..`to - 1` would hide (see {@link HiddenSet}), for the box */
export async function readHiddenSets({
    from,
    to,
}: {
    from: number;
    to: number;
}): Promise<HiddenSet[]> {
    // a plain read, outside any edit: the connection reads like a transaction does
    return await hiddenSetsIn(db as unknown as DbTransaction, from, to);
}

/** Refused: removing the counts would hide a set (the box offers the ways out) */
export class HiddenSetError extends Error {
    constructor(readonly hidden: HiddenSet[]) {
        super(tolgee.t("tempoMode.errors.wouldHideSet"));
    }
}

/** Each move that the removal left ending with the move it sits inside ends a count earlier */
async function endHiddenMovesEarlyInTransaction(
    tx: DbTransaction,
    hidden: readonly HiddenSet[],
): Promise<void> {
    for (const h of hidden) {
        const [inner, outer] = await Promise.all(
            [h.moveId, h.underId].map((id) =>
                tx
                    .select()
                    .from(schema.timelines)
                    .where(eq(schema.timelines.id, id))
                    .get(),
            ),
        );
        if (!inner || !outer || inner.end_beat !== outer.end_beat) continue;
        await resizeTimelineInTransaction({
            tx,
            timelineId: inner.id,
            start: inner.start_beat,
            end: inner.end_beat - 1,
        });
    }
}

/**
 * What the removed counts (`doomed`) hand on to the next count left (`survivor`), as measures
 * and pages do: a tempo point (the change now starts there) and their notes, written before
 * its own in playing order. A hold goes with its count: it was that count's length.
 */
async function carryCountFactsInTransaction(
    tx: DbTransaction,
    doomed: readonly number[],
    survivor: number,
): Promise<void> {
    const b = schema.beats;
    const gone = await tx
        .select({ id: b.id, notes: b.notes, change: b.tempo_change })
        .from(b)
        .where(inArray(b.id, [...doomed]))
        .all();
    const order = new Map(doomed.map((id, i) => [id, i]));
    gone.sort((x, y) => order.get(x.id)! - order.get(y.id)!);
    const left = await tx
        .select({ notes: b.notes, change: b.tempo_change })
        .from(b)
        .where(eq(b.id, survivor))
        .get();
    if (!left) return;
    const notes = [...gone.map((g) => g.notes), left.notes]
        .map((x) => x?.trim())
        .filter((x): x is string => !!x);
    const change = !!left.change || gone.some((g) => g.change);
    const update: { notes?: string; tempo_change?: number } = {};
    if (notes.length && notes.join("\n") !== (left.notes ?? ""))
        update.notes = notes.join("\n");
    if (change && !left.change) update.tempo_change = 1;
    if (Object.keys(update).length)
        await tx.update(b).set(update).where(eq(b.id, survivor)).run();
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
    endEarly = false,
}: {
    from: number;
    to: number;
    drill: DrillChoice;
    respaced?: { from: number; lengths: readonly number[] };
    /**
     * A move the removal would leave ending with the move it sits inside ends a count earlier
     * instead, so the set under it still shows. Without it such a removal is refused
     * ({@link HiddenSetError}), writing nothing.
     */
    endEarly?: boolean;
}): Promise<CountEditResult> {
    return await transactionWithHistory(db, "tempoDeleteCounts", async (tx) => {
        await ensureCountsInTransaction({ tx, through: to + 1 });
        await ensureMeasuresInTransaction(tx);
        const hidden = await hiddenSetsIn(tx, from, to);
        if (hidden.length && (!endEarly || hidden.some((h) => h.counts < 2)))
            throw new HiddenSetError(hidden);
        const ids = await beatIdsInTransaction(tx);
        const doomed = ids.slice(Math.max(1, from), to);
        const survivor = ids[to];
        if (doomed.length === 0 || survivor === undefined)
            throw new Error(tolgee.t("tempoMode.errors.cantRemoveLastCount"));
        // Every move that loses counts, its first count included (as the dialog lists them)
        const around = new Map<number, typeof schema.timelines.$inferSelect>();
        for (const m of await tx
            .select()
            .from(schema.timelines)
            .where(
                and(
                    lt(schema.timelines.start_beat, to),
                    gt(schema.timelines.end_beat, from),
                ),
            ))
            around.set(m.id, m);
        let holderId: number | undefined;
        await carryCountFactsInTransaction(tx, doomed, survivor);
        // The last page gets shorter by the counts removed from it (see insertCounts)
        const last = await lastPageInTransaction(tx);
        const removed = to - from;
        const mapped = (o: number) =>
            o <= from ? o : Math.max(from, o - removed);
        const lastLength = last
            ? mapped(last.end) - mapped(last.start)
            : undefined;
        if (last && lastLength! < 1)
            throw new Error(tolgee.t("tempoMode.errors.wouldRemovePage"));
        await withTimelinePageRipple(tx, async () => {
            // Measures and pages on the removed counts move to the next count left
            holderId = await moveMeasuresOffInTransaction(
                tx,
                ids,
                doomed,
                survivor,
            );
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
            await deleteBeatsCarryingItemChangesInTransaction({
                tx,
                beatIds: new Set(doomed),
            });
            if (last && lastLength !== last.end - last.start)
                await updateLastPageCounts({ tx, lastPageCounts: lastLength! });
        });
        if (holderId !== undefined)
            await clearRepeatedMeterInTransaction(tx, holderId);
        await writeLengthsInTransaction(tx, respaced);
        const result: CountEditResult = {
            kept: 0,
            couldNotKeep: 0,
            removedCounts: true,
        };
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
                if (
                    await keepIsBlocked(tx, now, {
                        grow: { from: now.end_beat, to: now.end_beat + lost },
                    })
                ) {
                    result.couldNotKeep++;
                    continue;
                }
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
        await endHiddenMovesEarlyInTransaction(tx, hidden);
        return result;
    });
}

/** Move a rehearsal mark from one measure to another: one undo step */
export async function moveRehearsalMark({
    fromId,
    to,
    mark,
}: {
    fromId: number;
    to: MeasureRef;
    mark: string;
}): Promise<void> {
    await transactionWithHistory(db, "tempoMoveRehearsalMark", async (tx) => {
        const toId = await measureIdInTransaction(tx, to);
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
    measure,
    mark,
}: {
    measure: MeasureRef;
    mark: string | null;
}): Promise<void> {
    await transactionWithHistory(db, "tempoRehearsalMark", async (tx) => {
        const id = await measureIdInTransaction(tx, measure);
        await updateMeasuresInTransaction({
            tx,
            modifiedItems: [{ id, rehearsal_mark: mark }],
        });
    });
}
