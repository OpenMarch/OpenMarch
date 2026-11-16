/**
 * Performer cues in the show file (ADR 0015 D-9; the write rules are ADR 0004's).
 *
 * A cue sets one parameter of its performers from a beat on. Storage keeps only what a file can
 * always keep: `type` and `value` are text checked by the compile step in `@openmarch/core`,
 * which ignores a type it doesn't know and flags a value it doesn't know. So a cue a newer build
 * wrote is read, kept and written back untouched. `DatabaseCue` has the shape compile reads
 * (`CueInput`): camelCase, its performers inlined.
 */
import { and, asc, eq, inArray, notExists, sql } from "drizzle-orm";
import type { CueInput } from "@openmarch/core";
import { schema } from "@/global/database/db";
import { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { nearestSurvivingBeatByTime } from "./itemBeatRemap";

export interface DatabaseCue {
    id: number;
    /** A cue type (`CueType` in `@openmarch/core`), or one a newer build wrote. */
    type: string;
    beatId: number;
    /** A value of the type: a built-in id (`builtin:...`) or one the show adds. */
    value: string;
    settings: Record<string, unknown>;
    /** Null for a lasting cue; a momentary cue's length in counts, at least 1. */
    length: number | null;
    /** Counts the change takes, at least 1; null is the value's default. */
    transition: number | null;
    /** The performers it applies to, in marcher id order. */
    marcherIds: number[];
    /** Display only: how the performers were picked, such as "Trumpets". */
    label: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface NewCueArgs {
    type: string;
    beatId: number;
    value: string;
    /** At least one marcher. */
    marcherIds: readonly number[];
    settings?: Record<string, unknown>;
    length?: number | null;
    transition?: number | null;
    label?: string | null;
    notes?: string | null;
}

/** Fields left out are kept. New `marcherIds` replace the cue's performers. */
export interface ModifiedCueArgs {
    id: number;
    type?: string;
    beatId?: number;
    value?: string;
    marcherIds?: readonly number[];
    settings?: Record<string, unknown>;
    length?: number | null;
    transition?: number | null;
    label?: string | null;
    notes?: string | null;
}

// A stored cue is what compile reads.
const _isCueInput = (cue: DatabaseCue): CueInput => cue;
void _isCueInput;

type RealDatabaseCue = typeof schema.cues.$inferSelect;
type RealNewCue = typeof schema.cues.$inferInsert;

/** Stored settings as an object; anything else a file holds reads as no settings. */
const parseSettings = (json: string): Record<string, unknown> => {
    try {
        const parsed: unknown = JSON.parse(json);
        return parsed !== null &&
            typeof parsed === "object" &&
            !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : {};
    } catch {
        return {};
    }
};

const serializeSettings = (settings: Record<string, unknown> | undefined) => {
    if (settings === undefined) return "{}";
    if (
        settings === null ||
        typeof settings !== "object" ||
        Array.isArray(settings)
    )
        throw new Error("Cue settings must be an object");
    return JSON.stringify(settings);
};

export const realDatabaseCueToDatabaseCue = (
    row: RealDatabaseCue,
    performers: ReadonlyMap<number, number[]> = new Map(),
): DatabaseCue => ({
    id: row.id,
    type: row.type,
    beatId: row.beat_id,
    value: row.value,
    settings: parseSettings(row.settings_json),
    length: row.length,
    transition: row.transition,
    marcherIds: performers.get(row.id) ?? [],
    label: row.label,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const newCueArgsToRealNewCue = (args: NewCueArgs): RealNewCue => ({
    type: args.type,
    beat_id: args.beatId,
    value: args.value,
    settings_json: serializeSettings(args.settings),
    length: args.length ?? null,
    transition: args.transition ?? null,
    label: args.label ?? null,
    notes: args.notes ?? null,
});

const assertHasPerformers = (marcherIds: readonly number[]) => {
    if (new Set(marcherIds).size === 0)
        throw new Error("A cue needs at least one marcher");
};

/** Each cue's performers, in marcher id order. */
const performersByCue = async (
    db: DbConnection | DbTransaction,
    cueIds?: readonly number[],
): Promise<Map<number, number[]>> => {
    const rows = await db
        .select({
            cue_id: schema.cue_marchers.cue_id,
            marcher_id: schema.cue_marchers.marcher_id,
        })
        .from(schema.cue_marchers)
        .where(
            cueIds
                ? inArray(schema.cue_marchers.cue_id, [...cueIds])
                : undefined,
        )
        .orderBy(
            asc(schema.cue_marchers.cue_id),
            asc(schema.cue_marchers.marcher_id),
        )
        .all();
    const performers = new Map<number, number[]>();
    for (const { cue_id, marcher_id } of rows) {
        const list = performers.get(cue_id);
        if (list) list.push(marcher_id);
        else performers.set(cue_id, [marcher_id]);
    }
    return performers;
};

/** Every cue, in id order (newest last), with its performers. */
export async function getCues({
    db,
}: {
    db: DbConnection | DbTransaction;
}): Promise<DatabaseCue[]> {
    const rows = await db
        .select()
        .from(schema.cues)
        .orderBy(asc(schema.cues.id))
        .all();
    const performers = await performersByCue(db);
    return rows.map((row) => realDatabaseCueToDatabaseCue(row, performers));
}

/** One cue with its performers, or undefined. */
export async function getCueById({
    db,
    id,
}: {
    db: DbConnection | DbTransaction;
    id: number;
}): Promise<DatabaseCue | undefined> {
    const row = await db
        .select()
        .from(schema.cues)
        .where(eq(schema.cues.id, id))
        .get();
    if (!row) return undefined;
    return realDatabaseCueToDatabaseCue(row, await performersByCue(db, [id]));
}

const insertPerformersInTransaction = async (
    tx: DbTransaction,
    cueId: number,
    marcherIds: Iterable<number>,
) => {
    const values = [...new Set(marcherIds)].map((marcher_id) => ({
        cue_id: cueId,
        marcher_id,
    }));
    if (values.length > 0)
        await tx.insert(schema.cue_marchers).values(values).run();
};

/** Creates cues with their performers. Throws if a cue names no marcher. */
export const createCuesInTransaction = async ({
    tx,
    newCues,
}: {
    tx: DbTransaction;
    newCues: readonly NewCueArgs[];
}): Promise<DatabaseCue[]> => {
    const created: DatabaseCue[] = [];
    for (const args of newCues) {
        assertHasPerformers(args.marcherIds);
        const row = await tx
            .insert(schema.cues)
            .values(newCueArgsToRealNewCue(args))
            .returning()
            .get();
        await insertPerformersInTransaction(tx, row.id, args.marcherIds);
        created.push(
            realDatabaseCueToDatabaseCue(
                row,
                await performersByCue(tx, [row.id]),
            ),
        );
    }
    return created;
};

/**
 * Updates cues. New `marcherIds` replace the performers: the ones removed are deleted and the
 * new ones inserted, so performers that stay keep their rows. Throws if that leaves a cue none.
 */
export const updateCuesInTransaction = async ({
    tx,
    modifiedCues,
}: {
    tx: DbTransaction;
    modifiedCues: readonly ModifiedCueArgs[];
}): Promise<DatabaseCue[]> => {
    const updated: DatabaseCue[] = [];
    for (const { id, marcherIds, ...args } of modifiedCues) {
        const set: Partial<RealNewCue> = {};
        if (args.type !== undefined) set.type = args.type;
        if (args.beatId !== undefined) set.beat_id = args.beatId;
        if (args.value !== undefined) set.value = args.value;
        if (args.settings !== undefined)
            set.settings_json = serializeSettings(args.settings);
        if (args.length !== undefined) set.length = args.length;
        if (args.transition !== undefined) set.transition = args.transition;
        if (args.label !== undefined) set.label = args.label;
        if (args.notes !== undefined) set.notes = args.notes;
        if (marcherIds !== undefined) assertHasPerformers(marcherIds);

        const row =
            Object.keys(set).length > 0
                ? await tx
                      .update(schema.cues)
                      .set(set)
                      .where(eq(schema.cues.id, id))
                      .returning()
                      .get()
                : await tx
                      .select()
                      .from(schema.cues)
                      .where(eq(schema.cues.id, id))
                      .get();
        if (!row) throw new Error(`Cue ${id} not found`);

        if (marcherIds !== undefined) {
            const wanted = new Set(marcherIds);
            const current = (await performersByCue(tx, [id])).get(id) ?? [];
            await removePerformersInTransaction(
                tx,
                id,
                current.filter((m) => !wanted.has(m)),
            );
            const kept = new Set(current);
            await insertPerformersInTransaction(
                tx,
                id,
                [...wanted].filter((m) => !kept.has(m)),
            );
        }
        updated.push(
            realDatabaseCueToDatabaseCue(row, await performersByCue(tx, [id])),
        );
    }
    return updated;
};

const removePerformersInTransaction = async (
    tx: DbTransaction,
    cueId: number,
    marcherIds: readonly number[],
) => {
    if (marcherIds.length === 0) return;
    await tx
        .delete(schema.cue_marchers)
        .where(
            and(
                eq(schema.cue_marchers.cue_id, cueId),
                inArray(schema.cue_marchers.marcher_id, [...marcherIds]),
            ),
        )
        .run();
};

/** Deletes cues; their performers go with them (ON DELETE CASCADE). */
export const deleteCuesInTransaction = async ({
    tx,
    cueIds,
}: {
    tx: DbTransaction;
    cueIds: ReadonlySet<number>;
}): Promise<DatabaseCue[]> => {
    if (cueIds.size === 0) return [];
    const ids = [...cueIds];
    const performers = await performersByCue(tx, ids);
    const deleted = await tx
        .delete(schema.cues)
        .where(inArray(schema.cues.id, ids))
        .returning();
    return deleted.map((row) => realDatabaseCueToDatabaseCue(row, performers));
};

/** Whether the file has the cue tables. A page-era file gets them only when it converts. */
const hasCueTables = async (tx: DbConnection | DbTransaction) => {
    const found = await tx
        .select({ n: sql<number>`count(*)` })
        .from(sql`sqlite_schema`)
        .where(sql`type = 'table' AND name = 'cues'`)
        .get();
    return !!found?.n;
};

/**
 * The cues that name any of `marcherIds`. The marcher deletion write path reads them before the
 * marchers go, for {@link deleteCuesLeftEmptyInTransaction}.
 */
export const cueIdsOfMarchersInTransaction = async ({
    tx,
    marcherIds,
}: {
    tx: DbTransaction;
    marcherIds: ReadonlySet<number>;
}): Promise<Set<number>> => {
    if (marcherIds.size === 0 || !(await hasCueTables(tx))) return new Set();
    const rows = await tx
        .selectDistinct({ cue_id: schema.cue_marchers.cue_id })
        .from(schema.cue_marchers)
        .where(inArray(schema.cue_marchers.marcher_id, [...marcherIds]))
        .all();
    return new Set(rows.map((row) => row.cue_id));
};

/**
 * Of `cueIds`, deletes the cues left with no performers (ADR 0004 D-2, per ADR 0015 D-9: every
 * cue has its performers). The marcher deletion write path calls it in the same transaction,
 * after the performers went with their marchers. Only the cues it is given: a cue it wasn't told
 * lost a performer is left alone.
 */
export const deleteCuesLeftEmptyInTransaction = async ({
    tx,
    cueIds,
}: {
    tx: DbTransaction;
    cueIds: ReadonlySet<number>;
}): Promise<number[]> => {
    if (cueIds.size === 0) return [];
    const deleted = await tx
        .delete(schema.cues)
        .where(
            and(
                inArray(schema.cues.id, [...cueIds]),
                notExists(
                    tx
                        .select({ one: sql`1` })
                        .from(schema.cue_marchers)
                        .where(eq(schema.cue_marchers.cue_id, schema.cues.id)),
                ),
            ),
        )
        .returning({ id: schema.cues.id });
    return deleted.map(({ id }) => id);
};

/* ==================== Cues when beats go ==================== */

/** A cue moved off beats about to be deleted, onto a surviving beat. */
export interface CarriedCue {
    cueId: number;
    fromBeatId: number;
    toBeatId: number;
    /** The performers it lost on the way: a later cue of theirs, or one already there, wins. */
    removedMarcherIds: number[];
}

/** What happened to the cues on beats about to be deleted. */
export interface CueCarryResult {
    moved: CarriedCue[];
    /** Cues deleted: no performer kept them, or there was no beat to go to. */
    dropped: number[];
}

const NOTHING_CARRIED: CueCarryResult = { moved: [], dropped: [] };

/** What the carry reads of a cue. */
export interface CarryCue {
    id: number;
    type: string;
    beatId: number;
    /** Null for a lasting cue. Lasting and momentary cues never beat each other. */
    length: number | null;
    marcherIds: readonly number[];
}

/**
 * Where every cue on `beatIds` goes (ADR 0004 amendment of 2026-10-15, per cue type and
 * performer as ADR 0015 D-9 has it). `target` gives a cue's surviving beat and its place in time
 * among the cues landing there, or null when there is no beat to go to.
 *
 * - **Keep the last one.** For each performer, of their cues of one type landing on one beat,
 *   only the last in time (then the newest) keeps them: the value in effect at the end of the
 *   deleted span. Lasting and momentary cues are kept apart, since a momentary cue never changes
 *   the lasting value.
 * - **An existing cue wins.** If the performer already has a cue of that type and kind on the
 *   beat, that cue stays and the moved one loses them.
 * - A cue that keeps any performer moves to the beat, with its length, transition and settings
 *   unchanged; a cue that keeps none is dropped.
 * - With no beat to go to (the end of the show), the cue is dropped.
 */
export function planCueCarry(
    cues: readonly CarryCue[],
    beatIds: ReadonlySet<number>,
    target: (cue: CarryCue) => { to: number; at: number } | null,
): CueCarryResult {
    const slot = (cue: CarryCue, marcherId: number, beatId: number) =>
        `${cue.type}|${cue.length === null ? "lasting" : "momentary"}|${marcherId}|${beatId}`;
    // What each performer already has on the surviving beats
    const taken = new Set<string>();
    for (const cue of cues)
        if (!beatIds.has(cue.beatId))
            for (const m of cue.marcherIds) taken.add(slot(cue, m, cue.beatId));

    // Per performer, type, kind and landing beat: the last cue in time, then the newest
    const targets = new Map<number, { to: number; at: number }>();
    const winners = new Map<string, { cue: CarryCue; at: number }>();
    for (const cue of cues) {
        if (!beatIds.has(cue.beatId)) continue;
        const t = target(cue);
        if (!t) continue;
        targets.set(cue.id, t);
        for (const m of new Set(cue.marcherIds)) {
            const key = slot(cue, m, t.to);
            if (taken.has(key)) continue;
            const current = winners.get(key);
            if (
                !current ||
                t.at > current.at ||
                (t.at === current.at && cue.id > current.cue.id)
            )
                winners.set(key, { cue, at: t.at });
        }
    }

    const result: CueCarryResult = { moved: [], dropped: [] };
    for (const cue of cues) {
        if (!beatIds.has(cue.beatId)) continue;
        const t = targets.get(cue.id);
        const removed = t
            ? [...new Set(cue.marcherIds)].filter(
                  (m) => winners.get(slot(cue, m, t.to))?.cue !== cue,
              )
            : [];
        // A cue that lost every performer goes; one stored with none (not one of ours) moves
        const performers = new Set(cue.marcherIds).size;
        if (!t || (performers > 0 && removed.length === performers)) {
            result.dropped.push(cue.id);
            continue;
        }
        result.moved.push({
            cueId: cue.id,
            fromBeatId: cue.beatId,
            toBeatId: t.to,
            removedMarcherIds: removed.sort((a, b) => a - b),
        });
    }
    result.dropped.sort((a, b) => a - b);
    return result;
}

/** Every cue as the carry reads it, when any sits on `beatIds`; else null. */
const cuesToCarry = async (
    tx: DbTransaction,
    beatIds: ReadonlySet<number>,
): Promise<CarryCue[] | null> => {
    if (beatIds.size === 0 || !(await hasCueTables(tx))) return null;
    const onDeleted = await tx
        .select({ id: schema.cues.id })
        .from(schema.cues)
        .where(inArray(schema.cues.beat_id, [...beatIds]))
        .limit(1)
        .all();
    if (onDeleted.length === 0) return null;
    const rows = await tx
        .select({
            id: schema.cues.id,
            type: schema.cues.type,
            beat_id: schema.cues.beat_id,
            length: schema.cues.length,
        })
        .from(schema.cues)
        .all();
    const performers = await performersByCue(tx);
    return rows.map((row) => ({
        id: row.id,
        type: row.type,
        beatId: row.beat_id,
        length: row.length,
        marcherIds: performers.get(row.id) ?? [],
    }));
};

/** Writes a carry: the moved cues to their beats without the performers they lost, the rest gone. */
const applyCueCarry = async (tx: DbTransaction, result: CueCarryResult) => {
    for (const carried of result.moved) {
        await removePerformersInTransaction(
            tx,
            carried.cueId,
            carried.removedMarcherIds,
        );
        await tx
            .update(schema.cues)
            .set({ beat_id: carried.toBeatId })
            .where(eq(schema.cues.id, carried.cueId))
            .run();
    }
    if (result.dropped.length > 0)
        await tx
            .delete(schema.cues)
            .where(inArray(schema.cues.id, result.dropped))
            .run();
};

/**
 * Before deleting `beatIds`: each beat's order, and each deleted beat's next surviving beat (null
 * at the end of the show).
 */
const beatsAfterDeletion = async (
    tx: DbTransaction,
    beatIds: ReadonlySet<number>,
) => {
    const beats = await tx
        .select({ id: schema.beats.id })
        .from(schema.beats)
        .orderBy(asc(schema.beats.position), asc(schema.beats.id))
        .all();
    const order = new Map<number, number>();
    const nextBeat = new Map<number, number | null>();
    let run: number[] = [];
    beats.forEach(({ id }, i) => {
        order.set(id, i);
        if (beatIds.has(id)) {
            run.push(id);
            return;
        }
        for (const deleted of run) nextBeat.set(deleted, id);
        run = [];
    });
    for (const deleted of run) nextBeat.set(deleted, null);
    return { order, nextBeat };
};

/**
 * Carries the cues on beats about to be deleted forward to the first surviving beat after them
 * ({@link planCueCarry}). Call it in the deletion's transaction, before the beats go, so one
 * undo restores both. `cues.beat_id`'s cascade is the backstop: it finds nothing left.
 */
export const carryCuesPastDeletedBeatsInTransaction = async ({
    tx,
    beatIds,
}: {
    tx: DbTransaction;
    beatIds: ReadonlySet<number>;
}): Promise<CueCarryResult> => {
    const cues = await cuesToCarry(tx, beatIds);
    if (!cues) return NOTHING_CARRIED;
    const { order, nextBeat } = await beatsAfterDeletion(tx, beatIds);
    const result = planCueCarry(cues, beatIds, (cue) => {
        const to = nextBeat.get(cue.beatId) ?? null;
        return to === null ? null : { to, at: order.get(cue.beatId)! };
    });
    await applyCueCarry(tx, result);
    return result;
};

/**
 * Moves the cues on `beatIds` to the surviving beat nearest each one's time, before a caller
 * deletes those beats as part of replacing them all (a tempo edit in the audio editor, a MusicXML
 * import). Call it after the new beats exist and in the same transaction as the deletion. Cues
 * landing together follow {@link planCueCarry}, as when beats are deleted.
 */
export const remapCuesOntoReplacementBeatsInTransaction = async ({
    tx,
    beatIds,
}: {
    tx: DbTransaction;
    beatIds: ReadonlySet<number>;
}): Promise<CueCarryResult> => {
    const cues = await cuesToCarry(tx, beatIds);
    if (!cues) return NOTHING_CARRIED;
    const nearest = nearestSurvivingBeatByTime(
        await tx
            .select({
                id: schema.beats.id,
                position: schema.beats.position,
                duration: schema.beats.duration,
            })
            .from(schema.beats)
            .orderBy(asc(schema.beats.position))
            .all(),
        beatIds,
    );
    const result = planCueCarry(
        cues,
        beatIds,
        (cue) => nearest.get(cue.beatId) ?? null,
    );
    await applyCueCarry(tx, result);
    return result;
};

/* ==================== Undoable edits ==================== */

/** Creates cues as one undoable edit. */
export async function createCues({
    db,
    newCues,
}: {
    db: DbConnection;
    newCues: readonly NewCueArgs[];
}): Promise<DatabaseCue[]> {
    if (newCues.length === 0) return [];
    return await transactionWithHistory(
        db,
        "createCues",
        async (tx) => await createCuesInTransaction({ tx, newCues }),
    );
}

/** Updates cues as one undoable edit. */
export async function updateCues({
    db,
    modifiedCues,
}: {
    db: DbConnection;
    modifiedCues: readonly ModifiedCueArgs[];
}): Promise<DatabaseCue[]> {
    if (modifiedCues.length === 0) return [];
    return await transactionWithHistory(
        db,
        "updateCues",
        async (tx) => await updateCuesInTransaction({ tx, modifiedCues }),
    );
}

/** Deletes cues as one undoable edit. */
export async function deleteCues({
    db,
    cueIds,
}: {
    db: DbConnection;
    cueIds: ReadonlySet<number>;
}): Promise<DatabaseCue[]> {
    if (cueIds.size === 0) return [];
    return await transactionWithHistory(
        db,
        "deleteCues",
        async (tx) => await deleteCuesInTransaction({ tx, cueIds }),
    );
}
