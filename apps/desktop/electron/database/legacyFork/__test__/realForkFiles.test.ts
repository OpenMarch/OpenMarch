// @vitest-environment node
/**
 * Real files saved by fork builds (ADR 0011) open through the app's open path: a timeline file is
 * repaired by its migrations, a page-era file in its conversion. Every row of every table that
 * stays is kept, the parked tables are gone, and the schema is a new file's (plus anything a lab
 * build added that the app doesn't read).
 *
 * The files aren't in the repository. Point `OM_FORK_FIXTURES` at a folder of them (searched
 * recursively) to run this, e.g.
 * `OM_FORK_FIXTURES=/mnt/data/om-capture/fixtures pnpm run test:focused <this file>`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
    closePersistentConnection,
    connect,
    setDbPath,
} from "../../database.services";
import {
    createNewTimelineShow,
    migrationsFolder,
    withDb,
} from "../../__test__/convertOnOpenFixtures";
import { convertFileOnOpen } from "../../convertOnOpen";
import { applyFileVersionDecision, readUserVersion } from "../../fileVersion";
import {
    COLLAPSED_MIGRATION_TAG,
    legacyForkRepairProblems,
} from "../legacyForkRepair";
import { readTaggedMigrations } from "../../services/DrizzleMigrationService";
import { migrateFile } from "./forkFileFixtures";

const collapsed = readTaggedMigrations(migrationsFolder).find(
    (m) => m.tag === COLLAPSED_MIGRATION_TAG,
)!;

const root = process.env.OM_FORK_FIXTURES;
const files = root
    ? (fs.readdirSync(root, { recursive: true }) as string[])
          .filter((f) => f.endsWith(".dots"))
          .sort()
    : [];

const PAGE_ERA = new Set([
    "marcher_pages",
    "midsets",
    "pathways",
    "shape_page_marchers",
    "shape_pages",
    "shapes",
]);
const PARKED = [
    "library_blobs",
    "library_items",
    "cue_marchers",
    "cues",
    "page_performer_settings",
    "phrase_assets",
    "item_placement_marchers",
    "item_placements",
    "item_artwork_slots",
    "saved_shapes",
    "timeline_kept_assignments",
];
const EMPTIED = new Set([
    ...PARKED,
    ...PAGE_ERA,
    "__drizzle_migrations",
    "history_undo",
    "history_redo",
    "history_stats",
    "timeline_change_log",
]);
/** Tables a conversion rewrites from the page-era tables. */
const CONVERTED = new Set([
    "timelines",
    "timeline_shapes",
    "timeline_transitions",
    "timeline_slot_destinations",
    "timeline_assignments",
    "timeline_shape_recipes",
    "timeline_shape_recipe_marchers",
    "timeline_held_marks",
    "workspace_settings",
]);

const tablesOf = (db: import("node:sqlite").DatabaseSync) =>
    (
        db
            .prepare(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
            )
            .all() as { name: string }[]
    ).map((t) => t.name);

const countsOf = (filePath: string) =>
    withDb(filePath, (db) =>
        Object.fromEntries(
            tablesOf(db)
                .filter((t) => !EMPTIED.has(t))
                .map((t) => [
                    t,
                    (
                        db
                            .prepare(`SELECT count(*) AS n FROM "${t}"`)
                            .get() as { n: number }
                    ).n,
                ]),
        ),
    );

/** Columns no comparison looks at: wall-clock times and the Library pins the repair drops. */
const IGNORED_COLUMNS = new Set([
    "updated_at",
    "library_item_id",
    "library_version_hash",
]);

type Row = Record<string, unknown>;

/**
 * Every row of every table the open keeps (not the parked, page-era, history or migration
 * tables), by rowid, with blobs as their sha256.
 */
