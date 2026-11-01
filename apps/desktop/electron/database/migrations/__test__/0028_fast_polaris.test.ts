// @vitest-environment node
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

const SAVED_SHAPES_MIGRATION = migrationTags[28]!;

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
 * Migration 0028 adds the show's copies of saved shapes (ADR 0006, saved shapes; #353). It only
 * adds a table with no history triggers, so older files open with their rows untouched.
 */
describe(`Migration ${SAVED_SHAPES_MIGRATION}`, () => {
    let db: DatabaseSync;
    let tempDir: string;
    const all = (statement: string) => db.prepare(statement).all() as Row[];
    const schemaOf = () =>
        all(
            "SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
        );

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "om-0028-"));
        db = new DatabaseSync(path.join(tempDir, "pre-0028.dots"));
        for (const tag of migrationTags.slice(0, 28)) runMigration(db, tag);
    });

    afterEach(() => {
        db?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("adds only the saved shapes table", () => {
        const before = schemaOf();
        runMigration(db, SAVED_SHAPES_MIGRATION);
        const after = schemaOf();
        const afterByName = new Map(after.map((r) => [r.name, r.sql]));
        expect(before.filter((r) => afterByName.get(r.name) !== r.sql)).toEqual(
            [],
        );
        const beforeNames = new Set(before.map((r) => r.name));
        expect(
            after.filter((r) => !beforeNames.has(r.name)).map((r) => r.name),
        ).toEqual(["saved_shapes"]);
    });

    it("keeps a saved shape by its id, with JSON intervals", () => {
        runMigration(db, SAVED_SHAPES_MIGRATION);
        db.exec(
            `INSERT INTO saved_shapes (id, name, kind, kind_version, intervals) VALUES ('a', 'Wide box', 'block', 1, '{"across":3,"deep":2}')`,
        );
        expect(
            all(
                "SELECT id, name, kind, kind_version, intervals, description, distribution FROM saved_shapes",
            ),
        ).toEqual([
            {
                id: "a",
                name: "Wide box",
                kind: "block",
                kind_version: 1,
                intervals: '{"across":3,"deep":2}',
                description: null,
                distribution: null,
            },
        ]);
        expect(() =>
            db.exec(
                "INSERT INTO saved_shapes (id, name, kind, kind_version, intervals) VALUES ('b', 'Bad', 'block', 1, 'nope')",
            ),
        ).toThrow(/constraint failed/);
    });

    it("keeps a description, a JSON distribution and the created and updated dates", () => {
        runMigration(db, SAVED_SHAPES_MIGRATION);
        db.exec(
            `INSERT INTO saved_shapes (id, name, kind, kind_version, intervals, description, distribution, created_at, updated_at)
             VALUES ('a', 'Block', 'block', 1, '{"across":2,"deep":2}', 'Opener', '{"mode":"files","layout":{"family":"shortBack","byFile":false},"stagger":[1,2]}', '2026-10-01T10:00:00.000Z', '2026-10-02T10:00:00.000Z')`,
        );
        expect(
            all(
                "SELECT description, distribution, created_at, updated_at FROM saved_shapes",
            ),
        ).toEqual([
            {
                description: "Opener",
                distribution:
                    '{"mode":"files","layout":{"family":"shortBack","byFile":false},"stagger":[1,2]}',
                created_at: "2026-10-01T10:00:00.000Z",
                updated_at: "2026-10-02T10:00:00.000Z",
            },
        ]);
        expect(() =>
            db.exec(
                "INSERT INTO saved_shapes (id, name, kind, kind_version, intervals, distribution) VALUES ('b', 'Bad', 'block', 1, '{}', 'nope')",
            ),
        ).toThrow(/constraint failed/);
    });

    it("dates a saved shape written without dates", () => {
        runMigration(db, SAVED_SHAPES_MIGRATION);
        db.exec(
            `INSERT INTO saved_shapes (id, name, kind, kind_version, intervals) VALUES ('a', 'Box', 'block', 1, '{}')`,
        );
        const [row] = all("SELECT created_at, updated_at FROM saved_shapes");
        expect(row!.created_at).toMatch(/^\d{4}-\d{2}-\d{2} /);
        expect(row!.updated_at).toBe(row!.created_at);
    });
});
