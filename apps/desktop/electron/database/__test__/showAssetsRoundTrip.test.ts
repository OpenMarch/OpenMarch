// @vitest-environment node
/**
 * A show's assets survive save, open and email on desktop (fork #997; ADR 0010 amendment
 * 2026-11-15).
 *
 * Every file goes through the main process's open path (`openShowFile`), and the editor writes
 * and reads through its own SQL callbacks (`createRendererSqlCallbacks`) to the IPC handlers
 * (`handleSqlProxy`, `handleSqlReadBatch`), with every message structured-cloned as Electron's IPC
 * does. "Email" is the file's bytes copied somewhere else; "Save Copy" is the menu's `VACUUM INTO`.
 *
 * - A new show, and a v0.1.7 show converted on open, keep an asset's bytes, sidecar and credits
 *   through closing, Save Copy, copying the file, and opening it again.
 * - Nothing removes an asset nothing uses: not saving, closing, Save Copy or opening.
 * - The 3D View window reads the bytes through its read-only snapshot reads.
 * - A build without this store (migrations up to 0022) opens the file, keeps the tables and their
 *   rows untouched, and draws the prop whose model it can't name as a block.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "../migrations/schema";
import * as DatabaseServices from "../database.services";
import { openShowFile } from "@om-electron/main/openShow";
import type { ConvertOnOpenDialogs } from "@om-electron/main/convertOnOpenFlow";
import { createRendererSqlCallbacks } from "@/global/database/rendererSql";
import type { DbConnection } from "@/db-functions/types";
import {
    addShowAssetInTransaction,
    getShowAsset,
    getShowAssets,
    readShowAssetBlob,
    type NewShowAsset,
} from "@/db-functions/showAssets";
import { createShowBlobCache } from "@/showAssets/blobCache";
import { parseShowAssetRef, showAssetRefValue } from "@/showAssets/ref";
import type { ShowAssetRef } from "@/showAssets/ref";
import { pitModelName } from "@/view3d/core/pit/pitModels";
import {
    createNewTimelineShow,
    migrationsFolder,
} from "./convertOnOpenFixtures";

const V017_SMALL = path.resolve(__dirname, "v017-files/small.dots");

/** A model's parts, a few hundred KB, so the bytes span many database pages. */
function modelAsset(): NewShowAsset {
    const glb = new Uint8Array(300_000);
    for (let i = 0; i < glb.length; i++) glb[i] = (i * 7919) % 251;
    glb.set([0x67, 0x6c, 0x54, 0x46], 0);
    return {
        kind: "model",
        name: "Speaker stack",
        parts: {
            model: glb,
            distant: glb.subarray(0, 20_000),
            thumbnail: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]),
        },
        sidecar: {
            sizeM: { width: 0.6, depth: 0.5, height: 1.8 },
            facing: "front",
            outline: [
                [-0.3, -0.25],
                [0.3, -0.25],
                [0.3, 0.25],
                [-0.3, 0.25],
            ],
            triangles: 2400,
        },
        credits: { license: "CC0-1.0", author: "A designer", source: "test" },
    };
}

const noDialogs: ConvertOnOpenDialogs = {
    whilePreparing: async (work) => work(undefined),
    backupFailed: async () => {},
    conversionFailed: async () => {},
};

/** Opens `filePath` as the app does, with this build's migrations or `folder`. */
async function open(filePath: string, folder = migrationsFolder) {
    const result = await openShowFile(
        filePath,
        false,
        { migrationsFolder: folder, dialogs: () => noDialogs },
        { conversionConfirmed: true },
    );
    expect(result.status).toBe(200);
    result.db?.close();
    if (result.sqlSuspension !== undefined)
        DatabaseServices.resumeSqlProxy(result.sqlSuspension);
}

