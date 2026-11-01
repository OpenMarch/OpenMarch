// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import { getOrm } from "../../db";
import { DrizzleMigrationService } from "../../services/DrizzleMigrationService";
import { applyFileVersionDecision, readUserVersion } from "../../fileVersion";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, "..");

type Journal = { entries: { idx: number; tag: string; when: number }[] };
const journal: Journal = JSON.parse(
    fs.readFileSync(path.join(migrationsDir, "meta/_journal.json"), "utf-8"),
);
const migrationTags = journal.entries
    .sort((a, b) => a.idx - b.idx)
    .map((e) => e.tag);

const RECIPE_MIGRATION = migrationTags[27]!;
/** `0024_demonic_scream`, this migration's number and date on lab builds of #181 */
const SHAPE_LAB_MIGRATION_MS = 1792165936156;

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

/** A small timeline: one marcher, its own move over beats [1, 9), at (10, 20). */
const TIMELINE_ROWS = `
    INSERT INTO beats (id, duration, position) VALUES (1, 0.5, 1), (2, 0.5, 2);
    INSERT INTO marchers (id, name, section, drill_prefix, drill_order) VALUES (1, 'A', 'Brass', 'B', 1);
    INSERT INTO timelines (id, start_beat, end_beat) VALUES (1, 1, 9);
    INSERT INTO timeline_transitions (id, timeline_id, slot_count, start_beat, end_beat) VALUES (1, 1, 1, 1, 9);
    INSERT INTO timeline_slot_destinations (id, transition_id, slot_index, x, y) VALUES (1, 1, 0, 10, 20);
    INSERT INTO timeline_assignments (id, marcher_id, transition_id, slot_index, start_beat, end_beat) VALUES (5, 1, 1, 0, 1, 9);
`;

/**
 * Migration 0027 adds the Shape tool's recipe tables (ADR 0006): a recipe per placed shape, deleted
 * with its move, and its members, deleted with the recipe or the marcher. It only adds tables, `IF
 * NOT EXISTS`, so older files open and keep their rows, and a file that took it as lab builds'
 * `0024_demonic_scream` takes it again.
 */
describe(`Migration ${RECIPE_MIGRATION}`, () => {
    let db: DatabaseSync;
    let tempDir: string;
    const all = (statement: string) => db.prepare(statement).all() as Row[];
    const schemaOf = () =>
        all(
            "SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
        );

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "om-0027-"));
        db = new DatabaseSync(path.join(tempDir, "pre-0027.dots"));
        for (const tag of migrationTags.slice(0, 27)) runMigration(db, tag);
        db.exec(TIMELINE_ROWS);
    });

    afterEach(() => {
        db?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("adds only the recipe tables, and keeps every existing row", () => {
        const before = schemaOf();
        const rows = () => all("SELECT * FROM timeline_assignments");
        const assignments = rows();
        runMigration(db, RECIPE_MIGRATION);
        const after = schemaOf();

        const afterByName = new Map(after.map((r) => [r.name, r.sql]));
        expect(before.filter((r) => afterByName.get(r.name) !== r.sql)).toEqual(
            [],
        );
        const beforeNames = new Set(before.map((r) => r.name));
        expect(
            after
                .filter((r) => !beforeNames.has(r.name) && r.type === "table")
                .map((r) => r.name),
        ).toEqual(["timeline_shape_recipe_marchers", "timeline_shape_recipes"]);
        expect(rows()).toEqual(assignments);
        expect(all("PRAGMA foreign_key_check")).toEqual([]);
    });

    it("deletes recipes with their move and members with their recipe or marcher", () => {
        runMigration(db, RECIPE_MIGRATION);
        db.exec(`
            INSERT INTO marchers (id, name, section, drill_prefix, drill_order) VALUES (2, 'B', 'Brass', 'B', 2);
            INSERT INTO timelines (id, start_beat, end_beat) VALUES (2, 9, 17);
            INSERT INTO timeline_shape_recipes (id, timeline_id, kind, kind_version, params, order_mode)
                VALUES (1, 2, 'arc', 1, '{"bulge":4}', 'keep'), (2, NULL, 'line', 1, '{}', 'nearest');
            INSERT INTO timeline_shape_recipe_marchers (recipe_id, marcher_id, slot, x, y)
                VALUES (1, 1, 0, 10, 20), (1, 2, 1, 12, 20), (2, 1, 0, 0, 0);
        `);
        // Params must be JSON, and a member belongs to a recipe once
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

        db.exec("DELETE FROM marchers WHERE id = 2");
        expect(
            all(
                "SELECT recipe_id, marcher_id FROM timeline_shape_recipe_marchers ORDER BY id",
            ),
        ).toEqual([
            { recipe_id: 1, marcher_id: 1 },
            { recipe_id: 2, marcher_id: 1 },
        ]);
        db.exec("DELETE FROM timelines WHERE id = 2");
        expect(all("SELECT id FROM timeline_shape_recipes")).toEqual([
            { id: 2 },
        ]);
        expect(
            all("SELECT recipe_id FROM timeline_shape_recipe_marchers"),
        ).toEqual([{ recipe_id: 2 }]);
    });
});

/**
 * A version-8 file from an earlier development build (migrated through 0026) opens: the app's
 * migrator applies 0027 and leaves the version and the timeline rows alone.
 */
