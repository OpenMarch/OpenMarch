import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, "..");

type Journal = { entries: { idx: number; tag: string }[] };
const journal: Journal = JSON.parse(
    fs.readFileSync(path.join(migrationsDir, "meta/_journal.json"), "utf-8"),
);
const migrationTags = journal.entries
    .sort((a, b) => a.idx - b.idx)
    .map((e) => e.tag);

const HELD_MARKS_MIGRATION = migrationTags[30]!;

/** Runs one migration file the way `DrizzleMigrationService` does, foreign keys off. */
const runMigration = (db: DatabaseSync, tag: string) => {
    const statements = fs
        .readFileSync(path.join(migrationsDir, `${tag}.sql`), "utf-8")
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    for (const statement of statements) {
        db.exec("PRAGMA foreign_keys = OFF");
        db.exec(statement);
    }
    db.exec("PRAGMA foreign_keys = ON");
};

type Row = Record<string, unknown>;

/**
 * Migration 0030 adds the Held marks (holds, fork #472; ADR 0001 amendment 2026-10-30). It only
 * adds a table, so older files open with their rows untouched and an empty table. Its statements
 * are `IF NOT EXISTS`, like 0027's, so a test file given the table early can take it again.
 */
describe(`Migration ${HELD_MARKS_MIGRATION}`, () => {
    let db: DatabaseSync;
    let tempDir: string;
    const all = (statement: string) => db.prepare(statement).all() as Row[];
    const schemaOf = () =>
        all(
            "SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
        );

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "om-0030-"));
        db = new DatabaseSync(path.join(tempDir, "pre-0030.dots"));
        for (const tag of migrationTags.slice(0, 30)) runMigration(db, tag);
        db.exec(
            "INSERT INTO marchers (id, section, drill_prefix, drill_order) VALUES (1, 'Trumpet', 'T', 1), (2, 'Trumpet', 'T', 2)",
        );
    });

    afterEach(() => {
        db?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("adds only the Held marks table and its index, empty", () => {
        const before = schemaOf();
        runMigration(db, HELD_MARKS_MIGRATION);
        const after = schemaOf();
        const afterByName = new Map(after.map((r) => [r.name, r.sql]));
        expect(before.filter((r) => afterByName.get(r.name) !== r.sql)).toEqual(
            [],
        );
        const beforeNames = new Set(before.map((r) => r.name));
        expect(
            after.filter((r) => !beforeNames.has(r.name)).map((r) => r.name),
        ).toEqual([
            "timeline_held_marks",
            "timeline_held_marks_marcher_id_start_beat_unique",
        ]);
        expect(all("SELECT * FROM timeline_held_marks")).toEqual([]);
        // Running it again changes nothing
        runMigration(db, HELD_MARKS_MIGRATION);
        expect(schemaOf()).toEqual(after);
    });

    it("keeps a mark's counts, one start per marcher, ending after it starts", () => {
        runMigration(db, HELD_MARKS_MIGRATION);
        db.exec(
            "INSERT INTO timeline_held_marks (id, marcher_id, start_beat, end_beat) VALUES (7, 1, 17, 25), (8, 2, 17, 25)",
        );
        expect(
            all(
                "SELECT id, marcher_id, start_beat, end_beat FROM timeline_held_marks ORDER BY id",
            ),
        ).toEqual([
            { id: 7, marcher_id: 1, start_beat: 17, end_beat: 25 },
            { id: 8, marcher_id: 2, start_beat: 17, end_beat: 25 },
        ]);
        const refused = (values: string) => () =>
            db.exec(
                `INSERT INTO timeline_held_marks (marcher_id, start_beat, end_beat) VALUES ${values}`,
            );
        expect(refused("(1, 17, 33)")).toThrow(/UNIQUE constraint failed/);
        expect(refused("(1, 30, 30)")).toThrow(/constraint failed/);
        expect(refused("(1, -1, 4)")).toThrow(/constraint failed/);
        expect(refused("(1, 1.5, 4)")).toThrow(/constraint failed/);
    });

    it("goes with its marcher", () => {
        runMigration(db, HELD_MARKS_MIGRATION);
        db.exec(
            "INSERT INTO timeline_held_marks (marcher_id, start_beat, end_beat) VALUES (1, 17, 25), (2, 17, 25)",
        );
        db.exec("DELETE FROM marchers WHERE id = 1");
        expect(all("SELECT marcher_id FROM timeline_held_marks")).toEqual([
            { marcher_id: 2 },
        ]);
    });
});
