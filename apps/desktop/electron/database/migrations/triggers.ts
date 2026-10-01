import { DatabaseSync } from "node:sqlite";

/**
 * The file's timeline flag, as `isTimelineModeEnabled` reads it: `timelineMode` is JSON `true` in
 * the workspace settings. A malformed settings row counts as off, as it does in the app, and
 * never fails a page-mode write.
 */
const TIMELINE_MODE_ON = `EXISTS (SELECT 1 FROM workspace_settings WHERE CASE WHEN json_valid(json_data) THEN json_type(json_data, '$.timelineMode') END = 'true')`;

/**
 * The page-era tables frozen in timeline mode (P9.5, ADR 0001 §1), each with the parents its
 * foreign keys cascade from.
 */
const PAGE_ERA_FROZEN_TABLES: {
    table: string;
    parents: { column: string; table: string }[];
}[] = [
    {
        table: "marcher_pages",
        parents: [
            { column: "marcher_id", table: "marchers" },
            { column: "page_id", table: "pages" },
        ],
    },
    {
        table: "midsets",
        parents: [{ column: "mp_id", table: "marcher_pages" }],
    },
    { table: "pathways", parents: [] },
    { table: "shapes", parents: [] },
    {
        table: "shape_pages",
        parents: [
            { column: "shape_id", table: "shapes" },
            { column: "page_id", table: "pages" },
        ],
    },
    {
        table: "shape_page_marchers",
        parents: [
            { column: "shape_page_id", table: "shape_pages" },
            { column: "marcher_id", table: "marchers" },
        ],
    },
];

/** The prefix of every page-era freeze trigger's name. */
export const PAGE_ERA_FROZEN_TRIGGER_PREFIX = "page_era_frozen_";

/**
 * How every freeze trigger's RAISE message ends, after the table name. Undo matches it to skip a
 * history group the freeze refuses (`src/db-functions/pageEraFreezeMarker.ts` has the same text).
 */
export const PAGE_ERA_FROZEN_RAISE_SUFFIX =
    "is read-only in timeline mode (page-era data, P9.5)";

const triggers = {
    prevent_first_beat_modification: `
            CREATE TRIGGER IF NOT EXISTS prevent_first_beat_modification
                BEFORE UPDATE ON beats
                FOR EACH ROW
                WHEN OLD.id = 0
                BEGIN
                    SELECT RAISE(FAIL, 'Modification not allowed for the first beat.');
                END;
        `,
    prevent_first_beat_deletion: `
        CREATE TRIGGER IF NOT EXISTS prevent_first_beat_deletion
            BEFORE DELETE ON beats
            FOR EACH ROW
            WHEN OLD.id = 0
            BEGIN
                SELECT RAISE(FAIL, 'Deletion not allowed for the first beat.');
            END;
    `,
    prevent_first_page_modification: `
        CREATE TRIGGER IF NOT EXISTS prevent_first_page_modification
            BEFORE UPDATE ON pages
            FOR EACH ROW
            WHEN OLD.id = 0 AND (
                NEW.is_subset != OLD.is_subset OR
                NEW.start_beat != OLD.start_beat
            )
            BEGIN
                SELECT RAISE(FAIL, 'Modification not allowed for the first page.');
            END;
    `,
    prevent_first_page_deletion: `
        CREATE TRIGGER IF NOT EXISTS prevent_first_page_deletion
            BEFORE DELETE ON pages
            FOR EACH ROW
            WHEN OLD.id = 0
            BEGIN
                SELECT RAISE(FAIL, 'Deletion not allowed for the first page.');
            END;
    `,
    prevent_utility_deletion: `
        CREATE TRIGGER IF NOT EXISTS prevent_utility_deletion
            BEFORE DELETE ON utility
            FOR EACH ROW
            WHEN OLD.id = 0
            BEGIN
                SELECT RAISE(FAIL, 'Deletion not allowed for the utility record.');
            END;
    `,
    ...timelineInvariantTriggers(),
    ...timelineChangeLogTriggers(),
    ...pageEraFreezeTriggers(),
};

/**
 * Views that depend on tables created by migrations. Dropped before migrations run (so a table
 * rebuild never trips over a view that references it) and recreated after.
 */
