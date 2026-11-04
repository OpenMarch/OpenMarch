/**
 * Keeping item changes when beats go: deleting beats (the carry, ADR 0004 amendment of
 * 2026-10-15) and replacing every beat (a tempo edit in the audio editor, a MusicXML import).
 * The item tables' `beat_id ON DELETE CASCADE` would otherwise take the changes with their beats:
 * a prop made after beat 0 would lose its only Outline and stay Off field for good. Both run in
 * the deletion's transaction, so one undo restores everything.
 *
 * Extension point: every item table keyed by beat belongs in {@link BEAT_KEYED_ITEM_TABLES},
 * with its own uniqueness `key`; tables a file doesn't have yet are skipped by name.
 */
import { asc, eq, sql } from "drizzle-orm";
import { schema } from "@/global/database/db";
import type { DbConnection, DbTransaction } from "./types";
import { FIRST_BEAT_ID } from "./beat";

/** One change in a beat-keyed item table. */
interface BeatKeyedRow {
    id: number;
    beatId: number;
    /** What a beat holds at most one change per, besides the beat: the item for Outline changes */
    key: string;
}

/** A change moved onto a surviving beat; `at` orders it in time against others landing there. */
interface LandedRow {
    id: number;
    to: number;
    at: number;
}

interface BeatKeyedItemTableEntry {
    /** The SQLite table name, to skip files that don't have the table yet */
    name: string;
    rows: (tx: DbTransaction) => Promise<BeatKeyedRow[]>;
    move: (tx: DbTransaction, id: number, beatId: number) => Promise<void>;
    /**
     * Outline changes: an item never loses its last one. With no beat after a deleted run, its
     * last change there goes back to the last surviving beat before it.
     */
    keepsOne?: boolean;
}

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

/** The item tables whose changes are carried past deleted beats and re-mapped onto new ones. */
export const BEAT_KEYED_ITEM_TABLES: readonly BeatKeyedItemTableEntry[] = [
    {
        name: "item_geometry",
        rows: async (tx) =>
            (
                await tx
                    .select({
                        id: schema.item_geometry.id,
                        item_id: schema.item_geometry.item_id,
                        beat_id: schema.item_geometry.beat_id,
                    })
                    .from(schema.item_geometry)
                    .all()
            ).map((r) => ({
                id: r.id,
                beatId: r.beat_id,
                key: String(r.item_id),
            })),
        move: async (tx, id, beatId) => {
            await tx
                .update(schema.item_geometry)
                .set({ beat_id: beatId })
                .where(eq(schema.item_geometry.id, id))
                .run();
        },
        keepsOne: true,
    },
];

/** Whether the file has table `name`: item tables come with timeline-only migrations. */
const hasTable = async (db: DbConnection | DbTransaction, name: string) =>
    !!(
        await db
            .select({ n: sql<number>`count(*)` })
            .from(sql`sqlite_schema`)
            .where(sql`type = 'table' AND name = ${name}`)
            .get()
    )?.n;

/**
 * Of the changes about to land, the latest in time per key and destination; the rest go with
 * their beats, as does one whose key already has a change on its destination (that one wins).
 */
const keptLandings = (
    rows: readonly BeatKeyedRow[],
    beatIds: ReadonlySet<number>,
    target: (row: BeatKeyedRow) => { to: number; at: number } | null,
): LandedRow[] => {
    const taken = new Set(
        rows
            .filter((row) => !beatIds.has(row.beatId))
            .map((row) => `${row.key}|${row.beatId}`),
    );
    const kept = new Map<string, LandedRow>();
    for (const row of rows) {
        if (!beatIds.has(row.beatId)) continue;
        const t = target(row);
        if (!t) continue;
        const slot = `${row.key}|${t.to}`;
        if (taken.has(slot)) continue;
        const current = kept.get(slot);
        if (!current || t.at > current.at) kept.set(slot, { id: row.id, ...t });
    }
    return [...kept.values()];
};

const land = async (
    tx: DbTransaction,
    entry: BeatKeyedItemTableEntry,
    landed: readonly LandedRow[],
) => {
    for (const { id, to } of landed) await entry.move(tx, id, to);
};

/**
 * Carries the item changes on beats about to be deleted forward. Call it in the deletion's transaction, before the beats go, so one
 * undo restores both. Per item (and key) and table, of the changes on a run of deleted beats only
 * the last is kept: it moves to the first surviving beat after the run, unless the item already
 * has a change there, which wins. With no beat after the run, the changes go with their beats,
 * unless that would leave an item no Outline at all: then its last Outline change moves to the
 * last surviving beat before the run. Without this, deleting the count a prop was made on would
 * leave it Off field for good.
 */
