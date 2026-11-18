/**
 * The show's asset store (ADR 0010 amendment 2026-11-15, fork #997): `show_assets` holds one
 * row per asset Version, naming its parts' bytes in `show_asset_blobs` by sha256.
 *
 * - Identical bytes are stored once, however many assets or parts use them.
 * - Adding the same content again (same kind, parts and sidecar) reuses its Version.
 * - Neither table has history triggers, so an asset added inside an undoable edit stays when the
 *   edit is undone. A prop's reference to an asset (`items.model`) is what undo changes.
 * - Nothing removes an asset on its own: the show keeps every asset until someone chooses
 *   Remove unused… (`removeShowAssetsInTransaction`, fork #1001), never on save, close or Save
 *   Copy.
 * - Any `kind` is kept and read back; the code that uses a kind picks out its own rows.
 *
 * The editor is the show's only writer (ADR 0010 D-4). The 3D View window reads these tables
 * through its read-only proxy.
 */
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/global/database/db";
import type { DbConnection, DbTransaction } from "./types";
import {
    canonicalJson,
    hashParts,
    isSha256Hex,
    SIDECAR_ROLE,
    versionHashOf,
    type JsonObject,
} from "@/showAssets/hash";
import { isShowAssetId, type ShowAssetRef } from "@/showAssets/ref";

const { show_assets, show_asset_blobs, items, cues } = schema;

/** An asset to add, with its parts' bytes. */
export interface NewShowAsset {
    /**
     * The asset's id, to add a Version of an asset the show has. Omitted, the asset gets a new
     * UUID, unless the show already has this content as an asset of the same kind, which is
     * reused.
     */
    id?: string;
    /** What it is, such as `model` */
    kind: string;
    name: string;
    /** Part role (lowercase letters, digits and dashes; never `sidecar`) to bytes; at least one */
    parts: Readonly<Record<string, Uint8Array>>;
    /** What the kind's code reads without the bytes; in the Version hash */
    sidecar?: JsonObject;
    /** License, author, source; outside the Version hash */
    credits?: JsonObject;
}

/** An asset Version as the show loads it. Bytes are read separately, by hash. */
export interface ShowAsset extends ShowAssetRef {
    kind: string;
    name: string;
    /** Part role to `show_asset_blobs.hash` */
    parts: Record<string, string>;
    sidecar: JsonObject;
    credits: JsonObject;
    createdAt: string;
}

const PART_ROLE = /^[a-z][a-z0-9-]*$/;

/** Oldest first: `created_at` only has whole seconds. */
const insertionOrder = sql`rowid`;

/** Matches the row of one asset Version. */
const isVersion = (ref: ShowAssetRef) =>
    and(
        eq(show_assets.id, ref.id),
        eq(show_assets.version_hash, ref.versionHash),
    );

function checkNewAsset(asset: NewShowAsset) {
    if (asset.id !== undefined && !isShowAssetId(asset.id))
        throw new Error(`Not a show asset id: ${JSON.stringify(asset.id)}`);
    if (asset.kind.length === 0) throw new Error("A show asset needs a kind");
    const roles = Object.keys(asset.parts);
    if (roles.length === 0)
        throw new Error(`${asset.name} needs at least one part`);
    for (const role of roles) {
        if (role === SIDECAR_ROLE || !PART_ROLE.test(role))
            throw new Error(`Not a part role: ${JSON.stringify(role)}`);
        if (!(asset.parts[role] instanceof Uint8Array))
            throw new Error(`The ${role} part of ${asset.name} isn't bytes`);
    }
}

/**
 * Adds an asset Version to the show, storing each part's bytes unless the show has them, and
 * returns the Version it is stored as.
 *
 * `added` is false when the show already had the Version (its name and credits stay as stored;
 * only missing or damaged bytes are put back). An `id` the show has under another kind is
 * refused. Not undoable on its own: inside `transactionWithHistory`, only the edit's other
 * changes are undone.
 *
 * The parts are hashed inside `tx`. For large files, an import should run this in a short
 * transaction of its own rather than inside a long edit.
 */
