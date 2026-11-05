// @vitest-environment node
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

/** The journal's migration tags, in order (e.g. `0017_timeline_model`). */
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

const TIMELINE_MIGRATION = migrationTags[17]!;
const PAGE_ERA_DROP_MIGRATION = migrationTags[18]!;

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
 * Migration 0017 is the fork's schema on top of upstream's 0016, collapsed into one (ADR 0011):
 * the timeline tables and marcher homes (ADR 0012), the Held marks, shape recipes (ADR 0006),
 * the 3D View's venue and cameras and props (ADR 0010), and tempo mode (ADR 0007). Columns of
 * existing tables are added with ALTER TABLE, not drizzle-kit's table rebuild, so a page-era file
 * keeps its marchers and everything that references them; its conversion reads them next.
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
            /^,\s*`home_x` real DEFAULT 0 NOT NULL .*,\s*`home_y` real DEFAULT 0 NOT NULL .*,\s*`type` text DEFAULT 'marcher' NOT NULL .*\)$/s,
        );
        expect(
            all("SELECT name FROM sqlite_schema WHERE name LIKE '__new_%'"),
        ).toEqual([]);
    });

    it("creates the fork's tables, adds columns to marchers, beats and measures, and touches nothing else", () => {
        const schemaOf = () =>
            all(
                "SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
            );
        const before = schemaOf();
        runMigration(db, TIMELINE_MIGRATION);
        const after = schemaOf();

        // Of the objects that existed before, only these three changed, and none went away
        const afterByName = new Map(after.map((r) => [r.name, r.sql]));
        const changed = before
            .filter((r) => afterByName.get(r.name) !== r.sql)
            .map((r) => r.name);
        expect(changed).toEqual(["beats", "marchers", "measures"]);

        const beforeNames = new Set(before.map((r) => r.name));
        const added = (type: string) =>
            after
                .filter((r) => r.type === type && !beforeNames.has(r.name))
                .map((r) => r.name as string)
                .sort();
        expect(added("table")).toEqual([
            "item_geometry",
            "items",
            "tempo_settings",
            "timeline_assignments",
            "timeline_change_log",
            "timeline_held_marks",
            "timeline_shape_recipe_marchers",
            "timeline_shape_recipes",
            "timeline_shapes",
            "timeline_slot_destinations",
            "timeline_transitions",
            "timelines",
            "view3d_cameras",
            "view3d_venue",
        ]);
        // No parked feature's table (ADR 0011)
        for (const parked of [
            "cues",
            "library_items",
            "saved_shapes",
            "item_placements",
        ])
            expect(afterByName.has(parked)).toBe(false);
        expect(
            all("SELECT name FROM pragma_table_info('beats')").map(
                (c) => c.name,
            ),
        ).toEqual(expect.arrayContaining(["tempo_hold", "tempo_change"]));
        expect(
            all("SELECT name FROM pragma_table_info('measures')").map(
                (c) => c.name,
            ),
        ).toEqual(
            expect.arrayContaining(["number_override", "meter", "grouping"]),
        );
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

    it("gives existing marchers the performer type, and refuses any other type", () => {
        runMigration(db, TIMELINE_MIGRATION);
        expect(all("SELECT DISTINCT type FROM marchers")).toEqual([
            { type: "marcher" },
        ]);
        expect(() =>
            db.exec(
                "INSERT INTO marchers (section, drill_prefix, drill_order, type) VALUES ('Prop', 'P', 3, 'prop')",
            ),
        ).toThrow(/constraint failed/);
    });

    it("keeps an item and its Outline changes to their rules, and deletes them with their marcher", () => {
        runMigration(db, TIMELINE_MIGRATION);
        db.exec(`
            INSERT INTO marchers (id, section, drill_prefix, drill_order, type) VALUES
                (100, 'Prop', 'PROP', 1, 'item'), (102, 'Prop', 'PROP', 2, 'item');
            INSERT INTO items (id, marcher_id, kind, surface_type) VALUES (1, 100, 'prop', 'floor');
            INSERT INTO item_geometry (item_id, beat_id, outline_type, width, depth) VALUES (1, 1, 'circle', 1, 1);
        `);
        const insertInto = (
            table: string,
            row: Record<string, string | number | null>,
        ) => {
            const names = Object.keys(row);
            db.prepare(
                `INSERT INTO ${table} (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`,
            ).run(...Object.values(row));
        };
        const item = (columns: Record<string, string | number | null>) => () =>
            insertInto("items", {
                marcher_id: 102,
                kind: "prop",
                surface_type: "floor",
                ...columns,
            });
        const geometry =
            (columns: Record<string, string | number | null>) => () =>
                insertInto("item_geometry", {
                    item_id: 1,
                    beat_id: 2,
                    outline_type: "circle",
                    width: 1,
                    depth: 1,
                    ...columns,
                });
        for (const bad of [
            { kind: "costume" },
            { surface_type: null },
            { surface_type: "ramp" },
            { kind: "equipment" },
            { marcher_id: 100 },
        ])
            expect(item(bad), JSON.stringify(bad)).toThrow(/constraint failed/);
        for (const bad of [
            { outline_type: "star" },
            { width: 0 },
            { height: -0.1 },
            { transition_length: 1.5 },
            { custom_outline: "[" },
            { rolls_out: 1 },
            { leading_edge: "front" },
            { beat_id: 1 },
        ])
            expect(geometry(bad), JSON.stringify(bad)).toThrow(
                /constraint failed/,
            );
        expect(geometry({ rolls_out: 1, leading_edge: "back" })).not.toThrow();
        expect(item({ color: "rgba(1, 2, 3, 1)" })).not.toThrow();

        db.exec("PRAGMA foreign_keys = ON");
        db.exec("DELETE FROM marchers WHERE id = 100");
        expect(all("SELECT id FROM items")).toEqual([{ id: 2 }]);
        expect(all("SELECT id FROM item_geometry")).toEqual([]);
    });

    it("deletes shape recipes with their move and members with their recipe or marcher", () => {
        runMigration(db, TIMELINE_MIGRATION);
        db.exec(`
            INSERT INTO timelines (id, start_beat, end_beat) VALUES (2, 9, 17);
            INSERT INTO timeline_shape_recipes (id, timeline_id, kind, kind_version, params, order_mode)
                VALUES (1, 2, 'arc', 1, '{"bulge":4}', 'keep'), (2, NULL, 'line', 1, '{}', 'nearest');
            INSERT INTO timeline_shape_recipe_marchers (recipe_id, marcher_id, slot, x, y)
                VALUES (1, 1, 0, 10, 20), (1, 2, 1, 12, 20), (2, 1, 0, 0, 0);
        `);
        expect(() =>
            db.exec(
                "INSERT INTO timeline_shape_recipes (kind, kind_version, params, order_mode) VALUES ('arc', 1, 'nope', 'keep')",
            ),
        ).toThrow(/constraint failed/);
        expect(() =>
            db.exec(
                "INSERT INTO timeline_shape_recipe_marchers (recipe_id, marcher_id, slot, x, y) VALUES (1, 1, 3, 0, 0)",
            ),
        ).toThrow(/constraint failed/);
        db.exec("PRAGMA foreign_keys = ON");
        db.exec("DELETE FROM marchers WHERE id = 2");
        db.exec("DELETE FROM timelines WHERE id = 2");
        expect(all("SELECT id FROM timeline_shape_recipes")).toEqual([
            { id: 2 },
        ]);
        expect(
            all(
                "SELECT recipe_id, marcher_id FROM timeline_shape_recipe_marchers",
            ),
        ).toEqual([{ recipe_id: 2, marcher_id: 1 }]);
    });

    it("keeps a Held mark's counts, one start per marcher, and deletes it with its marcher", () => {
        runMigration(db, TIMELINE_MIGRATION);
        db.exec(
            "INSERT INTO timeline_held_marks (id, marcher_id, start_beat, end_beat) VALUES (7, 1, 17, 25), (8, 2, 17, 25)",
        );
        const refused = (values: string) => () =>
            db.exec(
                `INSERT INTO timeline_held_marks (marcher_id, start_beat, end_beat) VALUES ${values}`,
            );
        expect(refused("(1, 17, 33)")).toThrow(/UNIQUE constraint failed/);
        expect(refused("(1, 30, 30)")).toThrow(/constraint failed/);
        expect(refused("(1, -1, 4)")).toThrow(/constraint failed/);
        expect(refused("(1, 1.5, 4)")).toThrow(/constraint failed/);
        db.exec("PRAGMA foreign_keys = ON");
        db.exec("DELETE FROM marchers WHERE id = 1");
        expect(all("SELECT marcher_id FROM timeline_held_marks")).toEqual([
            { marcher_id: 2 },
        ]);
    });

    it("keeps the venue, cameras and tempo settings to one row each", () => {
        runMigration(db, TIMELINE_MIGRATION);
        for (const statement of [
            "INSERT INTO view3d_venue (id, json_data) VALUES (2, '{}')",
            "INSERT INTO view3d_cameras (id, json_data) VALUES (2, '{}')",
            "INSERT INTO tempo_settings (id, audio_offset_seconds) VALUES (1, 0)",
        ])
            expect(() => db.exec(statement), statement).toThrow(
                /constraint failed/,
            );
    });

    it("leaves the page-era tables for 0018, which drops them and nothing else", () => {
        runMigration(db, TIMELINE_MIGRATION);
        expect(all("SELECT count(*) AS n FROM marcher_pages")).toEqual([
            { n: 9 },
        ]);
        const tables = () =>
            all(
                "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
            ).map((r) => r.name);
        const before = tables();
        runMigration(db, PAGE_ERA_DROP_MIGRATION);
        expect(before.filter((t) => !tables().includes(t)).sort()).toEqual([
            "marcher_pages",
            "midsets",
            "pathways",
            "shape_page_marchers",
            "shape_pages",
            "shapes",
        ]);
    });
});