/** The editor's database: its SQL callbacks over the IPC handlers, structured-cloned both ways. */
function editorDb(): DbConnection {
    const { proxy, batch } = createRendererSqlCallbacks(() => ({
        kind: "editor",
        sqlProxy: async (sql, params, method) =>
            structuredClone(
                await DatabaseServices.handleSqlProxy(
                    undefined,
                    sql,
                    structuredClone(params),
                    method,
                ),
            ),
        sqlReadBatch: async (queries) =>
            structuredClone(
                DatabaseServices.handleSqlReadBatch(structuredClone(queries)),
            ),
    }));
    return drizzle(proxy, batch, {
        schema,
        casing: "snake_case",
    }) as unknown as DbConnection;
}

/** The 3D View window's database: only snapshot reads (`sqlReadBatch`). */
function view3dDb(): DbConnection {
    const { proxy, batch } = createRendererSqlCallbacks(() => ({
        kind: "view3d",
        sqlReadBatch: async (queries) =>
            structuredClone(
                DatabaseServices.handleSqlReadBatch(structuredClone(queries)),
            ),
    }));
    return drizzle(proxy, batch, {
        schema,
        casing: "snake_case",
    }) as unknown as DbConnection;
}

/** Closes the show as the app does when it quits or opens another. */
function close() {
    DatabaseServices.closePersistentConnection();
    DatabaseServices.setDbPath("", false);
}

/** Adds the asset and a prop that uses it, as an import would. */
async function importAsset(db: DbConnection): Promise<ShowAssetRef> {
    return await db.transaction(async (tx) => {
        const { ref } = await addShowAssetInTransaction({
            tx,
            asset: modelAsset(),
        });
        await tx
            .insert(schema.marchers)
            .values({
                id: 9001,
                type: "item",
                section: "Item",
                drill_prefix: "I",
                drill_order: 1,
            })
            .run();
        await tx
            .insert(schema.items)
            .values({
                marcher_id: 9001,
                kind: "prop",
                surface_type: "obstacle",
                model: showAssetRefValue(ref),
            })
            .run();
        return ref;
    });
}

/** Checks the show holds `ref` exactly as imported, read through `db` and the blob cache. */
async function expectAssetIntact(db: DbConnection, ref: ShowAssetRef) {
    const original = modelAsset();
    const asset = await getShowAsset({ db, ref });
    expect(asset).toMatchObject({
        ...ref,
        kind: "model",
        name: original.name,
        sidecar: original.sidecar,
        credits: original.credits,
    });
    const cache = createShowBlobCache({
        read: async (hash) => await readShowAssetBlob({ db, hash }),
    });
    for (const [role, bytes] of Object.entries(original.parts)) {
        const read = await cache.get(asset!.parts[role]!);
        expect(read, role).toBeInstanceOf(Uint8Array);
        expect(Buffer.from(read!).equals(Buffer.from(bytes)), role).toBe(true);
    }
    const model = await db
        .select({ model: schema.items.model })
        .from(schema.items)
        .all();
    expect(model.map((m) => parseShowAssetRef(m.model))).toEqual([ref]);
}

const assetTablesOf = (filePath: string) => {
    const db = new DatabaseSync(filePath, { readOnly: true });
    try {
        return {
            assets: db
                .prepare(
                    "SELECT id, version_hash, kind, name, parts, sidecar, credits FROM show_assets ORDER BY rowid",
                )
                .all(),
            blobs: db
                .prepare(
                    "SELECT hash, length(data) AS size FROM show_asset_blobs ORDER BY hash",
                )
                .all(),
            migrations: (
                db
                    .prepare("SELECT count(*) AS n FROM __drizzle_migrations")
                    .get() as { n: number }
            ).n,
        };
    } finally {
        db.close();
    }
};

