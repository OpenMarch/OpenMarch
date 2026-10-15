/**
 * The show's Library: embedded copies of the Library items a show uses (ADR 0002 D-12,
 * props-spec.md section 2 "In the show", package C1.11).
 *
 * A Version is embedded as its parts' bytes in `library_blobs`, deduped by hash, and one
 * `library_items` row naming them. Neither table has history triggers, so embedding inside an
 * undoable edit stays when the edit is undone, and pruning never shows up in undo.
 *
 * The editor is the show's only writer (D-4): it reads a Version's parts from the local Library
 * over `library:read-parts` and embeds them here. Nothing here touches the local Library.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/global/database/db";
import type { DbConnection, DbTransaction } from "./types";
import {
    DerivedFromSchema,
    LibraryItemIdSchema,
    LicenseFieldsSchema,
    VersionHashSchema,
    type LibraryItemKind,
} from "@om-electron/main/library/types";
import { hashParts, versionHashOf } from "@/view3d/library/showHash";
import {
    planLibraryPrune,
    type LibraryKeep,
    type LibraryPrunePlan,
    type LibraryRef,
} from "@/view3d/library/showLibraryPrune";

/** The item's metadata as it was when embedded; the show never reads it from the Library. */
export const ShowLibraryMetadataSchema = z
    .object({
        tags: z.array(z.string()),
        createdAt: z.string(),
        updatedAt: z.string(),
        originalFilename: z.string().nullable(),
        derivedFrom: DerivedFromSchema.nullable(),
    })
    .extend(LicenseFieldsSchema.shape);
export type ShowLibraryMetadata = z.infer<typeof ShowLibraryMetadataSchema>;

const LibraryRefSchema = z.object({
    itemId: LibraryItemIdSchema,
    versionHash: VersionHashSchema,
});
const PartsSchema = z.record(z.string(), VersionHashSchema);

/** A Version to embed, with its parts' bytes. */
export interface EmbedLibraryVersion {
    itemId: string;
    versionHash: string;
    kind: LibraryItemKind;
    name: string;
    builtIn: boolean;
    metadata: ShowLibraryMetadata;
    /** Versions this one pins, such as a Uniform's Garments and Artwork */
    pins: readonly LibraryRef[];
    /** Part role to bytes */
    parts: Readonly<Record<string, Uint8Array>>;
}

/** An embedded Version, as the show loads it at open. Bytes are read separately, by hash. */
export interface ShowLibraryItem {
    itemId: string;
    versionHash: string;
    kind: LibraryItemKind;
    name: string;
    builtIn: boolean;
    metadata: ShowLibraryMetadata;
    pins: LibraryRef[];
    /** Part role to `library_blobs` hash */
    parts: Record<string, string>;
    /** A model's parsed sidecar, or null */
    sidecar: unknown;
    embeddedAt: string;
}

const SIDECAR_ROLE = "sidecar";

/** Matches the `library_items` row of one Version. */
const isLibraryVersion = (ref: LibraryRef) =>
    and(
        eq(schema.library_items.item_id, ref.itemId),
        eq(schema.library_items.version_hash, ref.versionHash),
    );

function parseSidecar(bytes: Uint8Array | undefined): string | null {
    if (!bytes) return null;
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    JSON.parse(text);
    return text;
}

/**
 * Embeds a Version in the show, unless it is already there.
 *
 * Checks that the parts hash to `versionHash` first, so a show never holds a Version under a
 * name its bytes don't have. Not undoable: call it from inside an undoable edit and the Version
 * stays when the edit is undone (a later prune removes it if nothing keeps it).
 */
export async function embedLibraryVersionInTransaction({
    tx,
    version,
}: {
    tx: DbTransaction;
    version: EmbedLibraryVersion;
}): Promise<{ embedded: boolean }> {
    const existing = await tx
        .select({ item_id: schema.library_items.item_id })
        .from(schema.library_items)
        .where(isLibraryVersion(version))
        .get();
    if (existing) return { embedded: false };

    const partHashes = await hashParts(version.parts);
    const actual = await versionHashOf(partHashes);
    if (actual !== version.versionHash) {
        throw new Error(
            `Parts of ${version.itemId} don't match its Version hash ${version.versionHash}`,
        );
    }

    let sidecar: string | null;
    try {
        sidecar = parseSidecar(version.parts[SIDECAR_ROLE]);
    } catch (error) {
        throw new Error(`The sidecar of ${version.itemId} isn't JSON`, {
            cause: error,
        });
    }

    for (const [role, hash] of Object.entries(partHashes)) {
        await tx
            .insert(schema.library_blobs)
            .values({ hash, data: version.parts[role] })
            .onConflictDoNothing()
            .run();
    }
    await tx
        .insert(schema.library_items)
        .values({
            item_id: version.itemId,
            version_hash: version.versionHash,
            kind: version.kind,
            name: version.name,
            built_in: version.builtIn ? 1 : 0,
            parts: JSON.stringify(partHashes),
            pins: JSON.stringify(version.pins),
            metadata: JSON.stringify(version.metadata),
            sidecar,
        })
        .run();
    return { embedded: true };
}

/**
 * Embeds Versions in one plain transaction, all or nothing, such as the copies an import adds.
 * Not undoable, like workspace settings: nothing here is an edit to the show.
 */
export async function embedLibraryVersions({
    db,
    versions,
}: {
    db: DbConnection;
    versions: readonly EmbedLibraryVersion[];
}): Promise<void> {
    await db.transaction(async (tx) => {
        for (const version of versions) {
            await embedLibraryVersionInTransaction({ tx, version });
        }
    });
}