describe("opening a version-8 file from before the recipe tables", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "om-0027-open-"));
    });
    afterEach(() => fs.rmSync(tempDir, { recursive: true, force: true }));

    /** The migrations folder as a build without the recipe tables shipped it, through `lastIdx`. */
    const olderMigrationsFolder = (lastIdx = 26) => {
        const folder = path.join(tempDir, `migrations-${lastIdx}`);
        fs.mkdirSync(path.join(folder, "meta"), { recursive: true });
        const kept = journal.entries.filter((e) => e.idx <= lastIdx);
        for (const { tag } of kept)
            fs.copyFileSync(
                path.join(migrationsDir, `${tag}.sql`),
                path.join(folder, `${tag}.sql`),
            );
        fs.writeFileSync(
            path.join(folder, "meta/_journal.json"),
            JSON.stringify({ ...journal, entries: kept }),
        );
        return folder;
    };

    const migrate = async (filePath: string, folder: string) => {
        const db = new DatabaseSync(filePath);
        try {
            const orm = getOrm(db);
            const migrator = new DrizzleMigrationService(orm, db);
            applyFileVersionDecision(db, false);
            await migrator.applyPendingMigrations(folder);
        } finally {
            db.close();
        }
    };

    it("opens a file the shapes branch saved before 0019 was the 3D venue's", async () => {
        // That build recorded the recipe tables as its own 0019 (dated before the 3D 0019), so
        // both 0019 and 0027 run on it; 0027 must find its tables already there
        const filePath = path.join(tempDir, "shapes-branch.dots");
        const db = new DatabaseSync(filePath);
        applyFileVersionDecision(db, true);
        const orm = getOrm(db);
        await new DrizzleMigrationService(orm, db).applyPendingMigrations(
            olderMigrationsFolder(),
        );
        runMigration(db, RECIPE_MIGRATION);
        db.prepare(
            "INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('shapes-0019', 1791662993303)",
        ).run();
        db.close();

        await migrate(filePath, migrationsDir);

        const after = new DatabaseSync(filePath);
        try {
            const tables = (
                after
                    .prepare(
                        "SELECT name FROM sqlite_schema WHERE type = 'table'",
                    )
                    .all() as { name: string }[]
            ).map((r) => r.name);
            expect(tables).toEqual(
                expect.arrayContaining([
                    "timeline_shape_recipes",
                    "timeline_shape_recipe_marchers",
                    "view3d_venue",
                ]),
            );
        } finally {
            after.close();
        }
    });

    it("runs again on a file that took it as a lab build's 0024, keeping its recipes", async () => {
        // A lab build of #181 opened this file after 0023, recorded the recipe tables as
        // 0024_demonic_scream and placed a shape. Main's 0024-0026 are dated after that, so they
        // all run on it, then 0027 finds its tables already there.
        expect(journal.entries[27]!.when).toBeGreaterThan(
            SHAPE_LAB_MIGRATION_MS,
        );
        const filePath = path.join(tempDir, "lab-0024.dots");
        const db = new DatabaseSync(filePath);
        applyFileVersionDecision(db, true);
        await new DrizzleMigrationService(
            getOrm(db),
            db,
        ).applyPendingMigrations(olderMigrationsFolder(23));
        db.exec(TIMELINE_ROWS);
        runMigration(db, RECIPE_MIGRATION);
        db.exec(`
            INSERT INTO timeline_shape_recipes (id, timeline_id, kind, kind_version, params, order_mode)
                VALUES (1, 1, 'line', 1, '{}', 'keep');
            INSERT INTO timeline_shape_recipe_marchers (recipe_id, marcher_id, slot, x, y)
                VALUES (1, 1, 0, 10, 20);
        `);
        db.prepare(
            "INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('0024_demonic_scream', ?)",
        ).run(SHAPE_LAB_MIGRATION_MS);
        db.close();

        await migrate(filePath, migrationsDir);

        const after = new DatabaseSync(filePath);
        try {
            expect(
                after
                    .prepare(
                        "SELECT recipe_id, marcher_id, x, y FROM timeline_shape_recipe_marchers",
                    )
                    .all()
                    .map((r) => ({ ...r })),
            ).toEqual([{ recipe_id: 1, marcher_id: 1, x: 10, y: 20 }]);
            const tables = (
                after
                    .prepare(
                        "SELECT name FROM sqlite_schema WHERE type = 'table'",
                    )
                    .all() as { name: string }[]
            ).map((r) => r.name);
            // Main's props migrations ran too
            expect(tables).toEqual(
                expect.arrayContaining(["items", "item_artwork_slots"]),
            );
        } finally {
            after.close();
        }
    });

    it("applies 0027 and keeps the version and the rows", async () => {
        const filePath = path.join(tempDir, "older-v8.dots");
        const db = new DatabaseSync(filePath);
        applyFileVersionDecision(db, true);
        const orm = getOrm(db);
        await new DrizzleMigrationService(orm, db).applyPendingMigrations(
            olderMigrationsFolder(),
        );
        await DrizzleMigrationService.initializeDatabase(orm, db);
        db.exec(TIMELINE_ROWS);
        db.prepare("PRAGMA user_version = 8").run();
        const hasRecipes = () =>
            db
                .prepare(
                    "SELECT count(*) AS n FROM sqlite_schema WHERE name = 'timeline_shape_recipes'",
                )
                .get() as { n: number };
        expect(hasRecipes().n).toBe(0);
        const assignments = db
            .prepare("SELECT * FROM timeline_assignments")
            .all();
        db.close();

        await migrate(filePath, migrationsDir);

        const after = new DatabaseSync(filePath);
        try {
            expect(readUserVersion(after)).toBe(8);
            expect(
                after
                    .prepare(
                        "SELECT count(*) AS n FROM sqlite_schema WHERE name = 'timeline_shape_recipes'",
                    )
                    .get(),
            ).toEqual({ n: 1 });
            expect(
                after.prepare("SELECT * FROM timeline_assignments").all(),
            ).toEqual(assignments);
            expect(
                after
                    .prepare("SELECT count(*) AS n FROM __drizzle_migrations")
                    .get(),
            ).toEqual({ n: migrationTags.length });
        } finally {
            after.close();
        }
    });
});
