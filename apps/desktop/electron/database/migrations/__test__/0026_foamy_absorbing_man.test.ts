// @vitest-environment node
/**
 * Migration 0026 adds Artwork slot assignments (props-spec section 4, ADR 0002 D-10): the
 * beat-keyed `item_artwork_slots`. A new table only, `IF NOT EXISTS` so the migration can run
 * twice. Slot ids are letters, digits, underscores or dashes.
 * It comes after `0020_drop_page_era`, so a timeline file takes it on open and a page-era file
 * takes it in its conversion; it needs no `user_version` bump.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getOrm } from "../../db";
import { DrizzleMigrationService } from "../../services/DrizzleMigrationService";
import {
    applyFileVersionDecision,
    readUserVersion,
    TIMELINE_MODEL_USER_VERSION,
} from "../../fileVersion";
import { runConvertOnOpen, type ConvertOnOpenUi } from "../../convertOnOpen";
import {
    createPageShow,
    migrationsFolder,
    withDb,
} from "../../__test__/convertOnOpenFixtures";
import {
    migrationAt,
    rollBackMigrationsFrom,
} from "../../__test__/migrationRollback";

const SLOTS_MIGRATION = migrationAt(26);
const ARTWORK_ID = "11111111-1111-4111-8111-111111111111";
/** `0024_demonic_scream`, the Shape tool's migration on lab builds of #181 */
const SHAPE_LAB_MIGRATION_MS = 1792165936156;
/** The date fork builds gave this migration before it was re-dated */
const EARLIER_FORK_DATE = 1792169561480;
const ARTWORK_HASH = "a".repeat(64);

type Row = Record<string, string | number | null>;

const count = (db: DatabaseSync, table: string) =>
    Number(
        (
            db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as {
                n: number;
            }
        ).n,
    );

const tableNames = (db: DatabaseSync) =>
    (
        db
            .prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")
            .all() as { name: string }[]
    ).map((r) => r.name);

const migrate = async (db: DatabaseSync) => {
    applyFileVersionDecision(db, false);
    await new DrizzleMigrationService(getOrm(db), db).applyPendingMigrations(
        migrationsFolder,
    );
};

const ui: ConvertOnOpenUi = { whilePreparing: async (work) => work(() => {}) };

/**
 * Opens a file as `openShow` does: convert on open (the person agreed), the migrations, then the
 * undo triggers the renderer creates on every open.
 */
const open = async (filePath: string) => {
    const db = new DatabaseSync(filePath);
    try {
        const outcome = await runConvertOnOpen(filePath, db, ui, {
            confirmed: true,
            migrationsFolder,
            hooks: { now: () => new Date("2026-10-16T12:00:00.000Z") },
        });
        await migrate(db);
        const { createAllUndoTriggers } =
            await import("@/db-functions/history");
        await createAllUndoTriggers(getOrm(db) as never);
        return outcome;
    } finally {
        db.close();
    }
};

/**
 * A riser (item 1) with Artwork on its top from beat 3, fitted on its front from beat 5 with a
 * pad color, and its top left bare from beat 9.
 */
const insertAssignments = (db: DatabaseSync) => {
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(`
        INSERT INTO marchers (id, section, drill_prefix, drill_order, type)
            VALUES (100, 'Prop', 'P', 1, 'item');
        INSERT INTO items (id, marcher_id, kind, surface_type) VALUES (1, 100, 'prop', 'platform');
        INSERT INTO item_artwork_slots (id, item_id, beat_id, slot, library_item_id, library_version_hash)
            VALUES (1, 1, 3, 'top', '${ARTWORK_ID}', '${ARTWORK_HASH}');
        INSERT INTO item_artwork_slots (id, item_id, beat_id, slot, library_item_id, library_version_hash, fit, pad_color)
            VALUES (2, 1, 5, 'front', '${ARTWORK_ID}', '${ARTWORK_HASH}', 'fit', '#1a2b3c');
        INSERT INTO item_artwork_slots (id, item_id, beat_id, slot) VALUES (3, 1, 9, 'top');
    `);
};