const views = {
    /**
     * Commit-time invariants (spec §6): the write wrapper aborts an edit if this returns any row.
     * I-T6 completeness can only be judged once the whole edit has run, because a transition and
     * its destinations are inserted in the same edit.
     */
    timeline_commit_violations: `
        CREATE VIEW IF NOT EXISTS timeline_commit_violations AS
            SELECT 'E-T6' AS code, t.id AS transition_id,
                   'shapeless transition has '
                       || (SELECT count(*) FROM timeline_slot_destinations d WHERE d.transition_id = t.id)
                       || ' of ' || t.slot_count || ' destinations' AS detail
              FROM timeline_transitions t
             WHERE t.dest_shape_id IS NULL
               AND (SELECT count(*) FROM timeline_slot_destinations d WHERE d.transition_id = t.id) <> t.slot_count;
    `,
};

/**
 * The timeline invariant triggers (spec §5.1 and §6, ADR 0001 §2), named with a `timeline_`
 * prefix. Each one only reads rows and RAISEs; none modifies a table (spec U-1). Every check is a
 * condition on the resulting state and never compares NEW with OLD (U-2), so undo, which replays
 * the same states in reverse, can't be rejected by them.
 *
 * RAISE messages start with the spec's error code so the write path can map them.
 */
function timelineInvariantTriggers(): Record<string, string> {
    return {
        ...timelineRangeTriggers(),
        ...timelineDestinationTriggers(),
    };
}

/** A trigger body that aborts the statement with `message`. */
function raise(message: string): string {
    return `BEGIN SELECT RAISE(ABORT, '${message}'); END;`;
}

/** I-A1 to I-A3 and I-T1: beat ranges, slots and layers of assignments and transitions. */
function timelineRangeTriggers(): Record<string, string> {
    const asnBoundsWhen = `
        WHEN NOT EXISTS (SELECT 1 FROM timeline_transitions t WHERE t.id = NEW.transition_id
                         AND NEW.start_beat >= t.start_beat AND NEW.end_beat <= t.end_beat
                         AND NEW.slot_index < t.slot_count)`;
    const asnBoundsMessage =
        "E-A1/E-A2: assignment outside transition range or slot_count";

    const trInTimelineWhen = `
        WHEN NOT EXISTS (SELECT 1 FROM timelines l WHERE l.id = NEW.timeline_id
                         AND NEW.start_beat >= l.start_beat AND NEW.end_beat <= l.end_beat)`;
    const trInTimelineMessage = "E-T1: transition outside its timeline";

    return {
        // I-A1, I-A2: an assignment lies inside its transition's range and slot_count
        timeline_asn_bounds_ins: `
            CREATE TRIGGER IF NOT EXISTS timeline_asn_bounds_ins BEFORE INSERT ON timeline_assignments
            ${asnBoundsWhen}
            ${raise(asnBoundsMessage)}`,
        timeline_asn_bounds_upd: `
            CREATE TRIGGER IF NOT EXISTS timeline_asn_bounds_upd BEFORE UPDATE ON timeline_assignments
            ${asnBoundsWhen}
            ${raise(asnBoundsMessage)}`,

        // I-A3: one marcher, one layer, no overlapping ranges
        timeline_asn_overlap_ins: `
            CREATE TRIGGER IF NOT EXISTS timeline_asn_overlap_ins BEFORE INSERT ON timeline_assignments
            WHEN EXISTS (SELECT 1 FROM timeline_assignments a WHERE a.marcher_id = NEW.marcher_id
                         AND a.layer = NEW.layer
                         AND a.start_beat < NEW.end_beat AND NEW.start_beat < a.end_beat)
            ${raise("E-A3: overlapping assignments for one marcher at the same layer")}`,
        timeline_asn_overlap_upd: `
            CREATE TRIGGER IF NOT EXISTS timeline_asn_overlap_upd BEFORE UPDATE ON timeline_assignments
            WHEN EXISTS (SELECT 1 FROM timeline_assignments a WHERE a.id <> NEW.id
                         AND a.marcher_id = NEW.marcher_id AND a.layer = NEW.layer
                         AND a.start_beat < NEW.end_beat AND NEW.start_beat < a.end_beat)
            ${raise("E-A3: overlapping assignments for one marcher at the same layer")}`,

        // I-T1: a transition lies inside its timeline, checked from both sides
        timeline_tr_in_timeline_ins: `
            CREATE TRIGGER IF NOT EXISTS timeline_tr_in_timeline_ins BEFORE INSERT ON timeline_transitions
            ${trInTimelineWhen}
            ${raise(trInTimelineMessage)}`,
        timeline_tr_in_timeline_upd: `
            CREATE TRIGGER IF NOT EXISTS timeline_tr_in_timeline_upd
            BEFORE UPDATE OF start_beat, end_beat, timeline_id ON timeline_transitions
            ${trInTimelineWhen}
            ${raise(trInTimelineMessage)}`,
        timeline_tl_contains_upd: `
            CREATE TRIGGER IF NOT EXISTS timeline_tl_contains_upd BEFORE UPDATE OF start_beat, end_beat ON timelines
            WHEN EXISTS (SELECT 1 FROM timeline_transitions t WHERE t.timeline_id = NEW.id
                         AND (t.start_beat < NEW.start_beat OR t.end_beat > NEW.end_beat))
            ${raise("E-T1: timeline would no longer contain its transitions")}`,

        // I-A2 (transition side): slot_count can't shrink below an occupied slot
        timeline_tr_slots_upd: `
            CREATE TRIGGER IF NOT EXISTS timeline_tr_slots_upd BEFORE UPDATE OF slot_count ON timeline_transitions
            WHEN EXISTS (SELECT 1 FROM timeline_assignments a WHERE a.transition_id = NEW.id
                         AND a.slot_index >= NEW.slot_count)
            ${raise("E-A2: slot_count below an occupied slot")}`,

        // I-A1 (transition side): a pure check. The anchored range edit (R-E1) is an app
        // procedure, not a trigger (U-1).
        timeline_tr_range_check: `
            CREATE TRIGGER IF NOT EXISTS timeline_tr_range_check
            BEFORE UPDATE OF start_beat, end_beat ON timeline_transitions
            WHEN EXISTS (SELECT 1 FROM timeline_assignments a WHERE a.transition_id = NEW.id
                         AND (a.start_beat < NEW.start_beat OR a.end_beat > NEW.end_beat))
            ${raise("E-A1: range change strands an assignment")}`,
    };
}