const contentsOf = (filePath: string) =>
    withDb(filePath, (db) => {
        const tables = new Map<string, Row[]>();
        for (const table of tablesOf(db).filter((t) => !EMPTIED.has(t)))
            tables.set(
                table,
                (
                    db
                        .prepare(`SELECT * FROM "${table}" ORDER BY rowid`)
                        .all() as Row[]
                ).map((row) =>
                    Object.fromEntries(
                        Object.entries(row)
                            .filter(([c]) => !IGNORED_COLUMNS.has(c))
                            .map(([c, v]) => [
                                c,
                                v instanceof Uint8Array
                                    ? `blob:${createHash("sha256").update(v).digest("hex")}`
                                    : v,
                            ]),
                    ),
                ),
            );
        return tables;
    });

/** `rows` with only `columns`. */
const project = (rows: Row[], columns: string[]) =>
    rows.map((row) => Object.fromEntries(columns.map((c) => [c, row[c]])));

/** The sha256 of the field image, or null. */
const fieldImageOf = (filePath: string) =>
    withDb(filePath, (db) => {
        const row = db
            .prepare("SELECT image FROM field_properties WHERE id = 1")
            .get() as { image: Uint8Array | null } | undefined;
        return row?.image
            ? createHash("sha256").update(row.image).digest("hex")
            : null;
    });

describe.skipIf(!root)("real files saved by fork builds", () => {
    let dir: string;
    let freshTables: string[];
    beforeAll(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "om-real-fork-"));
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
        const freshFile = path.join(dir, "fresh.dots");
        await createNewTimelineShow(freshFile);
        freshTables = withDb(freshFile, tablesOf);
    });
    afterAll(() => {
        fs.rmSync(dir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it.each(files)("%s", async (name) => {
        const file = path.join(dir, name.replace(/[\\/]/g, "_"));
        fs.copyFileSync(path.join(root!, name), file);
        const version = withDb(file, (db) => {
            applyFileVersionDecision(db, false);
            return readUserVersion(db);
        });
        const before = countsOf(file);
        const contentsBefore = contentsOf(file);
        const imageBefore = fieldImageOf(file);

        if (version === 7) {
            expect(setDbPath(file, false)).toBe(200);
            const db = connect();
            try {
                const result = await convertFileOnOpen(
                    file,
                    db,
                    migrationsFolder,
                    { backupPath: `${file}.backup.dots` },
                );
                expect(result.status, JSON.stringify(result)).toBe("converted");
            } finally {
                db.close();
                closePersistentConnection();
                setDbPath("", false);
            }
        }
        await migrateFile(file);

        const after = countsOf(file);
        expect(fieldImageOf(file)).toEqual(imageBefore);
        for (const [table, n] of Object.entries(before))
            if (!(version === 7 && CONVERTED.has(table)))
                expect(after[table], table).toBe(n);
        // Every kept row, value for value, in the columns it had (new columns aside). A page-era
        // file's conversion rewrites the timeline tables and gives marchers their page-0 homes;
        // the conversion tests check those.
        const contentsAfter = contentsOf(file);
        for (const [table, rows] of contentsBefore) {
            if (version === 7 && CONVERTED.has(table)) continue;
            const columns = Object.keys(rows[0] ?? {}).filter(
                (c) =>
                    !(
                        version === 7 &&
                        table === "marchers" &&
                        (c === "home_x" || c === "home_y")
                    ),
            );
            expect(
                project(contentsAfter.get(table) ?? [], columns),
                table,
            ).toEqual(project(rows, columns));
        }

        withDb(file, (db) => {
            // What the collapsed migration makes, word for word, and no parked table
            expect(legacyForkRepairProblems(db, collapsed)).toEqual([]);
            // Every table of a new file. The upstream ones are compared by name: a file an older
            // release made may word them differently, or have a column another branch added.
            const tables = tablesOf(db);
            for (const table of freshTables)
                expect(tables, table).toContain(table);
            expect(tables.filter((t) => PAGE_ERA.has(t))).toEqual([]);
        });
    });
});
