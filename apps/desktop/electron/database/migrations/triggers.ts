import { DatabaseSync } from "node:sqlite";

/**
 * Every trigger, by name. `transitionRoute` says whether `timeline_transitions` has `route_id`
 * (migration 0024): a file opened with an older migrations folder, as some migration tests do,
 * logs transitions without it.
 */
const buildTriggers = (transitionRoute = true) => ({
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
    ...timelineChangeLogTriggers(transitionRoute),
});
const triggers = buildTriggers();

/** Whether the file's `timeline_transitions` has `route_id` (migration 0024). */
const hasTransitionRoute = (dbConnection: DatabaseSync): boolean =>
    (
        dbConnection
            .prepare(
                "SELECT 1 FROM pragma_table_info('timeline_transitions') WHERE name = 'route_id'",
            )
            .all() as unknown[]
    ).length > 0;

/**
 * Views that depend on tables created by migrations. Dropped before migrations run (so a table
 * rebuild never trips over a view that references it) and recreated after.
 */
const views = {
    /**
     * Commit-time invariants (spec §6): the write wrapper aborts an edit if this returns any row.
     * I-T6 completeness can only be judged once the whole edit has run, because a transition and
     * its destinations are inserted in the same edit. E-T1 here is C-11: a transition's range
     * equals its timeline's. The row trigger only keeps a transition inside its timeline, because
     * range edits (shift, ripple, R-E1) pass through states where the two differ (D-17).
     */
    timeline_commit_violations: `
        CREATE VIEW IF NOT EXISTS timeline_commit_violations AS
            SELECT 'E-T6' AS code, t.id AS transition_id,
                   'shapeless transition has '
                       || (SELECT count(*) FROM timeline_slot_destinations d WHERE d.transition_id = t.id)
                       || ' of ' || t.slot_count || ' destinations' AS detail
              FROM timeline_transitions t
             WHERE t.dest_shape_id IS NULL
               AND (SELECT count(*) FROM timeline_slot_destinations d WHERE d.transition_id = t.id) <> t.slot_count
            UNION ALL
            SELECT 'E-T1' AS code, t.id AS transition_id,
                   'transition spans [' || t.start_beat || ', ' || t.end_beat
                       || ') but its timeline spans [' || l.start_beat || ', ' || l.end_beat || ')' AS detail
              FROM timeline_transitions t
              JOIN timelines l ON l.id = t.timeline_id
             WHERE t.start_beat <> l.start_beat OR t.end_beat <> l.end_beat;
    `,
    /**
     * The Held marks' commit-time invariants (ADR 0012 amendment 2026-10-30): no move of a
     * marcher overlaps one of its marks (E-H1), and one marcher's marks don't overlap (E-H3).
     * They name no transition (NULL); the detail names the marcher and the counts. Apart from
     * `timeline_commit_violations` because the marks table comes with a timeline-only migration:
     * a page-era file being converted commits timeline rows before it has the table, so the
     * write wrapper reads this view only once the table exists.
     */
    /**
     * The routes' and lanes' commit-time invariants (spec v0.10 §6 and J.3, ADR 0017; plan step
     * 24): every route is walked through a lane whose slot holds a marcher at some beat (E-R3,
     * I-R3′); only a follow-the-leader transition carries a route, as its trail (E-R2, I-R2′),
     * which also keeps step 15's retired `route` style out; an own lane is its route's only lane
     * (E-R4, I-LN4); every lane of a route is in one move (E-R5, I-LN5; one range by C-11); and a
     * lane on a follow-the-leader transition is its trail lane (E-LN2, I-LN2). Since step 3b an
     * own lane carries no Adjust (E-R4), an Adjust's anchors name points of its route (E-J3, I-J3)
     * and two keys on one straight corner-to-corner stretch are at least a step apart, 126.5625
     * being `s_min` squared (E-J5, I-J5; I-J4 in full needs `D` on curves and arcs, so the write
     * path has it; an arc leg, R-14″, is not straight, so it is left out here). Apart from
     * `timeline_commit_violations` for the same reason as `timeline_held_violations`: the write
     * wrapper reads it once the lanes table exists, and a view that names a missing table would
     * break a later table rebuild.
     */
    timeline_route_violations: `
        CREATE VIEW IF NOT EXISTS timeline_route_violations AS
            SELECT 'E-R3' AS code, NULL AS transition_id,
                   'route ' || r.id || ' is walked by nobody' AS detail
              FROM timeline_routes r
             WHERE NOT EXISTS (SELECT 1 FROM timeline_lanes l
                                 JOIN timeline_assignments a
                                   ON a.transition_id = l.transition_id AND a.slot_index = l.slot_index
                                WHERE l.route_id = r.id)
               AND NOT EXISTS (SELECT 1 FROM timeline_transitions t
                                WHERE t.route_id = r.id AND t.path_style = 'follow_the_leader')
            UNION ALL
            SELECT 'E-R2' AS code, t.id AS transition_id,
                   'a ' || t.path_style || ' transition has a route' AS detail
              FROM timeline_transitions t
             WHERE (t.path_style <> 'follow_the_leader' AND t.route_id IS NOT NULL)
                OR t.path_style = 'route'
            UNION ALL
            SELECT 'E-R4' AS code, l.transition_id AS transition_id,
                   'route ' || l.route_id || ' is shared but the lane on slot ' || l.slot_index
                       || ' has no offset' AS detail
              FROM timeline_lanes l
              JOIN timeline_transitions t ON t.id = l.transition_id
             WHERE l.offset_x IS NULL AND t.path_style <> 'follow_the_leader'
               AND (SELECT count(*) FROM timeline_lanes u WHERE u.route_id = l.route_id) > 1
            UNION ALL
            SELECT 'E-R5' AS code, l.transition_id AS transition_id,
                   'route ' || l.route_id || ' has lanes in two moves' AS detail
              FROM timeline_lanes l
              JOIN timeline_transitions t ON t.id = l.transition_id
              JOIN timeline_lanes u ON u.route_id = l.route_id AND u.id < l.id
              JOIN timeline_transitions v ON v.id = u.transition_id
             WHERE t.timeline_id <> v.timeline_id
            UNION ALL
            SELECT 'E-LN2' AS code, l.transition_id AS transition_id,
                   'the lane on slot ' || l.slot_index
                       || ' of a follow-the-leader move is not its trail' AS detail
              FROM timeline_lanes l
              JOIN timeline_transitions t ON t.id = l.transition_id
             WHERE t.path_style = 'follow_the_leader'
               AND (l.offset_x IS NOT NULL OR t.route_id IS NULL OR l.route_id <> t.route_id)
            UNION ALL
            SELECT 'E-R4' AS code, l.transition_id AS transition_id,
                   'the own lane on slot ' || l.slot_index || ' has an Adjust' AS detail
              FROM timeline_lanes l
              JOIN timeline_transitions t ON t.id = l.transition_id
             WHERE l.offset_x IS NULL AND l.adjust IS NOT NULL
               AND t.path_style <> 'follow_the_leader'
            UNION ALL
            SELECT 'E-J3' AS code, l.transition_id AS transition_id,
                   'an Adjust on slot ' || l.slot_index || ' names a missing point' AS detail
              FROM timeline_lanes l, json_each(l.adjust, '$.keys') k, timeline_routes r
             WHERE r.id = l.route_id
               AND ((json_extract(k.value, '$.a') <> 'from' AND NOT EXISTS (
                        SELECT 1 FROM json_each(r.geometry, '$.points') p
                         WHERE json_extract(p.value, '$.id') = json_extract(k.value, '$.a')))
                 OR (json_extract(k.value, '$.b') <> 'to' AND NOT EXISTS (
                        SELECT 1 FROM json_each(r.geometry, '$.points') p
                         WHERE json_extract(p.value, '$.id') = json_extract(k.value, '$.b'))))
            UNION ALL
            SELECT 'E-J5' AS code, l.transition_id AS transition_id,
                   'two Adjust keys on slot ' || l.slot_index || ' are closer than a step' AS detail
              FROM timeline_lanes l, json_each(l.adjust, '$.keys') k1, json_each(l.adjust, '$.keys') k2
             WHERE k2.key > k1.key
               AND json_extract(k2.value, '$.a') = json_extract(k1.value, '$.a')
               AND json_extract(k2.value, '$.b') = json_extract(k1.value, '$.b')
               AND (json_extract(k1.value, '$.f') = json_extract(k2.value, '$.f')
                 OR EXISTS (
                    SELECT 1 FROM timeline_routes r, json_each(r.geometry, '$.points') pa,
                                  json_each(r.geometry, '$.points') pb
                     WHERE r.id = l.route_id AND pb.key = pa.key + 1
                       AND json_extract(pa.value, '$.id') = json_extract(k1.value, '$.a')
                       AND json_extract(pb.value, '$.id') = json_extract(k1.value, '$.b')
                       AND json_type(pa.value, '$.tension') IS NULL
                       AND json_type(pb.value, '$.tension') IS NULL
                       AND json_type(pb.value, '$.bulge') IS NULL
                       AND (json_extract(k1.value, '$.f') - json_extract(k2.value, '$.f'))
                           * (json_extract(k1.value, '$.f') - json_extract(k2.value, '$.f'))
                           * ((json_extract(pb.value, '$.at[0]') - json_extract(pa.value, '$.at[0]'))
                              * (json_extract(pb.value, '$.at[0]') - json_extract(pa.value, '$.at[0]'))
                            + (json_extract(pb.value, '$.at[1]') - json_extract(pa.value, '$.at[1]'))
                              * (json_extract(pb.value, '$.at[1]') - json_extract(pa.value, '$.at[1]')))
                           < 126.5625));
    `,
    timeline_held_violations: `
        CREATE VIEW IF NOT EXISTS timeline_held_violations AS
            SELECT 'E-H1' AS code, NULL AS transition_id,
                   'marcher ' || h.marcher_id || ' is Held over [' || h.start_beat || ', '
                       || h.end_beat || ') but has a move over [' || a.start_beat || ', '
                       || a.end_beat || ')' AS detail
              FROM timeline_held_marks h
              JOIN timeline_assignments a ON a.marcher_id = h.marcher_id
             WHERE a.start_beat < h.end_beat AND h.start_beat < a.end_beat
            UNION ALL
            SELECT 'E-H3' AS code, NULL AS transition_id,
                   'marcher ' || h.marcher_id || ' is Held over [' || h.start_beat || ', '
                       || h.end_beat || ') and over [' || o.start_beat || ', ' || o.end_beat
                       || ')' AS detail
              FROM timeline_held_marks h
              JOIN timeline_held_marks o ON o.marcher_id = h.marcher_id AND o.id > h.id
             WHERE o.start_beat < h.end_beat AND h.start_beat < o.end_beat;
    `,
};