/** I-T3, I-T4 and I-T6: destination shapes and individually placed destinations. */
function timelineDestinationTriggers(): Record<string, string> {
    const sdWhen = `
        WHEN NOT EXISTS (SELECT 1 FROM timeline_transitions t WHERE t.id = NEW.transition_id
                         AND t.dest_shape_id IS NULL AND NEW.slot_index < t.slot_count)`;
    const sdMessage =
        "E-T6: destination row on a shaped transition or outside slot_count";

    const trDestWhen = `
        WHEN EXISTS (SELECT 1 FROM timeline_shapes s WHERE s.id = NEW.dest_shape_id AND s.kind = 'block'
                     AND (NEW.path_style = 'follow_the_leader'
                          OR json_extract(s.geometry, '$.rows') * json_extract(s.geometry, '$.cols') < NEW.slot_count))`;
    const trDestMessage =
        "E-T3/E-T4: block shape used for FTL or over capacity";

    return {
        // I-T6 (row side): a destination belongs to a shapeless transition and one of its slots
        timeline_sd_ins: `
            CREATE TRIGGER IF NOT EXISTS timeline_sd_ins BEFORE INSERT ON timeline_slot_destinations
            ${sdWhen}
            ${raise(sdMessage)}`,
        timeline_sd_upd: `
            CREATE TRIGGER IF NOT EXISTS timeline_sd_upd BEFORE UPDATE ON timeline_slot_destinations
            ${sdWhen}
            ${raise(sdMessage)}`,

        // I-T6 (transition side): a shape and individual destinations are exclusive, and
        // slot_count keeps the destination rows valid. Completeness is checked at commit
        // through timeline_commit_violations.
        timeline_tr_shape_set: `
            CREATE TRIGGER IF NOT EXISTS timeline_tr_shape_set BEFORE UPDATE OF dest_shape_id ON timeline_transitions
            WHEN NEW.dest_shape_id IS NOT NULL
                 AND EXISTS (SELECT 1 FROM timeline_slot_destinations d WHERE d.transition_id = NEW.id)
            ${raise("E-T6: remove individual destinations before assigning a shape")}`,
        timeline_tr_slots_dest_upd: `
            CREATE TRIGGER IF NOT EXISTS timeline_tr_slots_dest_upd BEFORE UPDATE OF slot_count ON timeline_transitions
            WHEN EXISTS (SELECT 1 FROM timeline_slot_destinations d WHERE d.transition_id = NEW.id
                         AND d.slot_index >= NEW.slot_count)
            ${raise("E-T6: slot_count below a placed destination")}`,

        // I-T3, I-T4: the destination shape suits the path style and slot_count
        timeline_tr_dest_ins: `
            CREATE TRIGGER IF NOT EXISTS timeline_tr_dest_ins BEFORE INSERT ON timeline_transitions
            ${trDestWhen}
            ${raise(trDestMessage)}`,
        timeline_tr_dest_upd: `
            CREATE TRIGGER IF NOT EXISTS timeline_tr_dest_upd
            BEFORE UPDATE OF dest_shape_id, path_style, slot_count ON timeline_transitions
            ${trDestWhen}
            ${raise(trDestMessage)}`,
        timeline_shape_dest_upd: `
            CREATE TRIGGER IF NOT EXISTS timeline_shape_dest_upd BEFORE UPDATE OF kind, geometry ON timeline_shapes
            WHEN NEW.kind = 'block' AND EXISTS (SELECT 1 FROM timeline_transitions t WHERE t.dest_shape_id = NEW.id
                 AND (t.path_style = 'follow_the_leader'
                      OR json_extract(NEW.geometry, '$.rows') * json_extract(NEW.geometry, '$.cols') < t.slot_count))
            ${raise("E-T3/E-T4: shape change invalidates a transition using it")}`,
    };
}

