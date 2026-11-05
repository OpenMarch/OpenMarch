// @vitest-environment node
// cspell:ignore Millis (drizzle's `folderMillis`)
/**
 * Repair on open for files saved by fork builds (ADR 0011): a file at any level of the fork's old
 * migrations 0017-0032 opens with every row it had (but the parked features'), ends with exactly
 * the schema of a new file, and a repair that fails leaves the file as it was.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getOrm } from "../../db";
import {
    closePersistentConnection,
    connect,
    setDbPath,
} from "../../database.services";
import {
    DrizzleMigrationService,
    readTaggedMigrations,
} from "../../services/DrizzleMigrationService";
import {
    createNewTimelineShow,
    migrationsFolder,
    withDb,
} from "../../__test__/convertOnOpenFixtures";
import { convertFileOnOpen } from "../../convertOnOpen";
import { LEGACY_FORK_MIGRATIONS } from "../legacyForkMigrations";
import {
    COLLAPSED_MIGRATION_HASH,
    COLLAPSED_MIGRATION_TAG,
    FORK_MIGRATION_DATES,
    needsLegacyForkRepair,
    PARKED_TABLES,
    UPSTREAM_LAST_MIGRATION_MS,
} from "../legacyForkRepair";
import {
    createForkPageEraFile,
    createForkTimelineFile,
    forkMigration,
    forkMigrations,
    normalizedSchema,
    rowsOf,
    runAndRecord,
    upstreamFile,
    migrateFile,
} from "./forkFileFixtures";

const folderMigrations = readTaggedMigrations(migrationsFolder);
const folderHashes = folderMigrations.map((m) => m.hash).sort();

/** Tables whose rows the repair keeps exactly, apart from `items` (no Library columns). */
const KEPT_TABLES = [
    "beats",
    "measures",
    "pages",
    "marchers",
    "tags",
    "marcher_tags",
    "field_properties",
    "workspace_settings",
    "timelines",
    "timeline_shapes",
    "timeline_transitions",
    "timeline_slot_destinations",
    "timeline_assignments",
    "timeline_shape_recipes",
    "timeline_shape_recipe_marchers",
    "timeline_held_marks",
    "item_geometry",
    "view3d_venue",
    "view3d_cameras",
    "tempo_settings",
];

let dir: string;
beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "om-fork-repair-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const openFile = migrateFile;

/**
 * Converts the page-era file at `filePath` on the open's connection, as the app does without its
 * worker.
 */
async function convertOnOpen(
    filePath: string,
    hooks?: Parameters<typeof convertFileOnOpen>[4],
) {
    expect(setDbPath(filePath, false)).toBe(200);
    const db = connect();
    try {
        return await convertFileOnOpen(
            filePath,
            db,
            migrationsFolder,
            { backupPath: `${filePath}.backup.dots` },
            hooks,
        );
    } finally {
        db.close();
        closePersistentConnection();
        setDbPath("", false);
    }
}

/** `after` has every row of `before` (by rowid), each with the values it had; new columns aside. */
function expectRowsKept(
    after: Record<string, unknown>[] | null,
    before: Record<string, unknown>[] | null,
    table: string,
) {
    expect(after, table).not.toBeNull();
    expect(after!.length, table).toBe(before!.length);
    after!.forEach((row, i) => {
        const was = before![i]!;
        for (const column of Object.keys(was))
            if (
                column !== "library_item_id" &&
                column !== "library_version_hash"
            )
                expect(row[column], `${table}.${column}`).toEqual(was[column]);
    });
}

const snapshot = (filePath: string) =>
    withDb(filePath, (db) => ({
        rows: Object.fromEntries(
            [...KEPT_TABLES, "items"].map((t) => [t, rowsOf(db, t)]),
        ),
        schema: normalizedSchema(db),
        migrations: db
            .prepare(
                "SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at",
            )
            .all(),
    }));

let freshSchema: string[] | undefined;
async function newFileSchema(): Promise<string[]> {
    if (!freshSchema) {
        const fresh = path.join(dir, "fresh.dots");
        await createNewTimelineShow(fresh);
        freshSchema = withDb(fresh, normalizedSchema);
    }
    return freshSchema;
}

