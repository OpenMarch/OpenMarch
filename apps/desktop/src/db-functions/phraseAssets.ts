/**
 * Show phrase assets (ADR 0004 D-3; docs/3d/performer-behavior.md section 5). Built-in phrases
 * aren't stored; a show asset is one copied into the show (v1 writes only `copied_builtin`).
 * Cues name one as `show:<id>`, and a phrase asset in use can't be deleted (ON DELETE RESTRICT).
 */
import { asc, eq, inArray } from "drizzle-orm";
import { schema } from "@/global/database/db";
import { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import type { CueChannel } from "./cues";

export type PhraseAssetSource = "copied_builtin" | "posed" | "imported";

export interface DatabasePhraseAsset {
    id: number;
    name: string;
    label: string;
    source: PhraseAssetSource;
    /** The channel it plays on and any it takes over. */
    channels: CueChannel[];
    formatVersion: number;
    /** The versioned phrase format; readers migrate older `formatVersion`s on load. */
    data: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

export interface NewPhraseAssetArgs {
    name: string;
    label: string;
    source: PhraseAssetSource;
    channels: readonly CueChannel[];
    formatVersion: number;
    data: Record<string, unknown>;
}

export interface ModifiedPhraseAssetArgs {
    id: number;
    name?: string;
    label?: string;
    channels?: readonly CueChannel[];
    formatVersion?: number;
    data?: Record<string, unknown>;
}

type RealDatabasePhraseAsset = typeof schema.phrase_assets.$inferSelect;
type RealNewPhraseAsset = typeof schema.phrase_assets.$inferInsert;

export const realDatabasePhraseAssetToDatabasePhraseAsset = (
    row: RealDatabasePhraseAsset,
): DatabasePhraseAsset => ({
    id: row.id,
    name: row.name,
    label: row.label,
    source: row.source as PhraseAssetSource,
    channels: JSON.parse(row.channels_json) as CueChannel[],
    formatVersion: row.format_version,
    data: JSON.parse(row.data_json) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

/** Every show phrase asset, in id order. */
export async function getPhraseAssets({
    db,
}: {
    db: DbConnection | DbTransaction;
}): Promise<DatabasePhraseAsset[]> {
    const rows = await db
        .select()
        .from(schema.phrase_assets)
        .orderBy(asc(schema.phrase_assets.id))
        .all();
    return rows.map(realDatabasePhraseAssetToDatabasePhraseAsset);
}

export const createPhraseAssetsInTransaction = async ({
    tx,
    newPhraseAssets,
}: {
    tx: DbTransaction;
    newPhraseAssets: readonly NewPhraseAssetArgs[];
}): Promise<DatabasePhraseAsset[]> => {
    if (newPhraseAssets.length === 0) return [];
    const rows = await tx
        .insert(schema.phrase_assets)
        .values(
            newPhraseAssets.map(
                (args): RealNewPhraseAsset => ({
                    name: args.name,
                    label: args.label,
                    source: args.source,
                    channels_json: JSON.stringify(args.channels),
                    format_version: args.formatVersion,
                    data_json: JSON.stringify(args.data),
                }),
            ),
        )
        .returning();
    return rows.map(realDatabasePhraseAssetToDatabasePhraseAsset);
};

export const updatePhraseAssetsInTransaction = async ({
    tx,
    modifiedPhraseAssets,
}: {
    tx: DbTransaction;
    modifiedPhraseAssets: readonly ModifiedPhraseAssetArgs[];
}): Promise<DatabasePhraseAsset[]> => {
    const updated: DatabasePhraseAsset[] = [];
    for (const { id, ...args } of modifiedPhraseAssets) {
        const set: Partial<RealNewPhraseAsset> = {};
        if (args.name !== undefined) set.name = args.name;
        if (args.label !== undefined) set.label = args.label;
        if (args.channels !== undefined)
            set.channels_json = JSON.stringify(args.channels);
        if (args.formatVersion !== undefined)
            set.format_version = args.formatVersion;
        if (args.data !== undefined) set.data_json = JSON.stringify(args.data);
        if (Object.keys(set).length === 0) continue;
        const row = await tx
            .update(schema.phrase_assets)
            .set(set)
            .where(eq(schema.phrase_assets.id, id))
            .returning()
            .get();
        if (!row) throw new Error(`Phrase asset ${id} not found`);
        updated.push(realDatabasePhraseAssetToDatabasePhraseAsset(row));
    }
    return updated;
};

/**
 * Deletes phrase assets. Throws (a foreign key error) if a cue still uses one: delete or change
 * its cues first.
 */
export const deletePhraseAssetsInTransaction = async ({
    tx,
    phraseAssetIds,
}: {
    tx: DbTransaction;
    phraseAssetIds: ReadonlySet<number>;
}): Promise<DatabasePhraseAsset[]> => {
    if (phraseAssetIds.size === 0) return [];
    const rows = await tx
        .delete(schema.phrase_assets)
        .where(inArray(schema.phrase_assets.id, [...phraseAssetIds]))
        .returning();
    return rows.map(realDatabasePhraseAssetToDatabasePhraseAsset);
};

export async function createPhraseAssets({
    db,
    newPhraseAssets,
}: {
    db: DbConnection;
    newPhraseAssets: readonly NewPhraseAssetArgs[];
}): Promise<DatabasePhraseAsset[]> {
    if (newPhraseAssets.length === 0) return [];
    return await transactionWithHistory(
        db,
        "createPhraseAssets",
        async (tx) =>
            await createPhraseAssetsInTransaction({ tx, newPhraseAssets }),
    );
}

export async function updatePhraseAssets({
    db,
    modifiedPhraseAssets,
}: {
    db: DbConnection;
    modifiedPhraseAssets: readonly ModifiedPhraseAssetArgs[];
}): Promise<DatabasePhraseAsset[]> {
    if (modifiedPhraseAssets.length === 0) return [];
    return await transactionWithHistory(
        db,
        "updatePhraseAssets",
        async (tx) =>
            await updatePhraseAssetsInTransaction({ tx, modifiedPhraseAssets }),
    );
}

export async function deletePhraseAssets({
    db,
    phraseAssetIds,
}: {
    db: DbConnection;
    phraseAssetIds: ReadonlySet<number>;
}): Promise<DatabasePhraseAsset[]> {
    if (phraseAssetIds.size === 0) return [];
    return await transactionWithHistory(
        db,
        "deletePhraseAssets",
        async (tx) =>
            await deletePhraseAssetsInTransaction({ tx, phraseAssetIds }),
    );
}
