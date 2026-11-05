/**
 * Repair on open for files saved by fork builds (ADR 0011).
 *
 * Fork builds ran sixteen migrations after upstream's `0016_unique_ultimo` (0017-0032), under dates
 * that this build's journal no longer has: they are collapsed into `0017_timeline_model`, without
 * the tables of parked features. Drizzle runs only migrations dated after a file's newest one, and
 * the collapsed migration is dated after all of them, so without this a fork file would run it on
 * top of the tables it already has and fail.
 *
 * Instead, when a file records any of the fork's migrations (or has the timeline tables without the
 * collapsed migration, for a lab build's date this list missed), the repair:
 *
 * 1. replays every fork migration, frozen in `legacyForkMigrations.ts`, in order, made safe to run
 *    again (`IF NOT EXISTS`, `IF EXISTS`, and an `ADD COLUMN` the table has is skipped), so a file
 *    gets the ones it missed whichever of them it took and under whichever date. The page-era drop
 *    (old 0020) is left to `0018_drop_page_era`, as before: a page-era file runs it in its
 *    conversion, after the converter has read those tables;
 * 2. drops the parked features' tables (`PARKED_TABLES`) and rebuilds `items` without its Library
 *    columns;
 * 3. empties the undo and redo history, whose entries may name what step 2 removed;
 * 4. replaces the fork's rows in `__drizzle_migrations` with the collapsed migration's;
 * 5. checks the file against the collapsed migration (every table and index it makes, every column
 *    it adds, word for word), that the parked tables are gone, and that every other table kept
 *    each of its rows. Anything else a lab build added (a table, an index, a column) is kept.
 *
 * It runs in one transaction with foreign keys off, so a failure leaves the file as it was. The
 * desktop app backs the file up before (`hasPendingMigrations` is true); a page-era file repairs
 * inside its conversion, after the conversion's backup.
 */
// cspell:ignore Millis warbound havok flagg unuscione nuit (drizzle's `folderMillis`, migration tags)
import type { DatabaseSync } from "node:sqlite";
import { skipsExistingColumn } from "../migrations/addColumnGuard";
import {
    createAllTriggers,
    dropAllTriggers,
    recreateChangeLogTriggers,
} from "../migrations/triggers";
import { recoverParkedFloorInTransaction } from "../parkedFloor";
import { LEGACY_FORK_MIGRATIONS } from "./legacyForkMigrations";

/** The migration fork files are repaired to. */
export const COLLAPSED_MIGRATION_TAG = "0017_timeline_model";

/** `created_at` of upstream's last migration, `0016_unique_ultimo`. */
export const UPSTREAM_LAST_MIGRATION_MS = 1764733345489;

/** The old 0020: dropped the page-era tables. `0018_drop_page_era` does that now. */
const LEGACY_PAGE_ERA_DROP_TAG = "0020_drop_page_era";

/**
 * Every `created_at` a fork build may have recorded after 0016: the fork's 0017-0032, and the dates
 * its other branches gave migrations before they merged (lab builds were made from them). Taken
 * from every fork branch's journal.
 */
export const FORK_MIGRATION_DATES: ReadonlyMap<number, string> = new Map([
    ...LEGACY_FORK_MIGRATIONS.map((m) => [m.when, m.tag] as const),
    // The 3D View branch (`3d-async`) and other branches before they merged
    [1791099628919, "0017_melted_sage"],
    [1791383146131, "0017_ancient_titanium_man"],
    [1791662993303, "0019_deep_tattoo"],
    [1791766715856, "0020_perfect_warbound"],
    [1791833562413, "0020_nasty_guardian"],
    [1791836267337, "0020_blue_dust"],
    [1792001557645, "0021_mature_havok"],
    [1792006580179, "0021_nasty_guardian"],
    [1792150612215, "0023_steady_human_fly"],
    [1792162434076, "0024_fat_randall_flagg"],
    [1792165936156, "0024_demonic_scream"],
    [1792168750467, "0025_skinny_the_hunter"],
    [1792169561480, "0026_yellow_carmella_unuscione"],
    [1792588818566, "0027_lush_polaris"],
    [1792610900732, "0028_chunky_la_nuit"],
    [1792848600915, "0027_real_nitro"],
    [1793308354782, "0027_drop_kept_assignments"],
    [1793379955918, "0029_chubby_leech"],
    [1793385333809, "0029_stale_wrecker"],
    [1793563966649, "0030_chief_lester"],
    [1793718419172, "0031_productive_redwing"],
    [1793745444391, "0031_timeline_routes"],
]);

