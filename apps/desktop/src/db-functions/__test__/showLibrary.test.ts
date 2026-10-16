import { describe, expect } from "vitest";
import { count, getTableName, sql } from "drizzle-orm";
import { describeDbTests, schema, type DbConnection } from "@/test/base";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import { tablesWithHistory } from "../historyTriggers";
import {
    embedLibraryVersionInTransaction,
    embedLibraryVersions,
    getShowLibraryItems,
    libraryKeepsFromCues,
    libraryKeepsFromHistory,
    pruneShowLibraryInTransaction,
    readLibraryBlob,
    type EmbedLibraryVersion,
} from "../showLibrary";
import { hashParts, versionHashOf } from "@/view3d/library/showHash";
import { createCuesInTransaction } from "../cues";
import {
    createShowBlobCache,
    renderPartHash,
} from "@/view3d/library/showBlobCache";
import type { LibraryKeep } from "@/view3d/library/showLibraryPrune";
import { embedImportedVersions } from "@/view3d/library/showLibraryEmbed";
import { buildAddFromShowRequest } from "@/view3d/library/showLibraryUpdates";
import { AddFromShowRequestSchema } from "@/view3d/library/protocol";
import type { LibraryItem } from "@om-electron/main/library/types";

const bytes = (text: string) => new TextEncoder().encode(text);

/** Each in its own plain transaction, as a caller outside an undoable edit would run them. */
const embedLibraryVersion = ({
    db,
    version,
}: {
    db: DbConnection;
    version: EmbedLibraryVersion;
}) => db.transaction((tx) => embedLibraryVersionInTransaction({ tx, version }));
const pruneShowLibrary = ({
    db,
    keep,
}: {
    db: DbConnection;
    keep: LibraryKeep[];
}) => db.transaction((tx) => pruneShowLibraryInTransaction({ tx, keep }));

const metadata = {
    tags: ["guard"],
    createdAt: "2026-10-12T00:00:00.000Z",
    updatedAt: "2026-10-12T00:00:00.000Z",
    originalFilename: "rifle.glb",
    derivedFrom: null,
    license: "CC-BY-4.0",
    licenseText: null,
    author: "A. Maker",
    sourceUrl: null,
    attribution: null,
    modified: false,
};

const RIFLE = "11111111-1111-4111-8111-111111111111";
const FLAG = "22222222-2222-4222-8222-222222222222";
const UNIFORM = "33333333-3333-4333-8333-333333333333";

async function version(
    itemId: string,
    parts: Record<string, Uint8Array>,
    extra: Partial<EmbedLibraryVersion> = {},
): Promise<EmbedLibraryVersion> {
    return {
        itemId,
        versionHash: await versionHashOf(await hashParts(parts)),
        kind: "model",
        name: "Rifle",
        builtIn: false,
        metadata,
        pins: [],
        parts,
        ...extra,
    };
}

const rifle = () =>
    version(RIFLE, {
        glb: bytes("glTF rifle"),
        sidecar: bytes('{"kind":"rifle"}'),
    });
const flag = () =>
    version(
        FLAG,
        { original: bytes("flag.png"), display: bytes("flag.ktx2") },
        { kind: "artwork", name: "Flag" },
    );

const rows = async (db: DbConnection) => ({
    items: (await db.select({ c: count() }).from(schema.library_items).get())
        ?.c,
    blobs: (await db.select({ c: count() }).from(schema.library_blobs).get())
        ?.c,
});

