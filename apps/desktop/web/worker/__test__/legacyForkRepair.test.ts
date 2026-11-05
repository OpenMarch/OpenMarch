// @vitest-environment node
/**
 * The repair on open for fork-built files (ADR 0011) runs in the web editor's worker on
 * sqlite-wasm (`../sqlite.ts`), not node:sqlite. It relies on `PRAGMA legacy_alter_table`,
 * `BEGIN IMMEDIATE`, `isTransaction` and bound `pragma_table_info(?)`, so this runs it through the
 * shim and checks it ends exactly where the desktop's run ends.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
import {
    legacyForkRepairProblems,
    needsLegacyForkRepair,
    repairLegacyForkFile,
    COLLAPSED_MIGRATION_TAG,
} from "@om-electron/database/legacyFork/legacyForkRepair";
import { readTaggedMigrations } from "@om-electron/database/services/DrizzleMigrationService";
import { migrationsFolder } from "@om-electron/database/__test__/convertOnOpenFixtures";
import {
    createForkTimelineFile,
    normalizedSchema,
    rowsOf,
} from "@om-electron/database/legacyFork/__test__/forkFileFixtures";

const migrations = readTaggedMigrations(migrationsFolder);
const collapsed = migrations.find((m) => m.tag === COLLAPSED_MIGRATION_TAG)!;
const TABLES = [
    "marchers",
    "beats",
    "measures",
    "timelines",
    "timeline_transitions",
    "timeline_assignments",
    "timeline_slot_destinations",
    "timeline_shape_recipes",
    "timeline_held_marks",
    "items",
    "item_geometry",
    "view3d_venue",
    "tempo_settings",
    "__drizzle_migrations",
    "history_undo",
];

/** What a repaired file holds: its schema and the rows of the tables the repair keeps or sets. */
const stateOf = (filePath: string) => {
    const db = new NodeDatabaseSync(filePath);
    try {
        return {
            problems: legacyForkRepairProblems(db as never, collapsed),
            schema: normalizedSchema(db),
            rows: Object.fromEntries(TABLES.map((t) => [t, rowsOf(db, t)])),
        };
    } finally {
        db.close();
    }
};

beforeAll(async () => {
    await loadSqlite();
});

describe.each([20, 32])(
    "a fork file after migration %i, repaired in the web worker",
    (level) => {
        let dir: string;
        let desktop: string;
        let web: string;
        beforeEach(() => {
            dir = fs.mkdtempSync(path.join(os.tmpdir(), "om-web-repair-"));
            desktop = path.join(dir, "desktop.dots");
            web = path.join(dir, "web.dots");
            createForkTimelineFile(desktop, level);
            fs.copyFileSync(desktop, web);
        });
        afterEach(() => {
            deleteDatabase("/web.dots");
            fs.rmSync(dir, { recursive: true, force: true });
        });

        it("ends exactly as the desktop's repair does", () => {
            const node = new NodeDatabaseSync(desktop);
            try {
                repairLegacyForkFile(node, migrations);
            } finally {
                node.close();
            }

            writeDatabase("/web.dots", new Uint8Array(fs.readFileSync(web)));
            const shim = new WebDatabaseSync("/web.dots");
            expect(needsLegacyForkRepair(shim as never, migrations)).toBe(true);
            const report = repairLegacyForkFile(shim as never, migrations);
            expect(shim.isTransaction).toBe(false);
            expect(needsLegacyForkRepair(shim as never, migrations)).toBe(
                false,
            );
            expect(
                (
                    shim.prepare("PRAGMA foreign_keys").get() as {
                        foreign_keys: number;
                    }
                ).foreign_keys,
            ).toBe(1);
            fs.writeFileSync(web, exportDatabase("/web.dots"));

            // The replay makes items as the fork's 0024 did, with its Library columns, at any level
            expect(report.itemsRebuilt).toBe(true);
            const fromWeb = stateOf(web);
            expect(fromWeb.problems).toEqual([]);
            expect(fromWeb).toEqual(stateOf(desktop));
        });

        it("rolls back in the shim, leaving the file as it was, when the result doesn't match", () => {
            const db = new NodeDatabaseSync(web);
            db.exec(
                "ALTER TABLE timeline_transitions ADD COLUMN route_id integer",
            );
            db.close();
            const bytes = new Uint8Array(fs.readFileSync(web));
            writeDatabase("/web.dots", bytes);
            const shim = new WebDatabaseSync("/web.dots");
            expect(() =>
                repairLegacyForkFile(shim as never, migrations),
            ).toThrow(/saved by a test build.*timeline_transitions/);
            expect(shim.isTransaction).toBe(false);
            fs.writeFileSync(web, exportDatabase("/web.dots"));
            const after = new NodeDatabaseSync(web);
            try {
                // Same schema and rows as before the repair
                fs.writeFileSync(path.join(dir, "before.dots"), bytes);
                const original = new NodeDatabaseSync(
                    path.join(dir, "before.dots"),
                );
                expect(normalizedSchema(after)).toEqual(
                    normalizedSchema(original),
                );
                for (const table of TABLES)
                    expect(rowsOf(after, table), table).toEqual(
                        rowsOf(original, table),
                    );
                original.close();
            } finally {
                after.close();
            }
        });
    },
);