/**
 * A REAL column as a JSON number that parses back to the identical double. SQLite's default text
 * rendering keeps 15 significant digits, so the running resolver store, which is fed by these
 * images, would drift from the stored value by a few units in the last place. `%!.17g` (the `!`
 * flag lifts SQLite's 16-digit cap) always round-trips. `json()` keeps the text as a JSON number
 * rather than a string. REAL columns hold finite values, so the result is always valid JSON.
 */
function exactReal(column: string): string {
    return `json(printf('%!.17g', ${column}))`;
}

/**
 * The change-log triggers (spec §10.2, ADR 0001 §5): one `timeline_change_log` row per changed
 * row, with the spec's logical table name and JSON row image, so a drained log is a
 * `ChangeBatch` without translation. They fire for foreign-key cascades too. They write only to
 * the bookkeeping table (U-1). Timelines are not logged (R-1).
 */
function timelineChangeLogTriggers(): Record<string, string> {
    const loggedTables: {
        table: string;
        /** The spec's logical table name, written to `tbl` */
        logicalName: string;
        rowId: (row: "NEW" | "OLD") => string;
        image: (row: "NEW" | "OLD") => string;
        /** Columns whose update fires the update trigger; any column when omitted */
        updateOf?: string[];
    }[] = [
        {
            // Homes are the only part of a marcher that affects resolution (C-5), so edits to
            // its name, section or drill number don't log
            table: "marchers",
            logicalName: "marchers",
            rowId: (r) => `${r}.id`,
            image: (r) =>
                `json_object('id', ${r}.id, 'home', json_array(${exactReal(`${r}.home_x`)}, ${exactReal(`${r}.home_y`)}))`,
            updateOf: ["home_x", "home_y"],
        },
        {
            table: "timeline_shapes",
            logicalName: "shapes",
            rowId: (r) => `${r}.id`,
            image: (r) =>
                `json_object('id', ${r}.id, 'kind', ${r}.kind, 'geometry', json(${r}.geometry))`,
        },
        {
            table: "timeline_transitions",
            logicalName: "transitions",
            rowId: (r) => `${r}.id`,
            image: (r) =>
                `json_object('id', ${r}.id, 'dest', ${r}.dest_shape_id, 'style', ${r}.path_style, ` +
                `'params', json(${r}.path_params), 'order', ${r}.order_mode, 'slots', ${r}.slot_count, ` +
                `'start', ${r}.start_beat, 'end', ${r}.end_beat)`,
        },
        {
            table: "timeline_assignments",
            logicalName: "assignments",
            rowId: (r) => `${r}.id`,
            image: (r) =>
                `json_object('id', ${r}.id, 'marcher', ${r}.marcher_id, 'transition', ${r}.transition_id, ` +
                `'slot', ${r}.slot_index, 'start', ${r}.start_beat, 'end', ${r}.end_beat, 'layer', ${r}.layer)`,
        },
        {
            // Logged under the transition id: the resolver recomputes that transition's
            // destinations as a whole (spec §10.2, QA-DB-41)
            table: "timeline_slot_destinations",
            logicalName: "slot_destinations",
            rowId: (r) => `${r}.transition_id`,
            image: (r) =>
                `json_object('transition', ${r}.transition_id, 'slot', ${r}.slot_index, 'x', ${exactReal(`${r}.x`)}, 'y', ${exactReal(`${r}.y`)})`,
        },
    ];

    const insertLog = (
        logicalName: string,
        rowId: string,
        before: string,
        after: string,
    ) =>
        `BEGIN INSERT INTO timeline_change_log (tbl, row_id, "before", "after") ` +
        `VALUES ('${logicalName}', ${rowId}, ${before}, ${after}); END;`;

    const result: Record<string, string> = {};
    for (const { table, logicalName, rowId, image, updateOf } of loggedTables) {
        const insName = `timeline_log_${table.replace(/^timeline_/, "")}_ins`;
        const updName = `timeline_log_${table.replace(/^timeline_/, "")}_upd`;
        const delName = `timeline_log_${table.replace(/^timeline_/, "")}_del`;
        result[insName] =
            `CREATE TRIGGER IF NOT EXISTS ${insName} AFTER INSERT ON ${table} ` +
            insertLog(logicalName, rowId("NEW"), "NULL", image("NEW"));
        result[updName] =
            `CREATE TRIGGER IF NOT EXISTS ${updName} AFTER UPDATE ` +
            (updateOf ? `OF ${updateOf.join(", ")} ` : "") +
            `ON ${table} ` +
            insertLog(logicalName, rowId("NEW"), image("OLD"), image("NEW"));
        result[delName] =
            `CREATE TRIGGER IF NOT EXISTS ${delName} AFTER DELETE ON ${table} ` +
            insertLog(logicalName, rowId("OLD"), image("OLD"), "NULL");
    }
    return result;
}