export async function addShowAssetInTransaction({
    tx,
    asset,
}: {
    tx: DbTransaction;
    asset: NewShowAsset;
}): Promise<{ ref: ShowAssetRef; added: boolean }> {
    checkNewAsset(asset);
    const partHashes = await hashParts(asset.parts);
    const sidecar = canonicalJson(asset.sidecar ?? {});
    const versionHash = await versionHashOf(partHashes, sidecar);

    // Each part's bytes, stored once. On a re-import this also puts back bytes a damaged file
    // lost, or replaces stored bytes that no longer match their hash
    const stored = new Set<string>();
    for (const [role, hash] of Object.entries(partHashes)) {
        if (stored.has(hash)) continue;
        stored.add(hash);
        await tx
            .insert(show_asset_blobs)
            .values({ hash, data: asset.parts[role]! })
            .onConflictDoUpdate({
                target: show_asset_blobs.hash,
                set: { data: sql`excluded.data` },
                setWhere: sql`${show_asset_blobs.data} IS NOT excluded.data`,
            })
            .run();
    }

    let id = asset.id;
    if (id === undefined) {
        // A re-import of the same content: reuse its asset
        const same = await tx
            .select({ id: show_assets.id })
            .from(show_assets)
            .where(
                and(
                    eq(show_assets.version_hash, versionHash),
                    eq(show_assets.kind, asset.kind),
                ),
            )
            .orderBy(insertionOrder)
            .get();
        if (same) return { ref: { id: same.id, versionHash }, added: false };
        id = crypto.randomUUID();
    } else {
        const versions = await tx
            .select({
                kind: show_assets.kind,
                versionHash: show_assets.version_hash,
            })
            .from(show_assets)
            .where(eq(show_assets.id, id))
            .all();
        const otherKind = versions.find((v) => v.kind !== asset.kind);
        if (otherKind)
            throw new Error(
                `Show asset ${id} is a ${otherKind.kind}, not a ${asset.kind}`,
            );
        if (versions.some((v) => v.versionHash === versionHash))
            return { ref: { id, versionHash }, added: false };
    }

    await tx
        .insert(show_assets)
        .values({
            id,
            version_hash: versionHash,
            kind: asset.kind,
            name: asset.name,
            parts: canonicalJson(partHashes),
            sidecar,
            credits: canonicalJson(asset.credits ?? {}),
        })
        .run();
    return { ref: { id, versionHash }, added: true };
}

/**
 * Replaces the credits of one asset Version. Credits are outside the Version hash, so the
 * Version keeps its name. Returns false when the show has no such Version.
 */
export async function setShowAssetCreditsInTransaction({
    tx,
    ref,
    credits,
}: {
    tx: DbTransaction;
    ref: ShowAssetRef;
    credits: JsonObject;
}): Promise<boolean> {
    const updated = await tx
        .update(show_assets)
        .set({ credits: canonicalJson(credits) })
        .where(isVersion(ref))
        .returning({ id: show_assets.id })
        .all();
    return updated.length > 0;
}

const jsonObjectColumn = (what: string) =>
    z.string().transform((text, ctx) => {
        try {
            const value: unknown = JSON.parse(text);
            if (
                typeof value === "object" &&
                value !== null &&
                !Array.isArray(value)
            )
                return value as JsonObject;
        } catch {
            // reported below
        }
        ctx.addIssue({ code: "custom", message: `bad ${what}` });
        return z.NEVER;
    });

const ShowAssetRowSchema = z.object({
    id: z.string().refine(isShowAssetId),
    version_hash: z.string().refine(isSha256Hex),
    kind: z.string(),
    name: z.string(),
    parts: jsonObjectColumn("parts").pipe(
        z.record(z.string(), z.string().refine(isSha256Hex)),
    ),
    sidecar: jsonObjectColumn("sidecar"),
    credits: jsonObjectColumn("credits"),
    created_at: z.string(),
});

