/**
 * Performer cues in the show file (ADR 0004 D-1, D-2; docs/3d/performer-behavior.md).
 *
 * Storage keeps a cue's columns consistent (the CHECKs in `schema.ts`); the behavior rules (who a
 * cue fits, phrases on states-only channels, take-overs) belong to the compile step in
 * `@openmarch/core`, which flags rather than rejects. `DatabaseCue` has the shape compile reads
 * (`CueInput`): camelCase, the target as one value, set members inlined.
 */
import { and, asc, eq, inArray, notExists, sql } from "drizzle-orm";
import type {
    CueChannel,
    CueInput,
    CueRipple,
    CueTarget,
    RippleOrder,
} from "@openmarch/core";
import { schema } from "@/global/database/db";
import { CUE_CHANNELS } from "@om-electron/database/migrations/schema";
import { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";

export { CUE_CHANNELS };
export type { CueChannel, CueRipple, CueTarget };

// The schema's CHECK list and core's channels must name the same channels.
type SameChannels<A, B> = [A] extends [B]
    ? [B] extends [A]
        ? true
        : never
    : never;
const _channelsMatch: SameChannels<(typeof CUE_CHANNELS)[number], CueChannel> =
    true;
void _channelsMatch;

export type CueKind = CueInput["kind"];

export type CueRippleOrder = RippleOrder;
export const CUE_RIPPLE_ORDERS = [
    "drill",
    "left_right",
    "right_left",
    "down_form",
] as const satisfies readonly RippleOrder[];

/** The stored ripple format, `{ version: 1, span, order }`. */
const RIPPLE_FORMAT_VERSION = 1;

export interface DatabaseCue {
    id: number;
    channel: CueChannel;
    kind: CueKind;
    target: CueTarget;
    beatId: number;
    /**
     * `builtin:...`, `show:<phrase asset id>`, `library:<uuid>@<version hash>` (Carry, Silk,
     * Uniform) or `none` (Carry).
     */
    value: string;
    /** The show phrase asset a `show:` value names, else null. */
    phraseAssetId: number | null;
    /** Phrases: the length in counts, inclusive, at least 2. */
    length: number | null;
    /** States: the transition length in counts; null is the library default. */
    transitionLength: number | null;
    settings: Record<string, unknown>;
    ripple: CueRipple | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface NewCueArgs {
    channel: CueChannel;
    kind: CueKind;
    target: CueTarget;
    beatId: number;
    value: string;
    length?: number | null;
    transitionLength?: number | null;
    settings?: Record<string, unknown>;
    ripple?: CueRipple | null;
    notes?: string | null;
}

/** Fields left out are kept. A new `target` replaces the set members too. */
export interface ModifiedCueArgs {
    id: number;
    channel?: CueChannel;
    kind?: CueKind;
    target?: CueTarget;
    beatId?: number;
    value?: string;
    length?: number | null;
    transitionLength?: number | null;
    settings?: Record<string, unknown>;
    ripple?: CueRipple | null;
    notes?: string | null;
}

// A stored cue is what compile reads.
const _isCueInput = (cue: DatabaseCue): CueInput => cue;
void _isCueInput;

type RealDatabaseCue = typeof schema.cues.$inferSelect;
type RealNewCue = typeof schema.cues.$inferInsert;

/** The phrase asset id a `show:<id>` value names, or null for any other value. */
export const phraseAssetIdOfCueValue = (value: string): number | null => {
    const match = /^show:([1-9][0-9]*)$/.exec(value);
    return match ? Number(match[1]) : null;
};

const parseJsonObject = (json: string): Record<string, unknown> => {
    const parsed: unknown = JSON.parse(json);
    return parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
};

const parseRipple = (json: string | null): CueRipple | null => {
    if (json === null) return null;
    const { span, order } = parseJsonObject(json);
    return { span: span as number, order: order as CueRippleOrder };
};

const serializeRipple = (ripple: CueRipple | null | undefined) =>
    ripple
        ? JSON.stringify({
              version: RIPPLE_FORMAT_VERSION,
              span: ripple.span,
              order: ripple.order,
          })
        : null;

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

const targetOf = (
    row: RealDatabaseCue,
    members: ReadonlyMap<number, number[]>,
): CueTarget => {
    switch (row.target_kind) {
        case "section":
            return { kind: "section", section: row.target_section! };
        case "tag":
            return { kind: "tag", tagId: row.target_tag_id! };
        case "set":
            return { kind: "set", marcherIds: members.get(row.id) ?? [] };
        default:
            return { kind: "band" };
    }
};

const targetColumns = (target: CueTarget) => ({
    target_kind: target.kind,
    target_section: target.kind === "section" ? target.section : null,
    target_tag_id: target.kind === "tag" ? target.tagId : null,
});

export const realDatabaseCueToDatabaseCue = (
    row: RealDatabaseCue,
    members: ReadonlyMap<number, number[]> = new Map(),
): DatabaseCue => ({
    id: row.id,
    channel: row.channel as CueChannel,
    kind: row.kind as CueKind,
    target: targetOf(row, members),
    beatId: row.beat_id,
    value: row.value,
    phraseAssetId: row.phrase_asset_id,
    length: row.length,
    transitionLength: row.transition_length,
    settings: parseJsonObject(row.settings_json),
    ripple: parseRipple(row.ripple_json),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const newCueArgsToRealNewCue = (args: NewCueArgs): RealNewCue => ({
    channel: args.channel,
    kind: args.kind,
    ...targetColumns(args.target),
    beat_id: args.beatId,
    value: args.value,
    phrase_asset_id: phraseAssetIdOfCueValue(args.value),
    length: args.length ?? null,
    transition_length: args.transitionLength ?? null,
    settings_json: serializeSettings(args.settings),
    ripple_json: serializeRipple(args.ripple),
    notes: args.notes ?? null,
});

const assertSetHasMembers = (target: CueTarget) => {
    if (target.kind === "set" && new Set(target.marcherIds).size === 0)
        throw new Error("A hand-picked set cue needs at least one marcher");
};

/** Set members by cue id, in marcher id order. */
const membersByCue = async (
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
    const members = new Map<number, number[]>();
    for (const { cue_id, marcher_id } of rows) {
        const list = members.get(cue_id);
        if (list) list.push(marcher_id);
        else members.set(cue_id, [marcher_id]);
    }
    return members;
};

/** Every cue, in id order (newest last), with set members inlined. */
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
    const members = await membersByCue(db);
    return rows.map((row) => realDatabaseCueToDatabaseCue(row, members));
}

/** One cue with its set members, or undefined. */
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
    return realDatabaseCueToDatabaseCue(row, await membersByCue(db, [id]));
}

const insertMembersInTransaction = async (
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

/** Creates cues and their set members. Throws if a set target has no marchers. */
export const createCuesInTransaction = async ({
    tx,
    newCues,
}: {
    tx: DbTransaction;
    newCues: readonly NewCueArgs[];
}): Promise<DatabaseCue[]> => {
    const created: DatabaseCue[] = [];
    for (const args of newCues) {
        assertSetHasMembers(args.target);
        const row = await tx
            .insert(schema.cues)
            .values(newCueArgsToRealNewCue(args))
            .returning()
            .get();
        if (args.target.kind === "set")
            await insertMembersInTransaction(
                tx,
                row.id,
                args.target.marcherIds,
            );
        created.push(
            realDatabaseCueToDatabaseCue(row, await membersByCue(tx, [row.id])),
        );
    }
    return created;
};

/**
 * Updates cues. A new target replaces the set members: removed marchers are deleted and new ones
 * inserted, so members that stay keep their rows. Throws if a set target has no marchers.
 */
export const updateCuesInTransaction = async ({
    tx,
    modifiedCues,
}: {
    tx: DbTransaction;
    modifiedCues: readonly ModifiedCueArgs[];
}): Promise<DatabaseCue[]> => {
    const updated: DatabaseCue[] = [];
    for (const { id, target, ...args } of modifiedCues) {
        const set: Partial<RealNewCue> = {};
        if (args.channel !== undefined) set.channel = args.channel;
        if (args.kind !== undefined) set.kind = args.kind;
        if (target !== undefined) {
            assertSetHasMembers(target);
            Object.assign(set, targetColumns(target));
        }
        if (args.beatId !== undefined) set.beat_id = args.beatId;
        if (args.value !== undefined) {
            set.value = args.value;
            set.phrase_asset_id = phraseAssetIdOfCueValue(args.value);
        }
        if (args.length !== undefined) set.length = args.length;
        if (args.transitionLength !== undefined)
            set.transition_length = args.transitionLength;
        if (args.settings !== undefined)
            set.settings_json = serializeSettings(args.settings);
        if (args.ripple !== undefined)
            set.ripple_json = serializeRipple(args.ripple);
        if (args.notes !== undefined) set.notes = args.notes;

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

        if (target !== undefined) {
            const wanted = new Set(
                target.kind === "set" ? target.marcherIds : [],
            );
            const current = (await membersByCue(tx, [id])).get(id) ?? [];
            const removed = current.filter((m) => !wanted.has(m));
            if (removed.length > 0)
                await tx
                    .delete(schema.cue_marchers)
                    .where(
                        and(
                            eq(schema.cue_marchers.cue_id, id),
                            inArray(schema.cue_marchers.marcher_id, removed),
                        ),
                    )
                    .run();
            const kept = new Set(current);
            await insertMembersInTransaction(
                tx,
                id,
                [...wanted].filter((m) => !kept.has(m)),
            );
        }
        updated.push(
            realDatabaseCueToDatabaseCue(row, await membersByCue(tx, [id])),
        );
    }
    return updated;
};

/** Deletes cues; their set members go with them (ON DELETE CASCADE). */
export const deleteCuesInTransaction = async ({
    tx,
    cueIds,
}: {
    tx: DbTransaction;
    cueIds: ReadonlySet<number>;
}): Promise<DatabaseCue[]> => {
    if (cueIds.size === 0) return [];
    const ids = [...cueIds];
    const members = await membersByCue(tx, ids);
    const deleted = await tx
        .delete(schema.cues)
        .where(inArray(schema.cues.id, ids))
        .returning();
    return deleted.map((row) => realDatabaseCueToDatabaseCue(row, members));
};

/**
 * Deletes every hand-picked set cue left with no members (ADR 0004 D-2). The marcher deletion
 * write path calls it in the same transaction, after the members went with their marchers.
 */
export const deleteEmptySetCuesInTransaction = async ({
    tx,
}: {
    tx: DbTransaction;
}): Promise<number[]> => {
    // A page-era file gets the cue tables when it converts; until then it has no set cues
    const hasCues = await tx
        .select({ n: sql<number>`count(*)` })
        .from(sql`sqlite_schema`)
        .where(sql`type = 'table' AND name = 'cues'`)
        .get();
    if (!hasCues?.n) return [];
    const deleted = await tx
        .delete(schema.cues)
        .where(
            and(
                eq(schema.cues.target_kind, "set"),
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