/**
 * The page-era freeze (P9.5): with the file's timeline flag on, the page-era tables refuse every
 * insert, update and delete. They stay readable for one release and are dropped in Phase 10.
 * With the flag off (page mode) the triggers do nothing. The app refuses these writes itself first
 * (`pageEraFreeze.ts`, `pageShapesGate.ts`); the triggers are the backstop.
 *
 * One exception: a row whose parent row is already gone may be deleted, and (only possible with
 * foreign keys off, as in undo replay) inserted. That is what lets a marcher or page delete
 * cascade into its frozen rows (SQLite deletes the parent before running the cascade), lets
 * `repair` remove orphans, and lets undo and redo of that delete restore and remove the rows,
 * since history logs the parent first. A row with all its parents present can't change. Tables
 * with no parent (`pathways`, `shapes`) refuse every write.
 */
function pageEraFreezeTriggers(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const { table, parents } of PAGE_ERA_FROZEN_TABLES) {
        const message = `${table} ${PAGE_ERA_FROZEN_RAISE_SUFFIX}`;
        const parentsPresent = (row: "NEW" | "OLD") =>
            parents
                .map(
                    (p) =>
                        ` AND EXISTS (SELECT 1 FROM ${p.table} WHERE id = ${row}.${p.column})`,
                )
                .join("");
        const name = `${PAGE_ERA_FROZEN_TRIGGER_PREFIX}${table}`;
        result[`${name}_ins`] =
            `CREATE TRIGGER IF NOT EXISTS ${name}_ins BEFORE INSERT ON ${table} ` +
            `WHEN ${TIMELINE_MODE_ON}${parentsPresent("NEW")} ${raise(message)}`;
        result[`${name}_upd`] =
            `CREATE TRIGGER IF NOT EXISTS ${name}_upd BEFORE UPDATE ON ${table} ` +
            `WHEN ${TIMELINE_MODE_ON} ${raise(message)}`;
        result[`${name}_del`] =
            `CREATE TRIGGER IF NOT EXISTS ${name}_del BEFORE DELETE ON ${table} ` +
            `WHEN ${TIMELINE_MODE_ON}${parentsPresent("OLD")} ${raise(message)}`;
    }
    return result;
}

/**
 * Trigger SQL as `sqlite_master` stores it: SQLite drops the `IF NOT EXISTS` clause and the
 * trailing semicolon; whitespace differences are ignored too.
 */
const normalizeTriggerSql = (sql: string) =>
    sql
        .replace(/\s+/g, " ")
        .replace(/CREATE TRIGGER IF NOT EXISTS/i, "CREATE TRIGGER")
        .trim()
        .replace(/;$/, "")
        .trim();

