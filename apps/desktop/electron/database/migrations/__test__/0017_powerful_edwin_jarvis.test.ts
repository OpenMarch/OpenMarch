// cspell:words rootpage
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, "..");

/** The journal's migration tags, in order (e.g. `0017_powerful_edwin_jarvis`). */
const migrationTags: string[] = (
    JSON.parse(
        fs.readFileSync(
            path.join(migrationsDir, "meta/_journal.json"),
            "utf-8",
        ),
    ) as { entries: { idx: number; tag: string }[] }
).entries
    .sort((a, b) => a.idx - b.idx)
    .map((e) => e.tag);

const TIMELINE_MIGRATION = migrationTags[17];

/**
 * Runs one migration file the way `DrizzleMigrationService` does: statement by statement, each
 * with foreign keys off, then turns them back on.
 */
const runMigration = (db: DatabaseSync, tag: string) => {
    const migrationSql = fs.readFileSync(
        path.join(migrationsDir, `${tag}.sql`),
        "utf-8",
    );
    const statements = migrationSql
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    for (const statement of statements) {
        try {
            db.exec("PRAGMA foreign_keys = OFF");
            db.exec(statement);
        } catch (error) {
            throw new Error(
                `${tag}: failed to execute ${statement.substring(0, 100)}...: ${error}`,
            );
        }
    }
    db.exec("PRAGMA foreign_keys = ON");
};

type Row = Record<string, unknown>;

/**
 * Migration 0017 adds the timeline tables and the marcher home columns (C-5). The home columns
 * are added with ALTER TABLE, not drizzle-kit's table rebuild, so an existing file keeps its
 * marchers and everything that references them.
 */