function rowToAsset(row: typeof show_assets.$inferSelect): ShowAsset | null {
    const parsed = ShowAssetRowSchema.safeParse(row);
    if (!parsed.success) {
        console.warn(
            `Skipping show asset ${row.id}@${row.version_hash}`,
            parsed.error,
        );
        return null;
    }
    const r = parsed.data;
    return {
        id: r.id,
        versionHash: r.version_hash,
        kind: r.kind,
        name: r.name,
        parts: r.parts,
        sidecar: r.sidecar,
        credits: r.credits,
        createdAt: r.created_at,
    };
}

/**
 * Every asset Version in the show, of any kind, without bytes, in the order they were added. A row that doesn't
 * parse is skipped with a warning, so one bad row never stops a show from opening.
 */
export async function getShowAssets({
    db,
}: {
    db: DbConnection | DbTransaction;
}): Promise<ShowAsset[]> {
    const rows = await db
        .select()
        .from(show_assets)
        .orderBy(insertionOrder)
        .all();
    return rows.flatMap((row) => rowToAsset(row) ?? []);
}

/** One asset Version, or undefined when the show doesn't have it (or its row doesn't parse). */
export async function getShowAsset({
    db,
    ref,
}: {
    db: DbConnection | DbTransaction;
    ref: ShowAssetRef;
}): Promise<ShowAsset | undefined> {
    const row = await db.select().from(show_assets).where(isVersion(ref)).get();
    return (row && rowToAsset(row)) ?? undefined;
}

/**
 * One blob's bytes, or undefined when the show doesn't have it. Reads the database every time;
 * the editor reads through `showAssetBlobCache` instead.
 */
export async function readShowAssetBlob({
    db,
    hash,
}: {
    db: DbConnection | DbTransaction;
    hash: string;
}): Promise<Uint8Array | undefined> {
    const row = await db
        .select({ data: show_asset_blobs.data })
        .from(show_asset_blobs)
        .where(eq(show_asset_blobs.hash, hash))
        .get();
    return row?.data;
}

/** Every blob's size in bytes, by hash (fork #1001: what each asset adds to the show). */
export async function getShowAssetBlobSizes({
    db,
}: {
    db: DbConnection | DbTransaction;
}): Promise<Map<string, number>> {
    const rows = await db
        .select({
            hash: show_asset_blobs.hash,
            bytes: sql<number>`length(${show_asset_blobs.data})`,
        })
        .from(show_asset_blobs)
        .all();
    return new Map(rows.map((row) => [row.hash, row.bytes]));
}

/**
 * Every value in the show that may name an asset (`library:<id>@<hash>`): props' models and cue
 * values, as they are now. Undo history isn't read, so "unused" means nothing names it now
 * (ADR 0010 amendment 2026-11-15).
 */
export async function getShowAssetReferences({
    db,
}: {
    db: DbConnection | DbTransaction;
}): Promise<string[]> {
    const models = await db
        .select({ value: items.model })
        .from(items)
        .where(sql`${items.model} LIKE 'library:%'`)
        .all();
    const values = await db
        .select({ value: cues.value })
        .from(cues)
        .where(sql`${cues.value} LIKE 'library:%'`)
        .all();
    return [...models, ...values].flatMap((row) =>
        row.value ? [row.value] : [],
    );
}

/**
 * Removes these asset Versions, then the blobs no Version left in the show uses: bytes another
 * asset shares stay. Outside undo, like adding (the tables have no history triggers); a prop an
 * undo points back at a removed asset draws as a block. Returns how many Versions it removed.
 */
export async function removeShowAssetsInTransaction({
    tx,
    refs,
}: {
    tx: DbTransaction;
    refs: readonly ShowAssetRef[];
}): Promise<number> {
    let removed = 0;
    for (const ref of refs) {
        const rows = await tx
            .delete(show_assets)
            .where(isVersion(ref))
            .returning({ id: show_assets.id })
            .all();
        removed += rows.length;
    }
    if (removed > 0)
        await tx.run(sql`
            DELETE FROM show_asset_blobs
            WHERE hash NOT IN (
                SELECT parts.value FROM show_assets, json_each(show_assets.parts) AS parts
            )`);
    return removed;
}