describe("the frozen fork migrations", () => {
    it("are the files fork builds ran: each hash is the sha256 of its SQL", () => {
        for (const m of LEGACY_FORK_MIGRATIONS)
            expect(
                createHash("sha256").update(m.sql).digest("hex"),
                m.tag,
            ).toBe(m.hash);
    });

    it("are 0017-0032 in order, all dated between upstream's 0016 and the collapsed migration", () => {
        const collapsed = folderMigrations.find(
            (m) => m.tag === COLLAPSED_MIGRATION_TAG,
        )!;
        expect(LEGACY_FORK_MIGRATIONS.map((m) => m.tag.slice(0, 4))).toEqual(
            Array.from({ length: 16 }, (_, i) =>
                String(17 + i).padStart(4, "0"),
            ),
        );
        for (const date of FORK_MIGRATION_DATES.keys()) {
            expect(date).toBeGreaterThan(UPSTREAM_LAST_MIGRATION_MS);
            expect(date).toBeLessThan(collapsed.folderMillis);
        }
    });

    it("leave upstream's migrations 0000-0016 alone: the folder keeps them and adds 0017 and 0018", () => {
        expect(folderMigrations.map((m) => m.tag)).toEqual([
            ...folderMigrations.slice(0, 17).map((m) => m.tag),
            "0017_timeline_model",
            "0018_drop_page_era",
        ]);
        expect(folderMigrations[16]!.folderMillis).toBe(
            UPSTREAM_LAST_MIGRATION_MS,
        );
    });
});

describe.each([20, 24, 28, 32])(
    "a timeline file a fork build saved after migration %i",
    (level) => {
        let file: string;
        let before: ReturnType<typeof snapshot>;
        beforeEach(() => {
            file = path.join(dir, `fork-${level}.dots`);
            createForkTimelineFile(file, level);
            before = snapshot(file);
        });

        it("needs the repair, and the app backs it up first", () => {
            withDb(file, (db) => {
                expect(needsLegacyForkRepair(db, folderMigrations)).toBe(true);
                expect(
                    new DrizzleMigrationService(
                        getOrm(db),
                        db,
                    ).hasPendingMigrations(migrationsFolder),
                ).toBe(true);
            });
        });

        it("keeps every row of every table that stays", async () => {
            await openFile(file);
            const after = snapshot(file);
            for (const table of KEPT_TABLES)
                if (before.rows[table] !== null)
                    expectRowsKept(
                        after.rows[table],
                        before.rows[table],
                        table,
                    );
            expect(after.rows.timelines).toHaveLength(1);
            expect(after.rows.timeline_assignments).toHaveLength(2);
        });

        it("keeps every item without its Library columns", async () => {
            await openFile(file);
            const after = snapshot(file);
            if (level >= 24) {
                expectRowsKept(after.rows.items, before.rows.items, "items");
                expect(after.rows.items![0]).not.toHaveProperty(
                    "library_item_id",
                );
                expect(after.rows.items![0]!.color).toBe(
                    level >= 31 ? "rgba(200, 10, 10, 1)" : null,
                );
            } else expect(after.rows.items).toEqual([]);
        });

        it("ends with exactly the schema of a new file", async () => {
            await openFile(file);
            expect(snapshot(file).schema).toEqual(await newFileSchema());
        });

        it("drops the parked tables and empties the undo history", async () => {
            await openFile(file);
            withDb(file, (db) => {
                for (const table of PARKED_TABLES)
                    expect(rowsOf(db, table), table).toBeNull();
                expect(rowsOf(db, "history_undo")).toEqual([]);
                expect(rowsOf(db, "history_redo")).toEqual([]);
                expect(
                    db
                        .prepare(
                            "SELECT cur_undo_group, cur_redo_group FROM history_stats",
                        )
                        .get(),
                ).toEqual({ cur_undo_group: 1, cur_redo_group: 1 });
            });
        });

        it("records exactly this build's migrations, and opens again with nothing to do", async () => {
            await openFile(file);
            const after = snapshot(file);
            expect(
                (after.migrations as { hash: string }[])
                    .map((m) => m.hash)
                    .sort(),
            ).toEqual(folderHashes);
            withDb(file, (db) => {
                expect(needsLegacyForkRepair(db, folderMigrations)).toBe(false);
                expect(
                    new DrizzleMigrationService(
                        getOrm(db),
                        db,
                    ).hasPendingMigrations(migrationsFolder),
                ).toBe(false);
            });
            await openFile(file);
            expect(snapshot(file)).toEqual(after);
        });
    },
);