describe(`Migration ${SLOTS_MIGRATION.tag}`, () => {
    let tempDir: string;
    let showPath: string;

    beforeEach(async () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "om-0026-"));
        showPath = path.join(tempDir, "show.dots");
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
        await createPageShow(showPath);
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    const hasSlots = (db: DatabaseSync) =>
        tableNames(db).includes("item_artwork_slots");

    it("leaves slot assignments out of a page-era file until it converts", async () => {
        const db = new DatabaseSync(showPath);
        try {
            await migrate(db);
            expect(hasSlots(db)).toBe(false);
        } finally {
            db.close();
        }
    });

    it("adds slot assignments when a page-era file converts, and keeps the show", async () => {
        await open(showPath);
        withDb(showPath, (db) => {
            expect(readUserVersion(db)).toBe(TIMELINE_MODEL_USER_VERSION);
            expect(hasSlots(db)).toBe(true);
            insertAssignments(db);
            expect(count(db, "item_artwork_slots")).toBeGreaterThan(0);
        });
    });

    it("opens a converted timeline file from before it: version 8 and the timeline are kept", async () => {
        await open(showPath);
        rollBackMigrationsFrom(showPath, SLOTS_MIGRATION.idx);
        const before = withDb(showPath, (db) => {
            expect(hasSlots(db)).toBe(false);
            return { assignments: count(db, "timeline_assignments") };
        });
        expect(before.assignments).toBeGreaterThan(0);

        expect(await open(showPath)).toMatchObject({ kind: "none" });

        withDb(showPath, (db) => {
            expect(readUserVersion(db)).toBe(TIMELINE_MODEL_USER_VERSION);
            expect(count(db, "timeline_assignments")).toBe(before.assignments);
            insertAssignments(db);
            expect(count(db, "item_artwork_slots")).toBeGreaterThan(0);
        });
    });

    it("runs again on a file that took it under an earlier date, keeping its rows", async () => {
        await open(showPath);
        rollBackMigrationsFrom(showPath, SLOTS_MIGRATION.idx + 1);
        const rows = withDb(showPath, (db) => {
            insertAssignments(db);
            db.prepare(
                "UPDATE __drizzle_migrations SET created_at = ? WHERE created_at = ?",
            ).run(EARLIER_FORK_DATE, SLOTS_MIGRATION.when);
            return count(db, "item_artwork_slots");
        });

        await open(showPath);

        withDb(showPath, (db) =>
            expect(count(db, "item_artwork_slots")).toBe(rows),
        );
    });

    it("comes to a file that took the Shape tool's lab migration (#181) first", async () => {
        expect(SLOTS_MIGRATION.when).toBeGreaterThan(SHAPE_LAB_MIGRATION_MS);
        await open(showPath);
        // A file from before the props migrations that a lab build of #181 opened
        rollBackMigrationsFrom(showPath, SLOTS_MIGRATION.idx - 2);
        withDb(showPath, (db) =>
            db
                .prepare(
                    "INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('0024_demonic_scream', ?)",
                )
                .run(SHAPE_LAB_MIGRATION_MS),
        );

        await open(showPath);

        withDb(showPath, (db) => {
            expect(hasSlots(db)).toBe(true);
            insertAssignments(db);
        });
    });

    describe("constraints", () => {
        let db: DatabaseSync;
        beforeEach(async () => {
            await open(showPath);
            db = new DatabaseSync(showPath);
            insertAssignments(db);
        });
        afterEach(() => db.close());

        const assignment = (columns: Row) => {
            const row: Row = {
                item_id: 1,
                beat_id: 7,
                slot: "back",
                library_item_id: ARTWORK_ID,
                library_version_hash: ARTWORK_HASH,
                ...columns,
            };
            const names = Object.keys(row);
            db.prepare(
                `INSERT INTO item_artwork_slots (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`,
            ).run(...Object.values(row));
        };

        it.each<[string, Row]>([
            ["no slot", { slot: null }],
            ["an empty slot", { slot: "" }],
            ["a slot with a space", { slot: "front panel" }],
            ["a slot with a dot", { slot: "panel.001" }],
            ["a slot with a bracket", { slot: "front]" }],
            ["a slot over 64 characters", { slot: "s".repeat(65) }],
            ["an Artwork id with no Version", { library_version_hash: null }],
            ["a Version with no Artwork id", { library_item_id: null }],
            ["a short Artwork id", { library_item_id: "abc" }],
            ["a short Version hash", { library_version_hash: "abc" }],
            ["no fit", { fit: null }],
            ["an unknown fit", { fit: "stretch" }],
            ["no pan", { pan_x: null }],
            ["no vertical pan", { pan_y: null }],
            ["a text pan", { pan_x: "left" }],
            ["a pan past the edge", { pan_x: 1.5 }],
            ["a vertical pan past the edge", { pan_y: -1.01 }],
            ["a pad color with no #", { pad_color: "1a2b3c" }],
            ["an upper-case pad color", { pad_color: "#1A2B3C" }],
            ["a short pad color", { pad_color: "#fff" }],
            ["a pad color with alpha", { pad_color: "#1a2b3c80" }],
            ["a pad color that isn't hex", { pad_color: "#gggggg" }],
            [
                "a second change on one slot and beat",
                { slot: "top", beat_id: 3 },
            ],
            ["a missing beat", { beat_id: 99999 }],
            ["a missing item", { item_id: 99 }],
        ])("rejects an assignment with %s", (_, columns) => {
            expect(() => assignment(columns)).toThrow();
        });

        it.each<[string, Row]>([
            ["filled, by default", {}],
            ["fitted with a pad color", { fit: "fit", pad_color: "#00ff7f" }],
            ["panned to both corners", { pan_x: -1, pan_y: 1 }],
            ["a model's slot id", { slot: "Panel_L2" }],
            ["the Blender add-on's dashed slot id", { slot: "front-panel" }],
            [
                "leaving the slot bare",
                { library_item_id: null, library_version_hash: null },
            ],
            ["on another slot on a used beat", { beat_id: 3 }],
        ])("accepts an assignment %s", (_, columns) => {
            expect(() => assignment(columns)).not.toThrow();
        });

        it("deletes a change with its beat, and every change with the item", () => {
            db.exec("DELETE FROM beats WHERE id = 3");
            expect(
                db
                    .prepare("SELECT id FROM item_artwork_slots ORDER BY id")
                    .all(),
            ).toEqual([{ id: 2 }, { id: 3 }]);
            db.exec("DELETE FROM marchers WHERE id = 100");
            expect(count(db, "item_artwork_slots")).toBe(0);
        });
    });
});
