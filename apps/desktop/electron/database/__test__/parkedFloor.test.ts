/**
 * Fork-only floor-model files (user_version 9, fork #285) get their field image back when they
 * open. The fixture is written the way #285's convert on open left a show: the image embedded
 * as a Base floor Artwork in `library_items` + `library_blobs`, named in
 * `field_properties.json_data` as `floor`, and `field_properties.image` set to NULL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getOrm } from "../db";
import { DrizzleMigrationService } from "../services/DrizzleMigrationService";
import { applyFileVersionDecision, readUserVersion } from "../fileVersion";
import { fieldImageOrParkedFloor } from "../parkedFloor";
import { createAllUndoTriggers } from "@/db-functions/historyTriggers";

const migrationsFolder = path.resolve(__dirname, "../migrations");

const ITEM_ID = "0f6b5a3e-8f1c-4c55-9d43-2f2a7c1d9e01";
/** Tiny stand-ins with the right signatures: a PNG, a PDF and a JPEG. */
const PNG = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
]);
const PDF = new TextEncoder().encode("%PDF-1.7 floor original");
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9]);

const sha256 = (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");

/** A migrated show at the timeline version, with the undo triggers an opened show has. */
async function createShow(filePath: string) {
    const db = new DatabaseSync(filePath);
    applyFileVersionDecision(db, true);
    const orm = getOrm(db);
    await new DrizzleMigrationService(orm, db).applyPendingMigrations(
        migrationsFolder,
    );
    await DrizzleMigrationService.initializeDatabase(orm, db);
    await createAllUndoTriggers(orm);
    return db;
}

/**
 * What #285's `installFloorInTransaction` wrote: blobs and the Version, `floor` in the JSON
 * (fill/fit and opacity left as they were), the legacy image cleared, user_version 9.
 */
function writeFloorLike285(
    db: DatabaseSync,
    parts: { original: Uint8Array; display: Uint8Array },
    { holdBlobs = true } = {},
) {
    const sidecar = new TextEncoder().encode('{"type":"openmarch-artwork"}');
    const hashes = {
        original: sha256(parts.original),
        display: sha256(parts.display),
        sidecar: sha256(sidecar),
    };
    if (holdBlobs)
        for (const [role, hash] of Object.entries(hashes))
            db.prepare(
                "INSERT OR IGNORE INTO library_blobs (hash, data) VALUES (?, ?)",
            ).run(
                hash,
                role === "sidecar"
                    ? sidecar
                    : parts[role as "original" | "display"],
            );
    const versionHash = "b".repeat(64);
    db.prepare(
        "INSERT INTO library_items (item_id, version_hash, kind, name, built_in, parts, metadata, sidecar) VALUES (?, ?, 'artwork', 'Field image', 0, ?, '{}', '{}')",
    ).run(ITEM_ID, versionHash, JSON.stringify(hashes));
    const json = JSON.parse(
        (
            db
                .prepare("SELECT json_data FROM field_properties WHERE id = 1")
                .get() as { json_data: string }
        ).json_data,
    );
    db.exec("DROP TRIGGER IF EXISTS field_properties_ut");
    db.prepare(
        "UPDATE field_properties SET json_data = ?, image = NULL WHERE id = 1",
    ).run(
        JSON.stringify({
            ...json,
            imageFillOrFit: "fill",
            backgroundImageOpacity: 0.6,
            showFieldImage: true,
            floor: { itemId: ITEM_ID, versionHash },
        }),
    );
    db.exec("PRAGMA user_version = 9");
}

const fieldRow = (db: DatabaseSync) =>
    db
        .prepare("SELECT json_data, image FROM field_properties WHERE id = 1")
        .get() as { json_data: string; image: Uint8Array | null };
const undoRows = (db: DatabaseSync) =>
    (
        db.prepare("SELECT count(*) AS n FROM history_undo").get() as {
            n: number;
        }
    ).n;
const fieldTriggers = (db: DatabaseSync) =>
    (
        db
            .prepare(
                "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'field_properties' ORDER BY name",
            )
            .all() as { name: string }[]
    ).map((t) => t.name);

describe("parked floor recovery (user_version 9)", () => {
    let tempDir: string;
    let db: DatabaseSync;

    beforeEach(async () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openmarch-floor-"));
        vi.spyOn(console, "log").mockImplementation(() => {});
        db = await createShow(path.join(tempDir, "show.dots"));
    });

    afterEach(() => {
        db.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("puts the floor's original back as the field image when it opens, outside undo history", () => {
        writeFloorLike285(db, { original: PNG, display: JPEG });
        const triggers = fieldTriggers(db);
        const undoBefore = undoRows(db);

        applyFileVersionDecision(db, false);

        expect(readUserVersion(db)).toBe(8);
        const row = fieldRow(db);
        expect(new Uint8Array(row.image!)).toEqual(PNG);
        const json = JSON.parse(row.json_data);
        expect(json.floor).toBeUndefined();
        expect(json).toMatchObject({
            imageFillOrFit: "fill",
            backgroundImageOpacity: 0.6,
            showFieldImage: true,
        });
        expect(undoRows(db)).toBe(undoBefore);
        expect(fieldTriggers(db)).toEqual(triggers);
    });

    it("uses the display texture when the original isn't a raster image (a PDF)", () => {
        writeFloorLike285(db, { original: PDF, display: JPEG });
        applyFileVersionDecision(db, false);
        expect(new Uint8Array(fieldRow(db).image!)).toEqual(JPEG);
    });

    it("leaves the field empty and warns when the show doesn't hold the floor's image", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        writeFloorLike285(
            db,
            { original: PNG, display: JPEG },
            { holdBlobs: false },
        );

        applyFileVersionDecision(db, false);

        expect(readUserVersion(db)).toBe(8);
        expect(fieldRow(db).image).toBeNull();
        expect(JSON.parse(fieldRow(db).json_data).floor).toBeUndefined();
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining("doesn't hold"),
        );
    });

    it("keeps a field image the file already has", () => {
        writeFloorLike285(db, { original: PNG, display: JPEG });
        db.exec("DROP TRIGGER IF EXISTS field_properties_ut");
        db.prepare("UPDATE field_properties SET image = ? WHERE id = 1").run(
            JPEG,
        );
        applyFileVersionDecision(db, false);
        expect(readUserVersion(db)).toBe(8);
        expect(new Uint8Array(fieldRow(db).image!)).toEqual(JPEG);
    });

    it("never touches a timeline file (8) that names no floor", () => {
        const before = fieldRow(db);
        applyFileVersionDecision(db, false);
        expect(readUserVersion(db)).toBe(8);
        expect(fieldRow(db)).toEqual(before);
    });

    it("gives New show from a previous .dots the floor's image, without writing", () => {
        writeFloorLike285(db, { original: PNG, display: JPEG });
        expect(fieldImageOrParkedFloor(db, null)).toEqual(PNG);
        expect(fieldImageOrParkedFloor(db, JPEG)).toEqual(JPEG);
        expect(readUserVersion(db)).toBe(9);
        expect(fieldRow(db).image).toBeNull();
    });
});