const ShowLibraryRowSchema = z.object({
    item_id: LibraryItemIdSchema,
    version_hash: VersionHashSchema,
    kind: z.enum(["model", "artwork", "uniform"]),
    name: z.string(),
    built_in: z.union([z.literal(0), z.literal(1)]),
    parts: z.string().transform((s, ctx) => {
        try {
            return PartsSchema.parse(JSON.parse(s));
        } catch {
            ctx.addIssue({ code: "custom", message: "bad parts" });
            return z.NEVER;
        }
    }),
    pins: z.string().transform((s, ctx) => {
        try {
            return z.array(LibraryRefSchema).parse(JSON.parse(s));
        } catch {
            ctx.addIssue({ code: "custom", message: "bad pins" });
            return z.NEVER;
        }
    }),
    metadata: z.string().transform((s, ctx) => {
        try {
            return ShowLibraryMetadataSchema.parse(JSON.parse(s));
        } catch {
            ctx.addIssue({ code: "custom", message: "bad metadata" });
            return z.NEVER;
        }
    }),
    sidecar: z
        .string()
        .nullable()
        .transform((s, ctx) => {
            if (s === null) return null;
            try {
                return JSON.parse(s) as unknown;
            } catch {
                ctx.addIssue({ code: "custom", message: "bad sidecar" });
                return z.NEVER;
            }
        }),
    embedded_at: z.string(),
});

/**
 * Loads every embedded Version, without bytes. A row that doesn't parse is skipped with a
 * warning, so one bad row never stops a show from opening. Never writes.
 */
export async function getShowLibraryItems({
    db,
}: {
    db: DbConnection | DbTransaction;
}): Promise<ShowLibraryItem[]> {
    const rows = await db.select().from(schema.library_items).all();
    const items: ShowLibraryItem[] = [];
    for (const row of rows) {
        const parsed = ShowLibraryRowSchema.safeParse(row);
        if (!parsed.success) {
            console.warn(
                `Skipping show Library item ${row.item_id}@${row.version_hash}`,
                parsed.error,
            );
            continue;
        }
        const r = parsed.data;
        items.push({
            itemId: r.item_id,
            versionHash: r.version_hash,
            kind: r.kind,
            name: r.name,
            builtIn: r.built_in === 1,
            metadata: r.metadata,
            pins: r.pins,
            parts: r.parts,
            sidecar: r.sidecar,
            embeddedAt: r.embedded_at,
        });
    }
    return items;
}

/** Reads one blob's bytes, or undefined when the show doesn't have it. */
export async function readLibraryBlob({
    db,
    hash,
}: {
    db: DbConnection | DbTransaction;
    hash: string;
}): Promise<Uint8Array | undefined> {
    const row = await db
        .select({ data: schema.library_blobs.data })
        .from(schema.library_blobs)
        .where(eq(schema.library_blobs.hash, hash))
        .get();
    return row?.data;
}

/**
 * Library items an undo or redo row names. History lives in the show file and outlives the
 * session, so an item a past edit used must survive a prune: undoing that edit brings the use
 * back. Matching on the item id anywhere in the row's SQL is coarse, and keeps every Version of
 * the item, which errs toward keeping.
 */
export async function libraryKeepsFromHistory({
    db,
}: {
    db: DbConnection | DbTransaction;
}): Promise<LibraryKeep[]> {
    const rows = await db
        .selectDistinct({ item_id: schema.library_items.item_id })
        .from(schema.library_items)
        .where(
            sql`EXISTS (SELECT 1 FROM history_undo WHERE instr(history_undo.sql, ${schema.library_items.item_id}) > 0)
             OR EXISTS (SELECT 1 FROM history_redo WHERE instr(history_redo.sql, ${schema.library_items.item_id}) > 0)`,
        )
        .orderBy(schema.library_items.item_id)
        .all();
    return rows.map((r) => ({ itemId: r.item_id }));
}

/**
 * Removes the Versions nothing keeps, then the blobs no remaining Version names (props-spec.md
 * section 2). `keep` is what the show's tables use (cues, Item tables); history is added here.
 */
export async function pruneShowLibraryInTransaction({
    tx,
    keep,
}: {
    tx: DbTransaction;
    keep: readonly LibraryKeep[];
}): Promise<LibraryPrunePlan> {
    const rows = await tx
        .select({
            item_id: schema.library_items.item_id,
            version_hash: schema.library_items.version_hash,
            parts: schema.library_items.parts,
            pins: schema.library_items.pins,
        })
        .from(schema.library_items)
        .all();
    const items = [];
    const unreadable: LibraryKeep[] = [];
    for (const row of rows) {
        const parts = PartsSchema.safeParse(safeJson(row.parts));
        const pins = z.array(LibraryRefSchema).safeParse(safeJson(row.pins));
        if (!parts.success || !pins.success) {
            // Can't tell what it names, so neither it nor any blob is pruned
            unreadable.push({
                itemId: row.item_id,
                versionHash: row.version_hash,
            });
            continue;
        }
        items.push({
            itemId: row.item_id,
            versionHash: row.version_hash,
            parts: parts.data,
            pins: pins.data,
        });
    }
    const blobHashes = (
        await tx
            .select({ hash: schema.library_blobs.hash })
            .from(schema.library_blobs)
            .all()
    ).map((r) => r.hash);

    const plan = planLibraryPrune({
        items,
        blobHashes,
        keep: [...keep, ...(await libraryKeepsFromHistory({ db: tx }))],
    });
    if (unreadable.length > 0) plan.blobs = [];

    for (const ref of plan.items) {
        await tx
            .delete(schema.library_items)
            .where(isLibraryVersion(ref))
            .run();
    }
    if (plan.blobs.length > 0)
        await tx
            .delete(schema.library_blobs)
            .where(inArray(schema.library_blobs.hash, plan.blobs))
            .run();
    return plan;
}

function safeJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}