describe(`Migration ${TIMELINE_MIGRATION}`, () => {
    let db: DatabaseSync;
    let tempDir: string;

    const all = (statement: string) => db.prepare(statement).all() as Row[];
    const marchersSchema = () =>
        db
            .prepare(
                "SELECT sql, rootpage FROM sqlite_schema WHERE type = 'table' AND name = 'marchers'",
            )
            .get() as { sql: string; rootpage: number };

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "om-0017-"));
        db = new DatabaseSync(path.join(tempDir, "pre-0017.dots"));
        // A file at the state just before 0017
        for (const tag of migrationTags.slice(0, 17)) runMigration(db, tag);

        // Marchers, and rows in every table that references them
        db.exec(`
            INSERT INTO beats (id, duration, position) VALUES (1, 0.5, 1), (2, 0.5, 2);
            INSERT INTO pages (id, start_beat) VALUES (1, 1), (2, 2);
            INSERT INTO marchers (id, name, section, drill_prefix, drill_order) VALUES
                (1, 'A', 'Brass', 'B', 1), (2, NULL, 'Brass', 'B', 2), (7, 'C', 'Guard', 'G', 1);
            INSERT INTO marcher_pages (marcher_id, page_id, x, y)
                SELECT m.id, p.id, m.id * 10 + p.id, p.id FROM marchers m CROSS JOIN pages p;
            INSERT INTO tags (id, name) VALUES (1, 'Front');
            INSERT INTO marcher_tags (id, marcher_id, tag_id) VALUES (1, 1, 1), (2, 7, 1);
        `);
    });

    afterEach(() => {
        db?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("keeps every marcher and every row that references one", () => {
        const snapshot = () => ({
            marchers: all(
                "SELECT id, name, section, drill_prefix, drill_order, created_at FROM marchers ORDER BY id",
            ),
            marcherPages: all(
                "SELECT id, marcher_id, page_id, x, y FROM marcher_pages ORDER BY id",
            ),
            marcherTags: all(
                "SELECT id, marcher_id, tag_id FROM marcher_tags ORDER BY id",
            ),
        });
        const before = snapshot();
        expect(before.marchers).toHaveLength(3);
        expect(before.marcherPages).toHaveLength(9);

        runMigration(db, TIMELINE_MIGRATION);

        expect(snapshot()).toEqual(before);
        expect(all("PRAGMA foreign_key_check")).toEqual([]);
        expect(all("PRAGMA integrity_check")).toEqual([
            { integrity_check: "ok" },
        ]);
    });

    it("gives existing marchers a home at the origin", () => {
        runMigration(db, TIMELINE_MIGRATION);
        expect(
            all(
                "SELECT id, home_x, home_y, typeof(home_x) AS tx FROM marchers ORDER BY id",
            ),
        ).toEqual([
            { id: 1, home_x: 0, home_y: 0, tx: "real" },
            { id: 2, home_x: 0, home_y: 0, tx: "real" },
            { id: 7, home_x: 0, home_y: 0, tx: "real" },
        ]);
    });

    it("adds the home columns in place instead of rebuilding marchers", () => {
        const before = marchersSchema();
        runMigration(db, TIMELINE_MIGRATION);
        const after = marchersSchema();

        // Same b-tree, and the original CREATE TABLE with the new columns appended
        expect(after.rootpage).toBe(before.rootpage);
        const originalBody = before.sql.replace(/\)\s*$/, "");
        expect(after.sql.startsWith(originalBody)).toBe(true);
        expect(after.sql.slice(originalBody.length)).toMatch(
            /^,\s*`home_x` real DEFAULT 0 NOT NULL .*,\s*`home_y` real DEFAULT 0 NOT NULL .*\)$/s,
        );
        expect(
            all("SELECT name FROM sqlite_schema WHERE name LIKE '__new_%'"),
        ).toEqual([]);
    });

    it("creates the timeline tables and touches no other existing table", () => {
        const schemaOf = () =>
            all(
                "SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
            );
        const before = schemaOf();
        runMigration(db, TIMELINE_MIGRATION);
        const after = schemaOf();

        // Of the objects that existed before, only marchers changed, and none went away
        const afterByName = new Map(after.map((r) => [r.name, r.sql]));
        const changed = before
            .filter((r) => afterByName.get(r.name) !== r.sql)
            .map((r) => r.name);
        expect(changed).toEqual(["marchers"]);

        const beforeNames = new Set(before.map((r) => r.name));
        const added = after
            .filter((r) => !beforeNames.has(r.name))
            .map((r) => r.name as string);
        expect(
            added.filter(
                (name) => !name.startsWith("timeline_") && name !== "timelines",
            ),
        ).toEqual([]);
        for (const table of [
            "timelines",
            "timeline_shapes",
            "timeline_transitions",
            "timeline_assignments",
            "timeline_slot_destinations",
            "timeline_change_log",
        ])
            expect(added).toContain(table);
    });

    it("rejects a home that is out of bounds or not a number", () => {
        runMigration(db, TIMELINE_MIGRATION);
        const rejected = [
            "UPDATE marchers SET home_x = 1e6 + 1 WHERE id = 1",
            "UPDATE marchers SET home_y = -2e6 WHERE id = 1",
            "UPDATE marchers SET home_x = 1e999 WHERE id = 1",
            "UPDATE marchers SET home_x = 'abc' WHERE id = 1",
            "UPDATE marchers SET home_y = x'00' WHERE id = 1",
            "UPDATE marchers SET home_x = NULL WHERE id = 1",
            "INSERT INTO marchers (section, drill_prefix, drill_order, home_x) VALUES ('Brass', 'B', 9, 2e6)",
            "INSERT INTO marchers (section, drill_prefix, drill_order, home_y) VALUES ('Brass', 'B', 9, 'north')",
        ];
        for (const statement of rejected)
            expect(() => db.exec(statement), statement).toThrow(
                /constraint failed/,
            );

        db.exec("UPDATE marchers SET home_x = 1e6, home_y = -1e6 WHERE id = 1");
        db.exec(
            "INSERT INTO marchers (id, section, drill_prefix, drill_order, home_x, home_y) VALUES (9, 'Brass', 'B', 9, 12.5, -3)",
        );
        expect(
            all(
                "SELECT id, home_x, home_y FROM marchers WHERE id IN (1, 9) ORDER BY id",
            ),
        ).toEqual([
            { id: 1, home_x: 1e6, home_y: -1e6 },
            { id: 9, home_x: 12.5, home_y: -3 },
        ]);
    });
});