/**
 * Tables of features parked before the merge with upstream, dropped by the repair with their rows:
 * the Asset Library (old 0021), performer cues (0022), Item Placement (0025), Artwork slots (0026)
 * and saved shapes (0028). Kept spots (0018) went in 0029.
 */
export const PARKED_TABLES = [
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
] as const;

/** The page-era tables. `0018_drop_page_era` drops them, so the repair leaves them alone. */
const PAGE_ERA_TABLES = new Set([
    "marcher_pages",
    "midsets",
    "pathways",
    "shape_page_marchers",
    "shape_pages",
    "shapes",
]);

/** The Library columns `items` had (old 0024); the collapsed migration makes it without them. */
const ITEMS_LIBRARY_COLUMNS = ["library_item_id", "library_version_hash"];

/** A migration of this build's folder, as `DrizzleMigrationService` reads it. */
export interface FolderMigration {
    readonly tag: string;
    readonly folderMillis: number;
    readonly hash: string;
    readonly sql: readonly string[];
}

/** What a repair did. */
export interface LegacyForkRepairReport {
    /** The fork migrations the file recorded, by tag (or date, for one this build doesn't know). */
    readonly recorded: string[];
    /** Parked tables dropped, with the rows each had. */
    readonly dropped: { table: string; rows: number }[];
    /** Whether `items` was rebuilt without its Library columns. */
    readonly itemsRebuilt: boolean;
}

const MIGRATIONS_TABLE = "__drizzle_migrations";