export async function carryItemChangesPastDeletedBeatsInTransaction({
    tx,
    beatIds,
}: {
    tx: DbTransaction;
    beatIds: ReadonlySet<number>;
}): Promise<void> {
    if (beatIds.size === 0) return;
    let after: Awaited<ReturnType<typeof beatsAfterDeletion>> | null = null;
    for (const entry of BEAT_KEYED_ITEM_TABLES) {
        if (!(await hasTable(tx, entry.name))) continue;
        const rows = await entry.rows(tx);
        if (!rows.some((row) => beatIds.has(row.beatId))) continue;
        after ??= await beatsAfterDeletion(tx, beatIds);
        const { order, nextBeat } = after;
        const keepsAChange = new Set(
            rows.filter((row) => !beatIds.has(row.beatId)).map((r) => r.key),
        );
        const survivorsInOrder = [...order.entries()]
            .filter(([id]) => !beatIds.has(id))
            .sort((a, b) => a[1] - b[1]);
        const lastSurvivorBefore = (at: number) =>
            entry.keepsOne
                ? (survivorsInOrder.findLast(([, i]) => i < at)?.[0] ?? null)
                : null;
        const landed = keptLandings(rows, beatIds, (row) => {
            const at = order.get(row.beatId)!;
            const to =
                nextBeat.get(row.beatId) ??
                (keepsAChange.has(row.key) ? null : lastSurvivorBefore(at));
            return to === null ? null : { to, at };
        });
        await land(tx, entry, landed);
    }
}

/**
 * For each beat about to be deleted, the surviving beat nearest it in time. Old and new times
 * are each counted from beat 0, along the deleted beats (the old timeline) and along the
 * survivors (the new one). Of new beats at the same time the last wins, so a change on the first
 * counted beat stays off beat 0; between two equally near beats the earlier wins. A change past
 * the new timeline's end goes to its last beat. `at` is the old time, to keep the latest of
 * several changes landing together.
 */
export const nearestSurvivingBeatByTime = (
    beats: readonly { id: number; position: number; duration: number }[],
    beatIds: ReadonlySet<number>,
): Map<number, { to: number; at: number }> => {
    const sorted = [...beats].sort(
        (a, b) => a.position - b.position || a.id - b.id,
    );
    const first = sorted.find((b) => b.id === FIRST_BEAT_ID);
    const times = (line: typeof sorted) => {
        let t = 0;
        return line.map((b) => {
            const at = t;
            t += b.duration;
            return { id: b.id, at };
        });
    };
    const oldLine = times(
        sorted.filter((b) => beatIds.has(b.id) || b === first),
    );
    const newLine = times(sorted.filter((b) => !beatIds.has(b.id)));
    const result = new Map<number, { to: number; at: number }>();
    if (newLine.length === 0) return result;
    let j = 0;
    for (const { id, at } of oldLine) {
        if (!beatIds.has(id)) continue;
        // Both lines are in time order: the last new beat at or before `at`, or the one after it
        // when that is strictly nearer
        while (j + 1 < newLine.length && newLine[j + 1].at <= at) j++;
        const after = newLine[j + 1];
        const to =
            after && after.at - at < at - newLine[j].at ? after : newLine[j];
        result.set(id, { to: to.id, at });
    }
    return result;
};

/**
 * Moves the item changes on `beatIds` to the surviving beat nearest each one's time, before a
 * caller deletes those beats as part of replacing them all. Call it after the new beats exist and
 * in the same transaction as the deletion. When several changes for one item (and key) land on
 * one beat, the latest in time is kept and the rest go with their beats; a change already on the
 * surviving beat wins, as with the carry on deleting beats.
 */
export async function remapItemChangesOntoReplacementBeatsInTransaction({
    tx,
    beatIds,
}: {
    tx: DbTransaction;
    beatIds: ReadonlySet<number>;
}): Promise<void> {
    if (beatIds.size === 0) return;
    let nearest: Map<number, { to: number; at: number }> | null = null;
    for (const entry of BEAT_KEYED_ITEM_TABLES) {
        if (!(await hasTable(tx, entry.name))) continue;
        const rows = await entry.rows(tx);
        if (!rows.some((row) => beatIds.has(row.beatId))) continue;
        nearest ??= nearestSurvivingBeatByTime(
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
        const targets = nearest;
        await land(
            tx,
            entry,
            keptLandings(
                rows,
                beatIds,
                (row) => targets.get(row.beatId) ?? null,
            ),
        );
    }
}