describe("show assets round-trip on desktop", () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "om-show-assets-"));
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
    });

    afterEach(() => {
        DatabaseServices.forceResumeSqlProxy();
        close();
        fs.rmSync(dir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("a new show keeps its asset through close, Save Copy, email and open", async () => {
        const showPath = path.join(dir, "show.dots");
        await createNewTimelineShow(showPath);
        await open(showPath);
        const ref = await importAsset(editorDb());
        await expectAssetIntact(editorDb(), ref);
        // The 3D View window reads it too
        await expectAssetIntact(view3dDb(), ref);

        // Save Copy, as the File menu does it, then close
        const copyPath = path.join(dir, "show copy.dots");
        DatabaseServices.connect().prepare("VACUUM INTO ?").run(copyPath);
        close();

        // Email: the copy's bytes arrive on another machine
        const otherMachine = fs.mkdtempSync(path.join(dir, "other-"));
        const received = path.join(otherMachine, "show.dots");
        fs.writeFileSync(received, fs.readFileSync(copyPath));
        await open(received);
        await expectAssetIntact(editorDb(), ref);
        close();

        // And the original, opened again
        await open(showPath);
        await expectAssetIntact(editorDb(), ref);
        expect(assetTablesOf(showPath).assets).toEqual(
            assetTablesOf(received).assets,
        );
    });

    it("a v0.1.7 show, converted on open, keeps an asset added after", async () => {
        const showPath = path.join(dir, "small.dots");
        fs.copyFileSync(V017_SMALL, showPath);
        await open(showPath);
        const ref = await importAsset(editorDb());
        close();

        const received = path.join(dir, "small (received).dots");
        fs.copyFileSync(showPath, received);
        await open(received);
        await expectAssetIntact(editorDb(), ref);
    });

    it("never removes an asset nothing uses", async () => {
        const showPath = path.join(dir, "show.dots");
        await createNewTimelineShow(showPath);
        await open(showPath);
        const db = editorDb();
        const ref = await importAsset(db);
        // Nothing uses it any more
        await db.update(schema.items).set({ model: null }).run();
        const copyPath = path.join(dir, "copy.dots");
        DatabaseServices.connect().prepare("VACUUM INTO ?").run(copyPath);
        close();

        for (const file of [showPath, copyPath]) {
            await open(file);
            expect(
                (await getShowAssets({ db: editorDb() })).map((a) => a.id),
            ).toEqual([ref.id]);
            close();
            expect(assetTablesOf(file).blobs).toHaveLength(3);
        }
    });

    it("a build without the store opens the file, keeps the assets, and draws the prop as a block", async () => {
        const showPath = path.join(dir, "show.dots");
        await createNewTimelineShow(showPath);
        await open(showPath);
        const ref = await importAsset(editorDb());
        close();
        const before = assetTablesOf(showPath);

        // That build's migrations: everything up to 0022_cues
        const olderFolder = path.join(dir, "migrations-0022");
        fs.cpSync(migrationsFolder, olderFolder, { recursive: true });
        const journalPath = path.join(olderFolder, "meta", "_journal.json");
        const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
            entries: { tag: string }[];
        };
        const newer = journal.entries.filter((e) => e.tag >= "0023");
        expect(newer.map((e) => e.tag)).toContain("0023_show_assets");
        for (const entry of newer)
            fs.rmSync(path.join(olderFolder, `${entry.tag}.sql`));
        journal.entries = journal.entries.filter((e) => !newer.includes(e));
        fs.writeFileSync(journalPath, JSON.stringify(journal));

        await open(showPath, olderFolder);
        // It reads the prop's model, which names no model it ships: a block (as for #926's ids)
        const models = await editorDb()
            .select({ model: schema.items.model })
            .from(schema.items)
            .all();
        expect(models.map((m) => m.model)).toEqual([showAssetRefValue(ref)]);
        expect(pitModelName(models[0]!.model)).toBeNull();
        close();

        // Nothing in the store changed, and opening it in this build again has it whole
        expect(assetTablesOf(showPath)).toEqual(before);
        await open(showPath);
        await expectAssetIntact(editorDb(), ref);
    });
});