const hasTable = (db: DatabaseSync, name: string) =>
    !!db
        .prepare(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .get(name);

const columnsOf = (db: DatabaseSync) => (table: string) =>
    (
        db.prepare("SELECT name FROM pragma_table_info(?)").all(table) as {
            name: string;
        }[]
    ).map((c) => c.name);

const recordedDates = (db: DatabaseSync): number[] =>
    hasTable(db, MIGRATIONS_TABLE)
        ? (
              db
                  .prepare(`SELECT created_at FROM ${MIGRATIONS_TABLE}`)
                  .all() as { created_at: number | string }[]
          ).map((r) => Number(r.created_at))
        : [];

function collapsedMigration(
    migrations: readonly FolderMigration[],
): FolderMigration {
    const collapsed = migrations.find((m) => m.tag === COLLAPSED_MIGRATION_TAG);
    if (!collapsed)
        throw new Error(
            `The migrations folder has no ${COLLAPSED_MIGRATION_TAG}`,
        );
    return collapsed;
}

/**
 * Whether the file open on `db` was saved by a fork build and needs the repair: it records one of
 * the fork's migrations, or it has the timeline tables but not the collapsed migration (a lab
 * build's date `FORK_MIGRATION_DATES` doesn't list). Reads only.
 */
export function needsLegacyForkRepair(
    db: DatabaseSync,
    migrations: readonly FolderMigration[],
): boolean {
    const dates = recordedDates(db);
    if (dates.some((d) => FORK_MIGRATION_DATES.has(d))) return true;
    const collapsed = migrations.find((m) => m.tag === COLLAPSED_MIGRATION_TAG);
    return (
        !!collapsed &&
        !dates.includes(collapsed.folderMillis) &&
        hasTable(db, "timelines")
    );
}

/** Whitespace runs as one space, and no `IF NOT EXISTS` (SQLite doesn't store it). */
const normalize = (statement: string) =>
    statement
        .replace(/^(?:\s*--[^\n]*\n)*/, "")
        .replace(/\bIF NOT EXISTS\s+/i, "")
        .replace(/\s+/g, " ")
        .replace(/\s*;\s*$/, "")
        .trim();

/** A frozen fork statement made safe to run on a file that already took it. */
function idempotent(statement: string): string {
    return statement
        .replace(/^(\s*CREATE\s+TABLE\s+)(?!IF\s)/im, "$1IF NOT EXISTS ")
        .replace(
            /^(\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+)(?!IF\s)/im,
            "$1IF NOT EXISTS ",
        )
        .replace(/^(\s*DROP\s+TABLE\s+)(?!IF\s)/im, "$1IF EXISTS ");
}

const statementsOf = (sql: string) =>
    sql
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

/** The rows of every table but the ones the repair empties or drops. */
function rowCounts(db: DatabaseSync): Map<string, number> {
    const skip = new Set<string>([
        ...PARKED_TABLES,
        MIGRATIONS_TABLE,
        "history_undo",
        "history_redo",
    ]);
    const tables = (
        db
            .prepare(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
            )
            .all() as { name: string }[]
    )
        .map((t) => t.name)
        .filter((name) => !skip.has(name));
    return new Map(
        tables.map((name) => [
            name,
            (
                db.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as {
                    n: number;
                }
            ).n,
        ]),
    );
}

function foreignKeyViolations(db: DatabaseSync): Map<string, number> {
    const counts = new Map<string, number>();
    for (const { table, parent } of db
        .prepare("PRAGMA foreign_key_check")
        .all() as { table: string; parent: string }[]) {
        const key = `${table} -> ${parent}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
}

/** Step 1: every fork migration, in order, as many times as it takes. */
function replayForkMigrations(db: DatabaseSync): void {
    for (const migration of LEGACY_FORK_MIGRATIONS) {
        if (migration.tag === LEGACY_PAGE_ERA_DROP_TAG) continue;
        for (const statement of statementsOf(migration.sql)) {
            const safe = idempotent(statement);
            if (skipsExistingColumn(safe, columnsOf(db))) continue;
            try {
                db.exec(safe);
            } catch (error) {
                throw new Error(
                    `${migration.tag}: ${(error as Error).message} in ${statement.slice(0, 80)}`,
                );
            }
        }
    }
}

/** Step 2b: `items` as the collapsed migration makes it, keeping its rows. */
function rebuildItems(db: DatabaseSync, collapsed: FolderMigration): boolean {
    const columns = columnsOf(db)("items");
    if (!columns.some((c) => ITEMS_LIBRARY_COLUMNS.includes(c))) return false;
    const create = collapsed.sql.find((s) =>
        /^CREATE TABLE `items`/.test(normalize(s)),
    );
    if (!create)
        throw new Error(`${COLLAPSED_MIGRATION_TAG} doesn't create items`);
    const indexes = collapsed.sql.filter((s) =>
        /^CREATE (?:UNIQUE )?INDEX \S+ ON `items`/.test(normalize(s)),
    );
    // Set the old table aside without touching what names it (legacy_alter_table: the foreign
    // keys of item_geometry keep naming `items`), so the new one has the migration's exact text.
    db.exec("PRAGMA legacy_alter_table = ON");
    db.exec("ALTER TABLE `items` RENAME TO `__old_items`");
    db.exec("PRAGMA legacy_alter_table = OFF");
    db.exec(create.replace(/^(?:\s*--[^\n]*\n)*/, ""));
    const kept = columnsOf(db)("items")
        .filter((c) => columns.includes(c))
        .map((c) => `"${c}"`)
        .join(", ");
    db.exec(
        `INSERT INTO \`items\` (${kept}) SELECT ${kept} FROM \`__old_items\``,
    );
    db.exec("DROP TABLE `__old_items`");
    for (const index of indexes) db.exec(index);
    return true;
}

/** Step 3, as the conversion does it. */
function clearHistory(db: DatabaseSync): void {
    db.exec("DELETE FROM history_undo");
    db.exec("DELETE FROM history_redo");
    db.exec("UPDATE history_stats SET cur_undo_group = 1, cur_redo_group = 1");
}

/** Step 4. */
function recordCollapsedMigration(
    db: DatabaseSync,
    collapsed: FolderMigration,
): void {
    const remove = db.prepare(
        `DELETE FROM ${MIGRATIONS_TABLE} WHERE created_at = ?`,
    );
    for (const date of recordedDates(db))
        if (FORK_MIGRATION_DATES.has(date)) remove.run(date);
    if (!recordedDates(db).includes(collapsed.folderMillis))
        db.prepare(
            `INSERT INTO ${MIGRATIONS_TABLE} ("hash", "created_at") VALUES (?, ?)`,
        ).run(collapsed.hash, collapsed.folderMillis);
}

/**
 * Step 5: the file against the collapsed migration. Throws with every difference it finds.
 * Exported for tests.
 */
export function legacyForkRepairProblems(
    db: DatabaseSync,
    collapsed: FolderMigration,
): string[] {
    const problems: string[] = [];
    const stored = new Map(
        (
            db
                .prepare(
                    "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL",
                )
                .all() as { type: string; name: string; sql: string }[]
        ).map((r) => [`${r.type}:${r.name}`, normalize(r.sql)]),
    );
    for (const table of PARKED_TABLES)
        if (stored.has(`table:${table}`))
            problems.push(`the parked table ${table} is still there`);
    for (const statement of collapsed.sql) {
        const text = normalize(statement);
        const created =
            /^CREATE TABLE `(\w+)`/.exec(text) ??
            /^CREATE (?:UNIQUE )?INDEX `(\w+)`/.exec(text);
        if (created) {
            const type = text.startsWith("CREATE TABLE") ? "table" : "index";
            const name = created[1]!;
            if (PAGE_ERA_TABLES.has(name)) continue;
            const actual = stored.get(`${type}:${name}`);
            if (actual === undefined)
                problems.push(`${type} ${name} is missing`);
            else if (actual !== text)
                problems.push(
                    `${type} ${name} isn't what ${COLLAPSED_MIGRATION_TAG} makes`,
                );
            continue;
        }
        const added = /^ALTER TABLE `(\w+)` ADD (?:COLUMN )?(`(\w+)`.*)$/.exec(
            text,
        );
        if (added) {
            const [, table, definition, column] = added;
            if (!stored.get(`table:${table}`)?.includes(definition!))
                problems.push(
                    `${table}.${column} isn't what ${COLLAPSED_MIGRATION_TAG} adds`,
                );
            continue;
        }
        problems.push(
            `${COLLAPSED_MIGRATION_TAG} has a statement the repair can't check: ${text.slice(0, 60)}`,
        );
    }
    return problems;
}

/**
 * Repairs the fork file open on `db` (see the module comment), inside the transaction the caller
 * holds, with foreign keys off. Throws, leaving the rollback to the caller, if the file doesn't
 * end as the collapsed migration makes it or a table lost a row.
 */
export function repairLegacyForkFileInTransaction(
    db: DatabaseSync,
    migrations: readonly FolderMigration[],
): LegacyForkRepairReport {
    const { foreign_keys } = db.prepare("PRAGMA foreign_keys").get() as {
        foreign_keys: number;
    };
    if (foreign_keys !== 0)
        throw new Error(
            "The fork-file repair needs foreign keys off: dropping a table would cascade",
        );
    const collapsed = collapsedMigration(migrations);
    const recorded = recordedDates(db)
        .filter(
            (d) =>
                d > UPSTREAM_LAST_MIGRATION_MS && d !== collapsed.folderMillis,
        )
        .sort((a, b) => a - b)
        .map((d) => FORK_MIGRATION_DATES.get(d) ?? String(d));
    const countsBefore = rowCounts(db);
    const violationsBefore = foreignKeyViolations(db);

    dropAllTriggers(db);
    replayForkMigrations(db);
    // Before the Library tables go: a parked floor-model file keeps its field image there.
    recoverParkedFloorInTransaction(db);
    const dropped: { table: string; rows: number }[] = [];
    for (const table of PARKED_TABLES) {
        if (!hasTable(db, table)) continue;
        const { n } = db
            .prepare(`SELECT count(*) AS n FROM "${table}"`)
            .get() as { n: number };
        db.exec(`DROP TABLE "${table}"`);
        if (n > 0) dropped.push({ table, rows: n });
    }
    const itemsRebuilt = rebuildItems(db, collapsed);
    clearHistory(db);
    recordCollapsedMigration(db, collapsed);

    const problems = legacyForkRepairProblems(db, collapsed);
    const countsAfter = rowCounts(db);
    for (const [table, n] of countsBefore)
        if (countsAfter.has(table) && countsAfter.get(table) !== n)
            problems.push(
                `${table} had ${n} rows and has ${countsAfter.get(table)}`,
            );
        else if (!countsAfter.has(table) && !PAGE_ERA_TABLES.has(table))
            problems.push(`${table} is gone`);
    for (const [key, n] of foreignKeyViolations(db))
        if (n > (violationsBefore.get(key) ?? 0))
            problems.push(`rows lost their parent (${key})`);
    if (problems.length > 0)
        throw new Error(
            `This file was saved by a test build of OpenMarch and couldn't be updated: ${problems.join("; ")}`,
        );

    createAllTriggers(db);
    recreateChangeLogTriggers(db);
    return { recorded, dropped, itemsRebuilt };
}

/**
 * Repairs the fork file open on `db` in a transaction of its own, with foreign keys off for it. A
 * failure rolls back, leaving the file as it was, and throws.
 */
export function repairLegacyForkFile(
    db: DatabaseSync,
    migrations: readonly FolderMigration[],
): LegacyForkRepairReport {
    const { foreign_keys } = db.prepare("PRAGMA foreign_keys").get() as {
        foreign_keys: number;
    };
    // Must be set outside the transaction: inside one, SQLite ignores it.
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN IMMEDIATE");
    try {
        const report = repairLegacyForkFileInTransaction(db, migrations);
        db.exec("COMMIT");
        return report;
    } catch (error) {
        // SQLite may have rolled back already (a failed statement can end the transaction)
        if (db.isTransaction) db.exec("ROLLBACK");
        throw error;
    } finally {
        if (foreign_keys !== 0) db.exec("PRAGMA foreign_keys = ON");
    }
}