describe("a timeline file a fork build saved before the page-era drop (0019)", () => {
    it("keeps its rows, drops the page-era tables through 0018, and ends as a new file", async () => {
        const file = path.join(dir, "fork-19.dots");
        createForkTimelineFile(file, 19);
        const before = snapshot(file);
        await openFile(file);
        const after = snapshot(file);
        for (const table of KEPT_TABLES)
            if (before.rows[table] !== null)
                expectRowsKept(after.rows[table], before.rows[table], table);
        expect(after.schema).toEqual(await newFileSchema());
    });
});

describe("a page-era file a fork build opened", () => {
    it.each([17, 18, 19] as const)(
        "after migration %i converts on open, repaired in the conversion",
        async (level) => {
            const file = path.join(dir, `page-${level}.dots`);
            createForkPageEraFile(file, level);
            const marchersBefore = withDb(file, (db) => rowsOf(db, "marchers"));
            const result = await convertOnOpen(file);
            expect(result.status).toBe("converted");
            const after = snapshot(file);
            // The conversion gives each marcher its page-0 spot as its home
            const identity = (rows: Record<string, unknown>[] | null) =>
                rows!.map(
                    ({ id, name, section, drill_prefix, drill_order }) => ({
                        id,
                        name,
                        section,
                        drill_prefix,
                        drill_order,
                    }),
                );
            expect(identity(after.rows.marchers)).toEqual(
                identity(marchersBefore),
            );
            expect(after.rows.timelines!.length).toBeGreaterThan(0);
            expect(after.schema).toEqual(await newFileSchema());
            expect(
                (after.migrations as { hash: string }[])
                    .map((m) => m.hash)
                    .sort(),
            ).toEqual(folderHashes);
            withDb(file, (db) =>
                expect(rowsOf(db, "marcher_pages")).toBeNull(),
            );
        },
    );

    it("is left as it was when its conversion fails after the repair", async () => {
        const file = path.join(dir, "page-fail.dots");
        createForkPageEraFile(file, 19);
        const before = snapshot(file);
        const result = await convertOnOpen(file, {
            afterStep: (step) => {
                if (step === "migrate") throw new Error("test");
            },
        });
        expect(result.status).toBe("conversion-failed");
        expect(snapshot(file)).toEqual(before);
    });
});

describe("files from other builds", () => {
    it("repairs a file the 3D View branch saved (its venue migration under another date)", async () => {
        const file = path.join(dir, "3d-async.dots");
        withDb(file, (db) => {
            upstreamFile(db, 8);
            runAndRecord(db, [forkMigration(19).sql], "melted", 1791099628919);
            db.exec(
                `INSERT INTO view3d_venue (id, json_data) VALUES (1, '{"v":1}')`,
            );
        });
        await openFile(file);
        const after = snapshot(file);
        expect(after.rows.view3d_venue).toEqual([
            { id: 1, json_data: '{"v":1}' },
        ]);
        expect(after.schema).toEqual(await newFileSchema());
    });

    it("repairs a file that took tempo mode under its lab date, and keeps what a lab build added", async () => {
        const file = path.join(dir, "lab.dots");
        withDb(file, (db) => {
            upstreamFile(db, 8);
            forkMigrations(db, 30);
            // Tempo mode as the tempo branch's lab build dated it, and a lab sketch table
            runAndRecord(
                db,
                forkMigration(32).sql.split("--> statement-breakpoint"),
                "tempo-lab",
                1793718419172,
            );
            db.exec(
                "CREATE TABLE sketches (id integer PRIMARY KEY, name text)",
            );
            db.exec("INSERT INTO sketches (id, name) VALUES (1, 'Idea')");
            db.exec(
                "INSERT INTO tempo_settings (id, audio_offset_seconds) VALUES (0, 1.5)",
            );
        });
        await openFile(file);
        const after = snapshot(file);
        expect(after.rows.tempo_settings).toEqual([
            { id: 0, audio_offset_seconds: 1.5 },
        ]);
        withDb(file, (db) =>
            expect(rowsOf(db, "sketches")).toEqual([{ id: 1, name: "Idea" }]),
        );
        expect(
            after.schema.filter((s) => !s.startsWith("table sketches")),
        ).toEqual(await newFileSchema());
    });

    it("leaves alone a file from another branch's migrations (upstream's lighting branch)", async () => {
        const file = path.join(dir, "lighting.dots");
        withDb(file, (db) => {
            upstreamFile(db, 8);
            runAndRecord(
                db,
                ["CREATE TABLE lighting_scenes (id integer PRIMARY KEY)"],
                "lighting",
                1775926691502,
            );
            expect(needsLegacyForkRepair(db, folderMigrations)).toBe(false);
        });
        await openFile(file);
        expect(
            snapshot(file).schema.filter(
                (s) => !s.startsWith("table lighting_scenes"),
            ),
        ).toEqual(await newFileSchema());
    });

    it("refuses a file a lab build changed in a way the repair can't match, and leaves it as it was", async () => {
        const file = path.join(dir, "routes.dots");
        createForkTimelineFile(file, 32);
        withDb(file, (db) =>
            db.exec(
                "ALTER TABLE timeline_transitions ADD COLUMN route_id integer",
            ),
        );
        const bytes = fs.readFileSync(file);
        await expect(openFile(file)).rejects.toThrow(
            /saved by a test build.*timeline_transitions/,
        );
        expect(fs.readFileSync(file).equals(bytes)).toBe(true);
    });
});

