// @vitest-environment node
/**
 * The web editor keeps a show's assets as the desktop app does (fork #997): its worker runs the
 * show on sqlite-wasm (`../sqlite.ts`) in memory, opens a file with the same steps as
 * `openShowAt` in `../index.ts` (this build's migrations), and saves and backs up the show as
 * `exportDatabase`'s bytes.
 *
 * - A show made on desktop, with an asset, opens in the web editor with the asset intact.
 * - An asset added in the web editor survives its export and opens on desktop, through the main
 *   process's open path, intact and under the same Version hash.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DatabaseSync as NodeDatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
    DatabaseSync as WebDatabaseSync,
    deleteDatabase,
    exportDatabase,
    loadSqlite,
    writeDatabase,
} from "../sqlite";
import { getOrm } from "@om-electron/database/db";
import { DrizzleMigrationService } from "@om-electron/database/services/DrizzleMigrationService";
import {
    createNewTimelineShow,
    migrationsFolder,
} from "@om-electron/database/__test__/convertOnOpenFixtures";
import type { DbConnection } from "@/db-functions/types";
import {
    addShowAssetInTransaction,
    getShowAsset,
    readShowAssetBlob,
    type NewShowAsset,
} from "@/db-functions/showAssets";
import type { ShowAssetRef } from "@/showAssets/ref";

const WEB_PATH = "/show-assets.dots";

function asset(seed: number): NewShowAsset {
    const glb = new Uint8Array(200_000);
    for (let i = 0; i < glb.length; i++) glb[i] = (i * seed) % 253;
    glb.set([0x67, 0x6c, 0x54, 0x46], 0);
    return {
        kind: "model",
        name: `Model ${seed}`,
        parts: { model: glb, thumbnail: new Uint8Array([0x89, seed]) },
        sidecar: { sizeM: { width: 1, depth: 1, height: seed / 10 } },
        credits: { license: "CC0-1.0" },
    };
}

const add = (db: DbConnection, a: NewShowAsset) =>
    db.transaction(
        async (tx) => (await addShowAssetInTransaction({ tx, asset: a })).ref,
    );

async function expectIntact(
    db: DbConnection,
    ref: ShowAssetRef,
    a: NewShowAsset,
) {
    const stored = await getShowAsset({ db, ref });
    expect(stored).toMatchObject({
        ...ref,
        name: a.name,
        sidecar: a.sidecar,
        credits: a.credits,
    });
    for (const [role, bytes] of Object.entries(a.parts)) {
        const read = await readShowAssetBlob({
            db,
            hash: stored!.parts[role]!,
        });
        expect(Buffer.from(read!).equals(Buffer.from(bytes)), role).toBe(true);
    }
}

/** Opens `bytes` in the web worker's sqlite-wasm, as `openShowAt` does an existing show. */
async function openInWeb(bytes: Uint8Array) {
    writeDatabase(WEB_PATH, bytes);
    const shim = new WebDatabaseSync(WEB_PATH);
    await new DrizzleMigrationService(
        getOrm(shim as never),
        shim as never,
    ).applyPendingMigrations(migrationsFolder);
    return { shim, db: getOrm(shim as never) as unknown as DbConnection };
}

beforeAll(async () => {
    await loadSqlite();
});

describe("show assets in the web editor", () => {
    let dir: string;

    afterEach(() => {
        deleteDatabase(WEB_PATH);
        if (dir) fs.rmSync(dir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    const tempDir = () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "om-web-assets-"));
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
        return dir;
    };

    it("opens a desktop show's asset intact", async () => {
        const desktopPath = path.join(tempDir(), "desktop.dots");
        await createNewTimelineShow(desktopPath);
        const desktop = new NodeDatabaseSync(desktopPath);
        const ref = await add(
            getOrm(desktop) as unknown as DbConnection,
            asset(7),
        );
        desktop.close();

        const { shim, db } = await openInWeb(
            new Uint8Array(fs.readFileSync(desktopPath)),
        );
        try {
            await expectIntact(db, ref, asset(7));
        } finally {
            shim.close();
        }
    });

    it("keeps an asset added in the browser through its backup, and desktop opens it", async () => {
        const desktopPath = path.join(tempDir(), "made-on-web.dots");
        await createNewTimelineShow(desktopPath);
        const { shim, db } = await openInWeb(
            new Uint8Array(fs.readFileSync(desktopPath)),
        );
        let ref: ShowAssetRef;
        try {
            ref = await add(db, asset(11));
            // The same content again, as a second import: one Version, bytes stored once
            expect(await add(db, asset(11))).toEqual(ref);
        } finally {
            shim.close();
        }

        // Backing up downloads the export; autosave stores the same bytes in OPFS
        const backup = exportDatabase(WEB_PATH);
        const received = path.join(dir, "received.dots");
        fs.writeFileSync(received, backup);

        const desktop = new NodeDatabaseSync(received);
        try {
            await new DrizzleMigrationService(
                getOrm(desktop),
                desktop,
            ).applyPendingMigrations(migrationsFolder);
            const desktopDb = getOrm(desktop) as unknown as DbConnection;
            await expectIntact(desktopDb, ref, asset(11));
            // The desktop app names the same content with the same Version
            expect(await add(desktopDb, asset(11))).toEqual(ref);
            expect(
                (
                    desktop
                        .prepare("SELECT count(*) AS n FROM show_asset_blobs")
                        .get() as { n: number }
                ).n,
            ).toBe(2);
        } finally {
            desktop.close();
        }

        // And the web editor reopens its own backup
        deleteDatabase(WEB_PATH);
        const again = await openInWeb(backup);
        try {
            await expectIntact(again.db, ref, asset(11));
        } finally {
            again.shim.close();
        }
    });
});