describeDbTests("showLibrary", (it) => {
    describe("tables", () => {
        it("keep both tables out of undo history", () => {
            const names = tablesWithHistory.map((t) => getTableName(t));
            expect(names).not.toContain("library_items");
            expect(names).not.toContain("library_blobs");
        });

        it("have no history triggers in the show file", async ({ db }) => {
            const triggers = await db
                .select({ name: sql<string>`name` })
                .from(sql`sqlite_master`)
                .where(
                    sql`type = 'trigger' AND tbl_name IN ('library_items', 'library_blobs')`,
                )
                .all();
            expect(triggers).toEqual([]);
        });

        it("start empty in a new show", async ({ db }) => {
            expect(await rows(db)).toEqual({ items: 0, blobs: 0 });
        });
    });

    describe("embedding", () => {
        it("stores a Version, its blobs and its sidecar", async ({ db }) => {
            const v = await rifle();
            expect(await embedLibraryVersion({ db, version: v })).toEqual({
                embedded: true,
            });

            const [item] = await getShowLibraryItems({ db });
            expect(item).toMatchObject({
                itemId: RIFLE,
                versionHash: v.versionHash,
                kind: "model",
                name: "Rifle",
                builtIn: false,
                metadata,
                pins: [],
                sidecar: { kind: "rifle" },
            });
            expect(Object.keys(item.parts).sort()).toEqual(["glb", "sidecar"]);
            const glb = await readLibraryBlob({ db, hash: item.parts.glb });
            expect(Array.from(glb!)).toEqual(Array.from(v.parts.glb));
        });

        it("is a no-op for a Version the show already has", async ({ db }) => {
            const v = await rifle();
            await embedLibraryVersion({ db, version: v });
            expect(await embedLibraryVersion({ db, version: v })).toEqual({
                embedded: false,
            });
            expect(await rows(db)).toEqual({ items: 1, blobs: 2 });
        });

        it("shares a blob between Versions", async ({ db }) => {
            const v1 = await rifle();
            const v2 = await version(RIFLE, {
                glb: bytes("glTF rifle v2"),
                sidecar: v1.parts.sidecar,
            });
            await embedLibraryVersion({ db, version: v1 });
            await embedLibraryVersion({ db, version: v2 });
            expect(await rows(db)).toEqual({ items: 2, blobs: 3 });
        });

        it("refuses parts that don't match the Version hash", async ({
            db,
        }) => {
            const v = await rifle();
            await expect(
                embedLibraryVersion({
                    db,
                    version: { ...v, parts: { ...v.parts, glb: bytes("x") } },
                }),
            ).rejects.toThrow(/Version hash/);
            expect(await rows(db)).toEqual({ items: 0, blobs: 0 });
        });

        it("refuses a sidecar that isn't JSON", async ({ db }) => {
            const v = await version(RIFLE, {
                glb: bytes("g"),
                sidecar: bytes("{"),
            });
            await expect(
                embedLibraryVersion({ db, version: v }),
            ).rejects.toThrow(/sidecar/);
            expect(await rows(db)).toEqual({ items: 0, blobs: 0 });
        });

        it("embeds several Versions all or nothing", async ({ db }) => {
            const r = await rifle();
            const f = await flag();
            await expect(
                embedLibraryVersions({
                    db,
                    versions: [
                        r,
                        { ...f, parts: { ...f.parts, display: bytes("x") } },
                    ],
                }),
            ).rejects.toThrow(/Version hash/);
            expect(await rows(db)).toEqual({ items: 0, blobs: 0 });

            await embedLibraryVersions({ db, versions: [r, f] });
            expect(await rows(db)).toEqual({ items: 2, blobs: 4 });
            expect(await db.select().from(schema.history_undo).all()).toEqual(
                [],
            );
        });

        it("isn't undone with the edit it was embedded in", async ({ db }) => {
            const v = await rifle();
            await transactionWithHistory(db, "placeRifle", async (tx) => {
                await tx.insert(schema.tags).values({ name: "rifles" }).run();
                await embedLibraryVersionInTransaction({ tx, version: v });
            });
            const undoRows = await db.select().from(schema.history_undo).all();
            expect(undoRows.some((r) => r.sql.includes("library_"))).toBe(
                false,
            );

            await performUndo(db);
            expect(await db.select().from(schema.tags).all()).toHaveLength(0);
            expect(await rows(db)).toEqual({ items: 1, blobs: 2 });

            await performRedo(db);
            expect(await rows(db)).toEqual({ items: 1, blobs: 2 });
        });
    });

    describe("loading", () => {
        it("skips a row it can't read", async ({ db }) => {
            await embedLibraryVersion({ db, version: await rifle() });
            await db
                .insert(schema.library_items)
                .values({
                    item_id: FLAG,
                    version_hash: "f".repeat(64),
                    kind: "artwork",
                    name: "Broken",
                    parts: "not json",
                    metadata: "{}",
                })
                .run();
            const items = await getShowLibraryItems({ db });
            expect(items.map((i) => i.itemId)).toEqual([RIFLE]);
        });

        it("reads a model and an artwork back from the show alone", async ({
            db,
        }) => {
            const r = await rifle();
            const f = await flag();
            await embedLibraryVersion({ db, version: r });
            await embedLibraryVersion({ db, version: f });

            // No local Library and no IPC: only the show file
            const cache = createShowBlobCache({
                read: (hash) => readLibraryBlob({ db, hash }),
            });
            const items = await getShowLibraryItems({ db });
            const byId = new Map(items.map((i) => [i.itemId, i]));
            const glb = await cache.get(
                renderPartHash(byId.get(RIFLE)!, "glb")!,
            );
            const display = await cache.get(
                renderPartHash(byId.get(FLAG)!, "display")!,
            );
            expect(Array.from(glb!)).toEqual(Array.from(r.parts.glb));
            expect(Array.from(display!)).toEqual(Array.from(f.parts.display));
            expect(() =>
                renderPartHash(byId.get(FLAG)!, "original" as never),
            ).toThrow();
        });

        it("holds an Artwork's original, so another person can add it to their Library", async ({
            db,
        }) => {
            const f = await flag();
            const item: LibraryItem = {
                schemaVersion: 1,
                id: FLAG,
                kind: "artwork",
                name: "Flag",
                tags: metadata.tags,
                createdAt: metadata.createdAt,
                updatedAt: metadata.updatedAt,
                originalFilename: "flag.png",
                derivedFrom: null,
                license: metadata.license,
                licenseText: null,
                author: metadata.author,
                sourceUrl: null,
                attribution: null,
                modified: false,
                builtIn: false,
                versions: [
                    {
                        hash: f.versionHash,
                        createdAt: metadata.createdAt,
                        parts: await hashParts(f.parts),
                        source: null,
                    },
                ],
            };
            // As an import does: copy the saved Version from the local Library
            await embedImportedVersions({
                db,
                saved: [{ item, versionHash: f.versionHash }],
                readParts: async ({ roles }) => ({
                    ok: true,
                    value: Object.fromEntries(
                        roles.map((r) => [r, f.parts[r]]),
                    ),
                }),
            });

            // On the other machine: only the show file
            const [embedded] = await getShowLibraryItems({ db });
            const request = await buildAddFromShowRequest({
                item: embedded,
                readBlob: (hash) => readLibraryBlob({ db, hash }),
            });
            expect(AddFromShowRequestSchema.safeParse(request).success).toBe(
                true,
            );
            expect(Array.from(request.parts.original)).toEqual(
                Array.from(f.parts.original),
            );
            expect(await versionHashOf(await hashParts(request.parts))).toBe(
                f.versionHash,
            );
        });

        it("reads a missing blob as undefined", async ({ db }) => {
            expect(
                await readLibraryBlob({ db, hash: "0".repeat(64) }),
            ).toBeUndefined();
        });
    });

    describe("pruning", () => {
        it("removes Versions nothing keeps and their blobs", async ({ db }) => {
            const r = await rifle();
            await embedLibraryVersion({ db, version: r });
            await embedLibraryVersion({ db, version: await flag() });

            const plan = await pruneShowLibrary({
                db,
                keep: [{ itemId: RIFLE, versionHash: r.versionHash }],
            });
            expect(plan.items.map((i) => i.itemId)).toEqual([FLAG]);
            expect(plan.blobs).toHaveLength(2);
            expect(
                (await getShowLibraryItems({ db })).map((i) => i.itemId),
            ).toEqual([RIFLE]);
            expect(await rows(db)).toEqual({ items: 1, blobs: 2 });
        });

        it("keeps what a kept Uniform pins", async ({ db }) => {
            const f = await flag();
            await embedLibraryVersion({ db, version: f });
            const u = await version(
                UNIFORM,
                { sidecar: bytes("{}") },
                {
                    kind: "uniform",
                    name: "Home",
                    pins: [{ itemId: FLAG, versionHash: f.versionHash }],
                },
            );
            await embedLibraryVersion({ db, version: u });
            await pruneShowLibrary({ db, keep: [{ itemId: UNIFORM }] });
            expect(await rows(db)).toEqual({ items: 2, blobs: 3 });
        });

        it("leaves no orphan blobs", async ({ db }) => {
            await db
                .insert(schema.library_blobs)
                .values({ hash: "e".repeat(64), data: bytes("stray") })
                .run();
            await pruneShowLibrary({ db, keep: [] });
            expect(await rows(db)).toEqual({ items: 0, blobs: 0 });
        });

        it("keeps an item an undo or redo row names", async ({ db }) => {
            await embedLibraryVersion({ db, version: await rifle() });
            await embedLibraryVersion({ db, version: await flag() });
            // A cue table doesn't exist yet: stand in with a tag naming the item
            await transactionWithHistory(db, "nameRifle", async (tx) => {
                await tx.insert(schema.tags).values({ name: RIFLE }).run();
            });
            await transactionWithHistory(db, "deleteRifleTag", async (tx) => {
                await tx.delete(schema.tags).run();
            });

            expect(await libraryKeepsFromHistory({ db })).toEqual([
                { itemId: RIFLE },
            ]);
            await pruneShowLibrary({ db, keep: [] });
            expect(
                (await getShowLibraryItems({ db })).map((i) => i.itemId),
            ).toEqual([RIFLE]);

            // Undo moves the row to redo; the item is still kept
            await performUndo(db);
            await performUndo(db);
            expect(await libraryKeepsFromHistory({ db })).toEqual([
                { itemId: RIFLE },
            ]);
        });

        it("keeps the Versions cues name", async ({ db }) => {
            const r = await rifle();
            await embedLibraryVersion({ db, version: r });
            await embedLibraryVersion({ db, version: await flag() });
            // Outside history, so only the cue keeps the rifle
            await db.transaction((tx) =>
                createCuesInTransaction({
                    tx,
                    newCues: [
                        {
                            channel: "carry",
                            kind: "state",
                            target: { kind: "band" },
                            beatId: 0,
                            value: `library:${RIFLE}@${r.versionHash}`,
                        },
                    ],
                }),
            );

            expect(await libraryKeepsFromCues({ db })).toEqual([
                { itemId: RIFLE, versionHash: r.versionHash },
            ]);
            const plan = await pruneShowLibrary({ db, keep: [] });
            expect(plan.items.map((i) => i.itemId)).toEqual([FLAG]);
            expect(
                (await getShowLibraryItems({ db })).map((i) => i.itemId),
            ).toEqual([RIFLE]);
        });

        it("removes no blobs while a row can't be read", async ({ db }) => {
            await embedLibraryVersion({ db, version: await rifle() });
            await db
                .insert(schema.library_items)
                .values({
                    item_id: FLAG,
                    version_hash: "f".repeat(64),
                    kind: "artwork",
                    name: "Broken",
                    parts: "not json",
                    metadata: "{}",
                })
                .run();
            const plan = await pruneShowLibrary({ db, keep: [] });
            expect(plan.items.map((i) => i.itemId)).toEqual([RIFLE]);
            expect(plan.blobs).toEqual([]);
            expect(await rows(db)).toEqual({ items: 1, blobs: 2 });
        });

        it("doesn't write to undo history", async ({ db }) => {
            await embedLibraryVersion({ db, version: await rifle() });
            const before = await db.select().from(schema.history_undo).all();
            await pruneShowLibrary({ db, keep: [] });
            expect(await db.select().from(schema.history_undo).all()).toEqual(
                before,
            );
        });
    });
});