describe("a file this build created", () => {
    it("records the collapsed migration under the hash the repair pins", () => {
        expect(
            folderMigrations.find((m) => m.tag === COLLAPSED_MIGRATION_TAG)!
                .hash,
        ).toBe(COLLAPSED_MIGRATION_HASH);
    });

    /** This build's migrations folder, copied, with 0017's journal date moved to `when`. */
    function folderWith0017At(when: number): string {
        const folder = path.join(dir, `migrations-${when}`);
        fs.cpSync(migrationsFolder, folder, { recursive: true });
        const journalPath = path.join(folder, "meta", "_journal.json");
        const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8")) as {
            entries: { tag: string; when: number }[];
        };
        journal.entries.find((e) => e.tag === COLLAPSED_MIGRATION_TAG)!.when =
            when;
        fs.writeFileSync(journalPath, JSON.stringify(journal));
        return folder;
    }

    it("isn't repaired when 0017 gets a new journal date, and keeps its history", async () => {
        const file = path.join(dir, "new.dots");
        await createNewTimelineShow(file);
        withDb(file, (db) =>
            db.exec(`
                INSERT INTO history_undo (history_group, sql) VALUES (1, 'SELECT 1');
                UPDATE history_stats SET cur_undo_group = 2;
            `),
        );
        const state = () =>
            withDb(file, (db) => ({
                history: rowsOf(db, "history_undo"),
                stats: rowsOf(db, "history_stats"),
                migrations: rowsOf(db, "__drizzle_migrations"),
                schema: normalizedSchema(db),
            }));
        const before = state();
        const collapsed = folderMigrations.find(
            (m) => m.tag === COLLAPSED_MIGRATION_TAG,
        )!;
        // Between 0017's date and 0018's, so drizzle itself has nothing to run
        const folder = folderWith0017At(collapsed.folderMillis + 100);
        const moved = readTaggedMigrations(folder);
        withDb(file, (db) =>
            expect(needsLegacyForkRepair(db, moved)).toBe(false),
        );
        await migrateFile(file, folder);
        expect(state()).toEqual(before);
    });

    it("isn't taken for a fork file whatever date 0017 gets", async () => {
        const file = path.join(dir, "new.dots");
        await createNewTimelineShow(file);
        for (const when of [
            UPSTREAM_LAST_MIGRATION_MS + 1,
            Date.UTC(2030, 0, 1),
        ]) {
            const moved = folderMigrations.map((m) =>
                m.tag === COLLAPSED_MIGRATION_TAG
                    ? { ...m, folderMillis: when }
                    : m,
            );
            withDb(file, (db) =>
                expect(needsLegacyForkRepair(db, moved), String(when)).toBe(
                    false,
                ),
            );
        }
    });
});
