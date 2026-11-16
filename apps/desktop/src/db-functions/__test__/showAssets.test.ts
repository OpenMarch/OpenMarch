import { describe, expect } from "vitest";
import { count, eq, sql } from "drizzle-orm";
import { describeDbTests, schema, type DbConnection } from "@/test/base";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import { createItems, updateItemsInTransaction } from "../items";
import {
    addShowAssetInTransaction,
    getShowAsset,
    getShowAssets,
    readShowAssetBlob,
    setShowAssetCreditsInTransaction,
    type NewShowAsset,
} from "../showAssets";
import { sha256Hex } from "@/showAssets/hash";
import { parseShowAssetRef, showAssetRefValue } from "@/showAssets/ref";

/**
 * The show asset store (ADR 0010 amendment 2026-11-15, "Verification": store and undo tests).
 */

const bytes = (...values: number[]) => new Uint8Array(values);
const GLB = bytes(0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 1, 2, 3);
const DISTANT = bytes(0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 9);
const THUMB = bytes(0x89, 0x50, 0x4e, 0x47, 7);

const marimba = (over: Partial<NewShowAsset> = {}): NewShowAsset => ({
    kind: "model",
    name: "Marimba",
    parts: { model: GLB, distant: DISTANT, thumbnail: THUMB },
    sidecar: { sizeM: { width: 2.4, depth: 0.9, height: 1 }, triangles: 1200 },
    credits: { license: "CC0-1.0", author: "Someone" },
    ...over,
});

const add = (db: DbConnection, asset: NewShowAsset) =>
    db.transaction(async (tx) => addShowAssetInTransaction({ tx, asset }));

const blobCount = async (db: DbConnection) =>
    (await db.select({ c: count() }).from(schema.show_asset_blobs).get())!.c;
const assetCount = async (db: DbConnection) =>
    (await db.select({ c: count() }).from(schema.show_assets).get())!.c;

