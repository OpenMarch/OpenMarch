import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import { getOrm } from "../../db";
import {
    DrizzleMigrationService,
    FIRST_TIMELINE_MIGRATION_TAG,
    FORK_3D_VENUE_MIGRATION_MS,
} from "../../services/DrizzleMigrationService";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, "..");

type Journal = { entries: { idx: number; tag: string; when: number }[] };
const journal: Journal = JSON.parse(
    fs.readFileSync(path.join(migrationsDir, "meta/_journal.json"), "utf-8"),
);
const entries = [...journal.entries].sort((a, b) => a.idx - b.idx);

const VENUE_MIGRATION = entries[19]!;

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

/** `0017_melted_sage` on the fork's `3d-async` branch: the venue table, as `0019` now makes it. */
const FORK_VENUE_SQL = `CREATE TABLE \`view3d_venue\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`json_data\` text NOT NULL,
    CONSTRAINT "view3d_venue_id_check" CHECK(id = 1)
);`;

const VENUE_JSON = '{"kit":"college"}';

/**
 * Migration 0019 adds the 3D View's venue table (ADR 0002 D-5). On the fork's `3d-async` branch
 * the same table was `0017_melted_sage`, dated after the timeline line's 0017, so files opened by
 * a `3d-async` build must still get 0017 and 0018 and keep their venue.
 */
describe(`Migration ${VENUE_MIGRATION.tag}`, () => {
    let db: DatabaseSync;
    let tempDir: string;
    const tableNames = () =>
        (
            db
                .prepare(
                    "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
                )
                .all() as { name: string }[]
        ).map((r) => r.name);
    const recordedMs = () =>
        (
            db
                .prepare(
                    "SELECT created_at FROM __drizzle_migrations ORDER BY created_at",
                )
                .all() as { created_at: number }[]
        ).map((r) => Number(r.created_at));
    const migrateAll = () =>
        new DrizzleMigrationService(getOrm(db), db).applyPendingMigrations(
            migrationsDir,
        );

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "om-0019-"));
        db = new DatabaseSync(path.join(tempDir, "file.dots"));
        db.prepare("PRAGMA user_version = 7").run();
    });

    afterEach(() => {
        db?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("creates the venue table on a file from before it", async () => {
        await migrateAll();
        expect(tableNames()).toContain("view3d_venue");
        expect(recordedMs().at(-1)).toBe(VENUE_MIGRATION.when);
    });

    it("runs the timeline migrations on a file a 3d-async build opened, and keeps its venue", async () => {
        // A file migrated through 0016 and then the fork's 0017_melted_sage, as a 3d-async
        // build leaves it.
        db.exec(
            "CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)",
        );
        const record = db.prepare(
            "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
        );
        for (const entry of entries.slice(0, 17)) {
            runMigration(db, entry.tag);
            record.run(entry.tag, entry.when);
        }
        db.exec(FORK_VENUE_SQL);
        record.run("0017_melted_sage", FORK_3D_VENUE_MIGRATION_MS);
        db.prepare(
            "INSERT INTO view3d_venue (id, json_data) VALUES (1, ?)",
        ).run(VENUE_JSON);
        expect(FORK_3D_VENUE_MIGRATION_MS).toBeGreaterThan(entries[17]!.when);

        await migrateAll();

        expect(tableNames()).toEqual(
            expect.arrayContaining([
                "timelines",
                "timeline_transitions",
                "timeline_kept_assignments",
                "view3d_venue",
            ]),
        );
        // A page-era file: everything up to the timeline-only migrations, which its conversion runs
        expect(recordedMs()).toEqual(
            entries
                .filter((e) => e.tag < FIRST_TIMELINE_MIGRATION_TAG)
                .map((e) => e.when),
        );
        expect(db.prepare("SELECT json_data FROM view3d_venue").all()).toEqual([
            { json_data: VENUE_JSON },
        ]);
    });
});