/**
 * The timeline invariant triggers (spec §5.1 and §6, ADR 0012 §2), named with a `timeline_`
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
        ...timelineLaneTriggers(),
    };
}

/**
 * I-LN1 (spec v0.10 §6, plan step 24): a lane's slot is one of its transition's, checked from both
 * sides (U-3): when a lane is written, and when a transition's `slot_count` drops. The edits that
 * lower a slot count delete or move the lanes above it first (AP-R15, AP-R20).
 */
function timelineLaneTriggers(): Record<string, string> {
    const laneSlotWhen = `
        WHEN NOT EXISTS (SELECT 1 FROM timeline_transitions t WHERE t.id = NEW.transition_id
                         AND NEW.slot_index < t.slot_count)`;
    const laneSlotMessage = "E-LN1: lane outside the slots of its transition";
    return {
        timeline_lane_slot_ins: `
            CREATE TRIGGER IF NOT EXISTS timeline_lane_slot_ins BEFORE INSERT ON timeline_lanes
            ${laneSlotWhen}
            ${raise(laneSlotMessage)}`,
        timeline_lane_slot_upd: `
            CREATE TRIGGER IF NOT EXISTS timeline_lane_slot_upd BEFORE UPDATE ON timeline_lanes
            ${laneSlotWhen}
            ${raise(laneSlotMessage)}`,
        timeline_tr_slots_lane_upd: `
            CREATE TRIGGER IF NOT EXISTS timeline_tr_slots_lane_upd BEFORE UPDATE OF slot_count ON timeline_transitions
            WHEN EXISTS (SELECT 1 FROM timeline_lanes l WHERE l.transition_id = NEW.id
                         AND l.slot_index >= NEW.slot_count)
            ${raise("E-LN1: slot_count below a lane")}`,
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
 * The change-log triggers (spec §10.2, ADR 0012 §5): one `timeline_change_log` row per changed
 * row, with the spec's logical table name and JSON row image, so a drained log is a
 * `ChangeBatch` without translation. They fire for foreign-key cascades too. They write only to
 * the bookkeeping table (U-1). Timelines are not logged (R-1).
 */
function timelineChangeLogTriggers(
    transitionRoute = true,
): Record<string, string> {
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
                `'start', ${r}.start_beat, 'end', ${r}.end_beat` +
                (transitionRoute ? `, 'route', ${r}.route_id)` : `)`),
        },
        {
            // Routes are logged like shapes (spec v0.9 §10.2)
            table: "timeline_routes",
            logicalName: "routes",
            rowId: (r) => `${r}.id`,
            image: (r) =>
                `json_object('id', ${r}.id, 'geometry', json(${r}.geometry))`,
        },
        {
            // Lanes are logged like routes (spec v0.10 J.1, §10.2); the resolver reads them from
            // the host mirror and seeds their transitions
            table: "timeline_lanes",
            logicalName: "lanes",
            rowId: (r) => `${r}.id`,
            image: (r) =>
                `json_object('id', ${r}.id, 'transition', ${r}.transition_id, 'slot', ${r}.slot_index, ` +
                `'route', ${r}.route_id, 'offset', CASE WHEN ${r}.offset_x IS NULL THEN NULL ` +
                `ELSE json_array(${exactReal(`${r}.offset_x`)}, ${exactReal(`${r}.offset_y`)}) END, ` +
                `'adjust', json(${r}.adjust))`,
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
    recreateTriggersIfStale(
        dbConnection,
        onExistingTables(
            dbConnection,
            timelineChangeLogTriggers(hasTransitionRoute(dbConnection)),
        ),
    );

/** The table a trigger is on, read from its header (`... ON <table>` before WHEN or BEGIN). */
export const triggerTable = (triggerSql: string): string => {
    const header = triggerSql.split(/\b(?:WHEN|BEGIN)\b/)[0]!;
    const match = /\bON\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/.exec(header);
    if (!match) throw new Error(`No table in trigger: ${triggerSql}`);
    return match[1]!;
};

/**
 * Whether a trigger can be created on a file with `tables`: its table exists, and so does the
 * lanes table when its body reads it (`timeline_tr_slots_lane_upd` is on transitions).
 */
const triggerFits = (sql: string, tables: ReadonlySet<string>): boolean =>
    tables.has(triggerTable(sql)) &&
    (!/\btimeline_lanes\b/.test(sql) || tables.has("timeline_lanes"));

/**
 * Only the triggers whose table the file has. A table a later migration adds, such as the routes
 * table (0024) or the lanes table (0025), is missing from a page-era file until it converts; its
 * triggers come with it.
 */
const onExistingTables = (
    dbConnection: DatabaseSync,
    wanted: Record<string, string>,
): Record<string, string> => {
    const tables = new Set(
        (
            dbConnection
                .prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")
                .all() as { name: string }[]
        ).map((row) => row.name),
    );
    return Object.fromEntries(
        Object.entries(wanted).filter(([, sql]) => triggerFits(sql, tables)),
    );
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
    for (const [name, trigger] of Object.entries(
        onExistingTables(
            dbConnection,
            buildTriggers(hasTransitionRoute(dbConnection)),
        ),
    )) {
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

/**
 * The statements `dropAllTriggers` and `createAllTriggers` run, for a caller without a raw
 * connection (tests that convert through the SQL proxy). `tables` are the file's tables after the
 * migrations, and `transitionRoute` whether `timeline_transitions` has `route_id`.
 */
export function triggerStatements(
    tables: ReadonlySet<string>,
    transitionRoute: boolean,
): { drop: string[]; create: string[] } {
    const all = buildTriggers(transitionRoute);
    return {
        drop: [
            ...Object.keys(triggers).map(
                (name) => `DROP TRIGGER IF EXISTS ${name}`,
            ),
            ...Object.keys(views).map((name) => `DROP VIEW IF EXISTS ${name}`),
        ],
        create: [
            ...Object.values(all).filter((s) => triggerFits(s, tables)),
            ...Object.values(views),
        ],
    };
}