describeDbTests("showAssets", (it) => {
    describe("addShowAssetInTransaction", () => {
        it("stores the parts by hash and reads the asset back", async ({
            db,
        }) => {
            const { ref, added } = await add(db, marimba());
            expect(added).toBe(true);
            expect(ref.id).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
            );

            const asset = await getShowAsset({ db, ref });
            expect(asset).toMatchObject({
                ...ref,
                kind: "model",
                name: "Marimba",
                sidecar: marimba().sidecar,
                credits: marimba().credits,
                parts: {
                    model: await sha256Hex(GLB),
                    distant: await sha256Hex(DISTANT),
                    thumbnail: await sha256Hex(THUMB),
                },
            });
            for (const [role, data] of Object.entries(marimba().parts))
                expect(
                    Array.from(
                        (await readShowAssetBlob({
                            db,
                            hash: asset!.parts[role]!,
                        }))!,
                    ),
                ).toEqual(Array.from(data));
        });

        it("stores identical bytes once, across assets and parts", async ({
            db,
        }) => {
            await add(db, marimba());
            // A second asset sharing the thumbnail, with its distant part the same bytes as its model
            await add(
                db,
                marimba({
                    name: "Vibraphone",
                    parts: {
                        model: DISTANT,
                        distant: DISTANT,
                        thumbnail: THUMB,
                    },
                }),
            );
            expect(await assetCount(db)).toBe(2);
            expect(await blobCount(db)).toBe(3);
        });

        it("reuses the Version when the same content comes in again", async ({
            db,
        }) => {
            const first = await add(db, marimba());
            const again = await add(
                db,
                marimba({
                    name: "Marimba (again)",
                    credits: { license: "CC-BY-4.0" },
                    // Same sidecar, keys in another order
                    sidecar: {
                        triangles: 1200,
                        sizeM: { height: 1, depth: 0.9, width: 2.4 },
                    },
                }),
            );
            expect(again).toEqual({ ref: first.ref, added: false });
            expect(await assetCount(db)).toBe(1);
            // What was stored stays
            expect((await getShowAsset({ db, ref: first.ref }))?.name).toBe(
                "Marimba",
            );
        });

        it("doesn't merge equal bytes of another kind", async ({ db }) => {
            const model = await add(db, marimba());
            const other = await add(db, marimba({ kind: "artwork" }));
            expect(other.added).toBe(true);
            expect(other.ref.versionHash).toBe(model.ref.versionHash);
            expect(other.ref.id).not.toBe(model.ref.id);
            expect(await blobCount(db)).toBe(3);
        });

        it("adds a new Version of an asset under its id", async ({ db }) => {
            const first = await add(db, marimba());
            const second = await add(
                db,
                marimba({ id: first.ref.id, sidecar: { triangles: 800 } }),
            );
            expect(second.added).toBe(true);
            expect(second.ref.id).toBe(first.ref.id);
            expect(second.ref.versionHash).not.toBe(first.ref.versionHash);
            expect(
                (await getShowAssets({ db })).map((a) => a.versionHash),
            ).toEqual([first.ref.versionHash, second.ref.versionHash]);
        });

        it("refuses a Version of an asset under another kind", async ({
            db,
        }) => {
            const model = await add(db, marimba());
            await expect(
                add(
                    db,
                    marimba({
                        id: model.ref.id,
                        kind: "artwork",
                        sidecar: { triangles: 1 },
                    }),
                ),
            ).rejects.toThrow(/is a model, not a artwork/);
            expect(await assetCount(db)).toBe(1);
        });

        it("a re-import puts back bytes a damaged file lost or changed", async ({
            db,
        }) => {
            const { ref } = await add(db, marimba());
            const glbHash = await sha256Hex(GLB);
            const thumbHash = await sha256Hex(THUMB);
            await db.run(
                sql`DELETE FROM show_asset_blobs WHERE hash = ${glbHash}`,
            );
            await db.run(
                sql`UPDATE show_asset_blobs SET data = x'00' WHERE hash = ${thumbHash}`,
            );

            expect(await add(db, marimba())).toEqual({ ref, added: false });
            expect(
                Array.from((await readShowAssetBlob({ db, hash: glbHash }))!),
            ).toEqual(Array.from(GLB));
            expect(
                Array.from((await readShowAssetBlob({ db, hash: thumbHash }))!),
            ).toEqual(Array.from(THUMB));
            expect(await blobCount(db)).toBe(3);
        });

        it("names the Version by its parts and sidecar, never its name or credits", async ({
            db,
        }) => {
            const a = await add(db, marimba());
            const renamed = await add(
                db,
                marimba({ id: "other", name: "Renamed", credits: {} }),
            );
            expect(renamed.ref.versionHash).toBe(a.ref.versionHash);
            const resized = await add(
                db,
                marimba({ id: "other", sidecar: { triangles: 1 } }),
            );
            expect(resized.ref.versionHash).not.toBe(a.ref.versionHash);
        });

        it("keeps any kind, for kinds this build doesn't know", async ({
            db,
        }) => {
            const { ref } = await add(
                db,
                marimba({ kind: "uniform-garment", sidecar: {} }),
            );
            expect((await getShowAsset({ db, ref }))?.kind).toBe(
                "uniform-garment",
            );
        });

        it("refuses what it couldn't store or name", async ({ db }) => {
            await expect(add(db, marimba({ parts: {} }))).rejects.toThrow(
                /at least one part/,
            );
            await expect(
                add(db, marimba({ parts: { sidecar: GLB } })),
            ).rejects.toThrow(/part role/);
            await expect(
                add(db, marimba({ parts: { "Model File": GLB } })),
            ).rejects.toThrow(/part role/);
            await expect(add(db, marimba({ id: "a@b" }))).rejects.toThrow(/id/);
            await expect(add(db, marimba({ kind: "" }))).rejects.toThrow(
                /kind/,
            );
            await expect(
                add(db, marimba({ sidecar: { bad: Number.NaN } })),
            ).rejects.toThrow(/number/);
            expect(await assetCount(db)).toBe(0);
            expect(await blobCount(db)).toBe(0);
        });
    });

    describe("credits", () => {
        it("change without changing the Version", async ({ db }) => {
            const { ref } = await add(db, marimba());
            const changed = await db.transaction((tx) =>
                setShowAssetCreditsInTransaction({
                    tx,
                    ref,
                    credits: { license: "CC-BY-4.0", author: "Fixed" },
                }),
            );
            expect(changed).toBe(true);
            const asset = await getShowAsset({ db, ref });
            expect(asset?.versionHash).toBe(ref.versionHash);
            expect(asset?.credits).toEqual({
                license: "CC-BY-4.0",
                author: "Fixed",
            });
            expect(
                await db.transaction((tx) =>
                    setShowAssetCreditsInTransaction({
                        tx,
                        ref: { ...ref, id: "missing" },
                        credits: {},
                    }),
                ),
            ).toBe(false);
        });
    });

    describe("reading", () => {
        it("skips a row that doesn't parse, and reads the rest", async ({
            db,
        }) => {
            const { ref } = await add(db, marimba());
            // A row a damaged file might have: parts naming something that isn't a hash
            await db.run(
                sql`INSERT INTO show_assets (id, version_hash, kind, name, parts) VALUES ('bad', ${"c".repeat(64)}, 'model', 'Bad', '{"model":"nope"}')`,
            );
            const warn = console.warn;
            console.warn = () => {};
            try {
                expect((await getShowAssets({ db })).map((a) => a.id)).toEqual([
                    ref.id,
                ]);
            } finally {
                console.warn = warn;
            }
        });

        it("reads a blob the show doesn't have as undefined", async ({
            db,
        }) => {
            expect(
                await readShowAssetBlob({ db, hash: "d".repeat(64) }),
            ).toBeUndefined();
        });
    });

    describe("undo history", () => {
        it("neither table has history triggers", async ({ db }) => {
            const triggers = await db.all<{ name: string }>(
                sql`SELECT name FROM sqlite_schema WHERE type = 'trigger' AND tbl_name IN ('show_assets', 'show_asset_blobs')`,
            );
            expect(triggers).toEqual([]);
            // The fixture does have them on undoable tables
            const itemTriggers = await db.all<{ name: string }>(
                sql`SELECT name FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = 'items'`,
            );
            expect(itemTriggers.length).toBeGreaterThan(0);
        });

        it("setting and clearing a prop's model undo and redo as one items change, keeping the asset", async ({
            db,
            marchersAndPages: _,
        }) => {
            const beats = await db
                .select({ id: schema.beats.id })
                .from(schema.beats)
                .orderBy(schema.beats.position)
                .all();
            const [item] = await createItems({
                db,
                newItems: [
                    {
                        kind: "prop",
                        surfaceType: "obstacle",
                        home: [100, 100],
                        beatId: beats[0]!.id,
                        geometry: {
                            outlineType: "rectangle",
                            width: 2,
                            depth: 1,
                        },
                    },
                ],
            });
            const modelOf = async () =>
                (
                    await db
                        .select({ model: schema.items.model })
                        .from(schema.items)
                        .where(eq(schema.items.id, item!.id))
                        .get()
                )?.model;

            const ref = await transactionWithHistory(
                db,
                "importModel",
                async (tx) => {
                    const { ref } = await addShowAssetInTransaction({
                        tx,
                        asset: marimba(),
                    });
                    await updateItemsInTransaction({
                        tx,
                        modifiedItems: [
                            { itemId: item!.id, model: showAssetRefValue(ref) },
                        ],
                    });
                    return ref;
                },
            );
            expect(parseShowAssetRef(await modelOf())).toEqual(ref);

            // History names only the item
            const undoSql = await db.all<{ sql: string }>(
                sql`SELECT sql FROM history_undo`,
            );
            expect(undoSql.some((r) => /show_asset/.test(r.sql))).toBe(false);

            await performUndo(db);
            expect(await modelOf()).toBeNull();
            expect(await getShowAsset({ db, ref })).toBeDefined();
            expect(await blobCount(db)).toBe(3);

            await performRedo(db);
            expect(parseShowAssetRef(await modelOf())).toEqual(ref);
            expect(await assetCount(db)).toBe(1);

            // Clearing the model is one items change too, and also keeps the asset
            await transactionWithHistory(db, "clearModel", (tx) =>
                updateItemsInTransaction({
                    tx,
                    modifiedItems: [{ itemId: item!.id, model: null }],
                }),
            );
            expect(await modelOf()).toBeNull();
            expect(await getShowAsset({ db, ref })).toBeDefined();
            await performUndo(db);
            expect(parseShowAssetRef(await modelOf())).toEqual(ref);
            await performRedo(db);
            expect(await modelOf()).toBeNull();
            expect(await assetCount(db)).toBe(1);
            expect(await blobCount(db)).toBe(3);
        });
    });
});