/**
 * Brings the change-log triggers up to this build's bodies. Drizzle's sqlite-proxy `migrate` calls
 * the migration service's callback on every open, even with no migration pending, and that
 * callback runs `dropAllTriggers` then `createAllTriggers`, so every trigger in the `triggers`
 * map is normally rebuilt on open already. This check is a second line that doesn't depend on
 * that drizzle behavior: it runs after the migrations, on every open, after the file-version
 * guard. Only missing or changed triggers are recreated, so it writes nothing to an up-to-date
 * file, and the recreation is one transaction, so a failure can't leave a trigger dropped.
 */
export const recreateChangeLogTriggers = (dbConnection: DatabaseSync) =>
    recreateTriggersIfStale(dbConnection, timelineChangeLogTriggers());

/**
 * Adds the page-era freeze triggers (P9.5) to a file migrated before they existed, or brings
 * their bodies up to this build's, like `recreateChangeLogTriggers`. The migration service calls
 * it on every open, after the file-version guard; an up-to-date file isn't written to.
 */
export const recreatePageEraFreezeTriggers = (dbConnection: DatabaseSync) =>
    recreateTriggersIfStale(dbConnection, pageEraFreezeTriggers());

/**
 * Drops the page-era freeze triggers the database has, and returns a function that puts the same
 * ones back. For `repair`, which copies a timeline-mode file's settings (flag on) and then its
 * frozen rows into a fresh file.
 */
export const liftPageEraFreezeTriggers = (
    dbConnection: DatabaseSync,
): (() => void) => {
    const names = new Set(Object.keys(pageEraFreezeTriggers()));
    const present = (
        dbConnection
            .prepare(
                `SELECT name, sql FROM sqlite_master WHERE type = 'trigger'`,
            )
            .all() as { name: string; sql: string }[]
    ).filter((row) => names.has(row.name));
    for (const { name } of present)
        dbConnection.exec(`DROP TRIGGER IF EXISTS ${name}`);
    return () => {
        for (const { sql } of present) dbConnection.exec(sql);
    };
};

/**
 * Recreates the triggers in `wantedTriggers` that are missing or whose stored body differs, in
 * one transaction. Writes nothing when all are current.
 */
const recreateTriggersIfStale = (
    dbConnection: DatabaseSync,
    wantedTriggers: Record<string, string>,
) => {
    const wanted = Object.entries(wantedTriggers);
    const names = new Set(Object.keys(wantedTriggers));
    const current = new Map(
        (
            dbConnection
                .prepare(
                    `SELECT name, sql FROM sqlite_master WHERE type = 'trigger'`,
                )
                .all() as { name: string; sql: string }[]
        )
            .filter((row) => names.has(row.name))
            .map((row) => [row.name, normalizeTriggerSql(row.sql)]),
    );
    const stale = wanted.filter(
        ([name, trigger]) => current.get(name) !== normalizeTriggerSql(trigger),
    );
    if (stale.length === 0) return;

    dbConnection.exec("BEGIN IMMEDIATE");
    try {
        for (const [name, trigger] of stale) {
            dbConnection.exec(`DROP TRIGGER IF EXISTS ${name}`);
            dbConnection.exec(trigger);
        }
        dbConnection.exec("COMMIT");
    } catch (error) {
        dbConnection.exec("ROLLBACK");
        throw error;
    }
};

/**
 * Drops all triggers and views from the database.
 * @param db - The database instance to drop triggers from.
 */
export const dropAllTriggers = (dbConnection: DatabaseSync) => {
    for (const [name] of Object.entries(triggers)) {
        try {
            dbConnection.exec(`DROP TRIGGER IF EXISTS ${name}`);
        } catch (error) {
            console.error(`Error dropping trigger ${name}:`, error);
            throw error;
        }
    }
    for (const [name] of Object.entries(views)) {
        try {
            dbConnection.exec(`DROP VIEW IF EXISTS ${name}`);
        } catch (error) {
            console.error(`Error dropping view ${name}:`, error);
            throw error;
        }
    }
};

/**
 * Creates all triggers and views in the database.
 * @param db - The database instance to create triggers in.
 */
export const createAllTriggers = (dbConnection: DatabaseSync) => {
    for (const [name, trigger] of Object.entries(triggers)) {
        try {
            dbConnection.exec(`${trigger}`);
        } catch (error) {
            console.error(`Error creating trigger ${name}:`, error);
            throw error;
        }
    }
    for (const [name, view] of Object.entries(views)) {
        try {
            dbConnection.exec(`${view}`);
        } catch (error) {
            console.error(`Error creating view ${name}:`, error);
            throw error;
        }
    }
};
