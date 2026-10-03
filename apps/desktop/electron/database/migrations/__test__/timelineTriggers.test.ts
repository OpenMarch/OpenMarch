import { describe, expect } from "vitest";
import { sql } from "drizzle-orm";
import { DbConnection, describeDbTests } from "@/test/base";

/**
 * Smoke tests for the timeline schema, invariant triggers, commit-time view and change log
 * (docs/timeline/phases/03-storage.md P3.2 to P3.4). They show each trigger fires. The full
 * QA-DB suite is P3.6.
 */

const exec = (db: DbConnection, statement: string) =>
    db.run(sql.raw(statement));

/** Rows as arrays of column values, in SELECT order (the proxy's raw row shape). */
const all = (db: DbConnection, statement: string) =>
    db.all<unknown[]>(sql.raw(statement));

/** Asserts that a statement fails with a message (or a cause's message) matching `pattern`. */
const expectError = async (statement: Promise<unknown>, pattern: RegExp) => {
    const error = await statement.then(
        () => undefined,
        (e: unknown) => e,
    );
    expect(error, "expected the statement to fail").toBeInstanceOf(Error);
    const messages: string[] = [];
    for (let e: unknown = error; e instanceof Error; e = e.cause)
        messages.push(e.message);
    expect(messages.join("\n")).toMatch(pattern);
};

/** Two marchers, one timeline over [0, 64), a line and a 1x2 block, and a 2-slot transition on the line over [0, 16). */
const seed = async (db: DbConnection) => {
    await exec(
        db,
        `INSERT INTO marchers (id, section, drill_prefix, drill_order) VALUES
            (1, 'Brass', 'B', 1), (2, 'Brass', 'B', 2)`,
    );
    await exec(
        db,
        `INSERT INTO timelines (id, start_beat, end_beat) VALUES (1, 0, 64)`,
    );
    await exec(
        db,
        `INSERT INTO timeline_shapes (id, kind, geometry) VALUES
            (1, 'line', '{"points":[[0,0],[10,0]]}'),
            (2, 'block', '{"origin":[0,0],"rows":1,"cols":2,"spacing":[1,1]}')`,
    );
    await exec(
        db,
        `INSERT INTO timeline_transitions (id, timeline_id, dest_shape_id, slot_count, start_beat, end_beat)
            VALUES (1, 1, 1, 2, 0, 16)`,
    );
    await exec(db, `DELETE FROM timeline_change_log`);
};

describeDbTests("timeline schema and triggers", (it) => {
    describe("typeof CHECKs (C-3)", () => {
        it("rejects fractional and text values in integer columns", async ({
            db,
        }) => {
            await seed(db);
            await expectError(
                exec(
                    db,
                    `INSERT INTO timeline_assignments (marcher_id, transition_id, slot_index, start_beat, end_beat)
                        VALUES (1, 1, 0, 0.5, 16)`,
                ),
                /CHECK constraint failed/,
            );
            await expectError(
                exec(
                    db,
                    `INSERT INTO timelines (start_beat, end_beat) VALUES ('abc', 8)`,
                ),
                /CHECK constraint failed/,
            );
            await expectError(
                exec(db, `UPDATE marchers SET home_x = 'abc' WHERE id = 1`),
                /CHECK constraint failed/,
            );
        });

        it("accepts numeric-looking text, coerced by integer affinity (the known difference from STRICT)", async ({
            db,
        }) => {
            await seed(db);
            await exec(
                db,
                `INSERT INTO timeline_assignments (id, marcher_id, transition_id, slot_index, start_beat, end_beat, layer)
                    VALUES (1, 1, 1, 0, 0, 16, '5')`,
            );
            const rows = await all(
                db,
                `SELECT typeof(layer) AS t, layer FROM timeline_assignments WHERE id = 1`,
            );
            expect(rows).toEqual([["integer", 5]]);
        });

        it("rejects a home outside the coordinate bound", async ({ db }) => {
            await seed(db);
            await expectError(
                exec(
                    db,
                    `INSERT INTO marchers (section, drill_prefix, drill_order, home_x) VALUES ('Brass', 'B', 3, 1e7)`,
                ),
                /CHECK constraint failed/,
            );
            await expectError(
                exec(db, `UPDATE marchers SET home_y = -1e7 WHERE id = 1`),
                /CHECK constraint failed/,
            );
            await expectError(
                exec(db, `UPDATE marchers SET home_x = 1e999 WHERE id = 1`),
                /CHECK constraint failed/,
            );
        });

        it("defaults a marcher's home to the origin", async ({ db }) => {
            await seed(db);
            const rows = await all(
                db,
                `SELECT home_x, home_y FROM marchers ORDER BY id`,
            );
            expect(rows).toEqual([
                [0, 0],
                [0, 0],
            ]);
        });
    });

    describe("foreign keys (C-1)", () => {
        it("RESTRICTs deleting a timeline, transition or shape that has children", async ({
            db,
        }) => {
            await seed(db);
            await exec(
                db,
                `INSERT INTO timeline_assignments (marcher_id, transition_id, slot_index, start_beat, end_beat)
                    VALUES (1, 1, 0, 0, 16)`,
            );
            await expectError(
                exec(db, `DELETE FROM timelines WHERE id = 1`),
                /FOREIGN KEY constraint failed/,
            );
            await expectError(
                exec(db, `DELETE FROM timeline_transitions WHERE id = 1`),
                /FOREIGN KEY constraint failed/,
            );
            await expectError(
                exec(db, `DELETE FROM timeline_shapes WHERE id = 1`),
                /FOREIGN KEY constraint failed/,
            );

            // Child-first deletes succeed
            await exec(
                db,
                `DELETE FROM timeline_assignments WHERE transition_id = 1`,
            );
            await exec(db, `DELETE FROM timeline_transitions WHERE id = 1`);
            await exec(db, `DELETE FROM timelines WHERE id = 1`);
            await exec(db, `DELETE FROM timeline_shapes WHERE id = 1`);
        });

        it("cascades a marcher delete to its assignments", async ({ db }) => {
            await seed(db);
            await exec(
                db,
                `INSERT INTO timeline_assignments (marcher_id, transition_id, slot_index, start_beat, end_beat)
                    VALUES (1, 1, 0, 0, 16)`,
            );
            await exec(db, `DELETE FROM marchers WHERE id = 1`);
            const counts = await all(
                db,
                `SELECT count(*) FROM timeline_assignments`,
            );
            expect(counts).toEqual([[0]]);
        });
    });

    describe("invariant triggers", () => {
        it("asn_bounds: an assignment stays inside its transition's range and slot_count (E-A1, E-A2)", async ({
            db,
        }) => {
            await seed(db);
            await expectError(
                exec(
                    db,
                    `INSERT INTO timeline_assignments (marcher_id, transition_id, slot_index, start_beat, end_beat)
                        VALUES (1, 1, 0, 0, 20)`,
                ),
                /E-A1/,
            );
            await expectError(
                exec(
                    db,
                    `INSERT INTO timeline_assignments (marcher_id, transition_id, slot_index, start_beat, end_beat)
                        VALUES (1, 1, 2, 0, 16)`,
                ),
                /E-A2/,
            );
            await exec(
                db,
                `INSERT INTO timeline_assignments (id, marcher_id, transition_id, slot_index, start_beat, end_beat)
                    VALUES (1, 1, 1, 0, 0, 16)`,
            );
            await expectError(
                exec(
                    db,
                    `UPDATE timeline_assignments SET end_beat = 17 WHERE id = 1`,
                ),
                /E-A1/,
            );
        });

        it("asn_overlap: one marcher can't overlap itself at the same layer (E-A3)", async ({
            db,
        }) => {
            await seed(db);
            await exec(
                db,
                `INSERT INTO timeline_transitions (id, timeline_id, dest_shape_id, slot_count, start_beat, end_beat)
                    VALUES (2, 1, 1, 2, 8, 32)`,
            );
            await exec(
                db,
                `INSERT INTO timeline_assignments (id, marcher_id, transition_id, slot_index, start_beat, end_beat)
                    VALUES (1, 1, 1, 0, 0, 16)`,
            );
            await expectError(
                exec(
                    db,
                    `INSERT INTO timeline_assignments (marcher_id, transition_id, slot_index, start_beat, end_beat)
                        VALUES (1, 2, 0, 8, 32)`,
                ),
                /E-A3/,
            );
            // A different layer, or a range that only touches, is fine
            await exec(
                db,
                `INSERT INTO timeline_assignments (id, marcher_id, transition_id, slot_index, start_beat, end_beat, layer)
                    VALUES (2, 1, 2, 0, 8, 32, 1)`,
            );
            await exec(
                db,
                `INSERT INTO timeline_assignments (id, marcher_id, transition_id, slot_index, start_beat, end_beat)
                    VALUES (3, 2, 2, 1, 16, 32)`,
            );
            await expectError(
                exec(
                    db,
                    `UPDATE timeline_assignments SET layer = 0 WHERE id = 2`,
                ),
                /E-A3/,
            );
        });

        it("tr_in_timeline and tl_contains: a transition stays inside its timeline (E-T1)", async ({
            db,
        }) => {
            await seed(db);
            await expectError(
                exec(
                    db,
                    `INSERT INTO timeline_transitions (timeline_id, dest_shape_id, slot_count, start_beat, end_beat)
                        VALUES (1, 1, 1, 60, 70)`,
                ),
                /E-T1/,
            );
            await expectError(
                exec(
                    db,
                    `UPDATE timeline_transitions SET end_beat = 65 WHERE id = 1`,
                ),
                /E-T1/,
            );
            await expectError(
                exec(db, `UPDATE timelines SET end_beat = 10 WHERE id = 1`),
                /E-T1/,
            );
        });

        it("tr_range_check and tr_slots_upd: a transition change can't strand an assignment (E-A1, E-A2)", async ({
            db,
        }) => {
            await seed(db);
            await exec(
                db,
                `INSERT INTO timeline_assignments (marcher_id, transition_id, slot_index, start_beat, end_beat)
                    VALUES (1, 1, 1, 0, 16)`,
            );
            await expectError(
                exec(
                    db,
                    `UPDATE timeline_transitions SET end_beat = 8 WHERE id = 1`,
                ),
                /E-A1/,
            );
            await expectError(
                exec(
                    db,
                    `UPDATE timeline_transitions SET slot_count = 1 WHERE id = 1`,
                ),
                /E-A2/,
            );
            // Growing is fine, and the trigger doesn't rewrite the assignment (U-1)
            await exec(
                db,
                `UPDATE timeline_transitions SET end_beat = 24 WHERE id = 1`,
            );
            const rows = await all(
                db,
                `SELECT end_beat FROM timeline_assignments`,
            );
            expect(rows).toEqual([[16]]);
        });

        it("sd_*, tr_shape_set, tr_slots_dest_upd: shapes and destinations are exclusive (E-T6)", async ({
            db,
        }) => {
            await seed(db);
            await expectError(
                exec(
                    db,
                    `INSERT INTO timeline_slot_destinations (transition_id, slot_index, x, y) VALUES (1, 0, 1, 1)`,
                ),
                /E-T6/,
            );

            await exec(
                db,
                `INSERT INTO timeline_transitions (id, timeline_id, slot_count, start_beat, end_beat)
                    VALUES (2, 1, 2, 16, 32)`,
            );
            await expectError(
                exec(
                    db,
                    `INSERT INTO timeline_slot_destinations (transition_id, slot_index, x, y) VALUES (2, 2, 1, 1)`,
                ),
                /E-T6/,
            );
            await exec(
                db,
                `INSERT INTO timeline_slot_destinations (id, transition_id, slot_index, x, y) VALUES (1, 2, 1, 1, 1)`,
            );
            await expectError(
                exec(
                    db,
                    `UPDATE timeline_slot_destinations SET slot_index = 5 WHERE id = 1`,
                ),
                /E-T6/,
            );
            await expectError(
                exec(
                    db,
                    `UPDATE timeline_transitions SET dest_shape_id = 1 WHERE id = 2`,
                ),
                /E-T6/,
            );
            await expectError(
                exec(
                    db,
                    `UPDATE timeline_transitions SET slot_count = 1 WHERE id = 2`,
                ),
                /E-T6/,
            );
        });

        it("tr_dest_* and shape_dest_upd: a block suits the path style and slot_count (E-T3, E-T4)", async ({
            db,
        }) => {
            await seed(db);
            await expectError(
                exec(
                    db,
                    `INSERT INTO timeline_transitions (timeline_id, dest_shape_id, slot_count, start_beat, end_beat)
                        VALUES (1, 2, 3, 16, 32)`,
                ),
                /E-T3\/E-T4/,
            );
            await expectError(
                exec(
                    db,
                    `INSERT INTO timeline_transitions (timeline_id, dest_shape_id, path_style, path_params, slot_count, start_beat, end_beat)
                        VALUES (1, 2, 'follow_the_leader', '{"waypoints":[]}', 1, 16, 32)`,
                ),
                /E-T3\/E-T4/,
            );
            await exec(
                db,
                `INSERT INTO timeline_transitions (id, timeline_id, dest_shape_id, slot_count, start_beat, end_beat)
                    VALUES (2, 1, 2, 2, 16, 32)`,
            );
            await expectError(
                exec(
                    db,
                    `UPDATE timeline_transitions SET slot_count = 3 WHERE id = 2`,
                ),
                /E-T3\/E-T4/,
            );
            await expectError(
                exec(
                    db,
                    `UPDATE timeline_shapes SET geometry = '{"origin":[0,0],"rows":1,"cols":1,"spacing":[1,1]}' WHERE id = 2`,
                ),
                /E-T3\/E-T4/,
            );
        });

        it("no timeline trigger modifies a data table (U-1)", async ({
            db,
        }) => {
            const allTriggers = (await all(
                db,
                `SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'timeline$_%' ESCAPE '$'`,
            )) as [string, string][];
            // The app's undo/redo triggers (`<table>_it/_ut/_dt`, P3.5) write only to the
            // history bookkeeping tables, which U-1 allows. (`timelines_*` doesn't match the
            // `timeline_` prefix, so four tables' worth.)
            const isHistoryTrigger = (name: string) =>
                /_(it|ut|dt)$/.test(name);
            const historyTriggers = allTriggers.filter(([name]) =>
                isHistoryTrigger(name),
            );
            expect(historyTriggers.length).toBe(12);
            for (const [name, triggerSql] of historyTriggers) {
                // Only the body writes; the header names the watched table. Drop string
                // literals too: they hold the logged inverse statements.
                const code = triggerSql
                    .slice(triggerSql.search(/\bBEGIN\b/))
                    .replace(/'(?:[^']|'')*'/g, "''");
                const targets = Array.from(
                    code.matchAll(
                        /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?(\w+)/gi,
                    ),
                    (m) => m[1],
                );
                expect(targets.length, name).toBeGreaterThan(0);
                for (const target of targets)
                    expect(target, `${name} writes ${target}`).toMatch(
                        /^history_/,
                    );
            }

            const triggers = allTriggers.filter(
                ([name]) => !isHistoryTrigger(name),
            );
            expect(triggers.length).toBe(31);
            for (const [name, triggerSql] of triggers) {
                const body = triggerSql
                    .slice(triggerSql.search(/\bBEGIN\b/))
                    .replace(/\s+/g, " ");
                const writesOnlyTheLog =
                    /^BEGIN INSERT INTO timeline_change_log \(tbl, row_id, "before", "after"\) VALUES \(/.test(
                        body,
                    ) && !/\b(UPDATE|DELETE)\b/.test(body);
                const onlyRaises =
                    /^BEGIN SELECT RAISE\(ABORT, '[^']*'\); END;?$/.test(
                        body.trim(),
                    );
                expect(writesOnlyTheLog || onlyRaises, `${name}: ${body}`).toBe(
                    true,
                );
            }
        });
    });

    describe("timeline_commit_violations", () => {
        it("reports a shapeless transition until every slot has a destination", async ({
            db,
        }) => {
            await seed(db);
            // Its own timeline over its range, so only E-T6 is under test (C-11)
            await exec(
                db,
                `INSERT INTO timelines (id, start_beat, end_beat) VALUES (2, 16, 32)`,
            );
            await exec(
                db,
                `INSERT INTO timeline_transitions (id, timeline_id, slot_count, start_beat, end_beat)
                    VALUES (2, 2, 2, 16, 32)`,
            );
            await exec(
                db,
                `INSERT INTO timeline_slot_destinations (transition_id, slot_index, x, y) VALUES (2, 0, 1, 1)`,
            );
            const violations = async () =>
                (await all(
                    db,
                    `SELECT * FROM timeline_commit_violations`,
                )) as unknown[][];
            // The seed's transition 1 doesn't span timeline 1 ([0, 16) of [0, 64))
            expect(await violations()).toEqual([
                ["E-T6", 2, "shapeless transition has 1 of 2 destinations"],
                [
                    "E-T1",
                    1,
                    "transition spans [0, 16) but its timeline spans [0, 64)",
                ],
            ]);
            await exec(
                db,
                `INSERT INTO timeline_slot_destinations (transition_id, slot_index, x, y) VALUES (2, 1, 2, 2)`,
            );
            await exec(db, `UPDATE timelines SET end_beat = 16 WHERE id = 1`);
            expect(await violations()).toEqual([]);
        });
    });

    describe("timeline_change_log", () => {
        type LogRow = [string, number, string | null, string | null];
        const readLog = async (db: DbConnection) =>
            (
                (await all(
                    db,
                    `SELECT tbl, row_id, "before", "after" FROM timeline_change_log ORDER BY seq`,
                )) as LogRow[]
            ).map(([tbl, row_id, before, after]) => ({
                tbl,
                row_id,
                before: before === null ? null : JSON.parse(before),
                after: after === null ? null : JSON.parse(after),
            }));

        it("logs a marcher's id and home only, and ignores edits to its other columns", async ({
            db,
        }) => {
            await seed(db);
            await exec(
                db,
                `INSERT INTO marchers (id, section, drill_prefix, drill_order, home_x, home_y)
                    VALUES (3, 'Brass', 'B', 3, 1.5, -2)`,
            );
            await exec(db, `UPDATE marchers SET home_x = 3 WHERE id = 3`);
            await exec(
                db,
                `UPDATE marchers SET name = 'Alex', section = 'Guard' WHERE id = 3`,
            );
            await exec(db, `DELETE FROM marchers WHERE id = 3`);
            expect(await readLog(db)).toEqual([
                {
                    tbl: "marchers",
                    row_id: 3,
                    before: null,
                    after: { id: 3, home: [1.5, -2] },
                },
                {
                    tbl: "marchers",
                    row_id: 3,
                    before: { id: 3, home: [1.5, -2] },
                    after: { id: 3, home: [3, -2] },
                },
                {
                    tbl: "marchers",
                    row_id: 3,
                    before: { id: 3, home: [3, -2] },
                    after: null,
                },
            ]);
        });

        it("logs shapes, transitions, assignments and destinations with the spec's images, but not timelines", async ({
            db,
        }) => {
            await seed(db);
            await exec(
                db,
                `INSERT INTO timelines (id, start_beat, end_beat) VALUES (2, 0, 8)`,
            );
            await exec(
                db,
                `INSERT INTO timeline_shapes (id, kind, geometry) VALUES (3, 'line', '{"points":[[0,0],[1,0]]}')`,
            );
            await exec(
                db,
                `INSERT INTO timeline_transitions (id, timeline_id, path_style, path_params, slot_count, start_beat, end_beat)
                    VALUES (2, 1, 'arc', '{"bulge":0.25}', 1, 16, 32)`,
            );
            await exec(
                db,
                `INSERT INTO timeline_slot_destinations (transition_id, slot_index, x, y) VALUES (2, 0, 4, 5)`,
            );
            await exec(
                db,
                `INSERT INTO timeline_assignments (id, marcher_id, transition_id, slot_index, start_beat, end_beat)
                    VALUES (7, 2, 2, 0, 16, 32)`,
            );
            await exec(
                db,
                `UPDATE timeline_assignments SET layer = 1 WHERE id = 7`,
            );
            await exec(db, `DELETE FROM timeline_assignments WHERE id = 7`);
            expect(await readLog(db)).toEqual([
                {
                    tbl: "shapes",
                    row_id: 3,
                    before: null,
                    after: {
                        id: 3,
                        kind: "line",
                        geometry: {
                            points: [
                                [0, 0],
                                [1, 0],
                            ],
                        },
                    },
                },
                {
                    tbl: "transitions",
                    row_id: 2,
                    before: null,
                    after: {
                        id: 2,
                        dest: null,
                        style: "arc",
                        params: { bulge: 0.25 },
                        order: "inherit",
                        slots: 1,
                        start: 16,
                        end: 32,
                    },
                },
                {
                    tbl: "slot_destinations",
                    row_id: 2,
                    before: null,
                    after: { transition: 2, slot: 0, x: 4, y: 5 },
                },
                {
                    tbl: "assignments",
                    row_id: 7,
                    before: null,
                    after: {
                        id: 7,
                        marcher: 2,
                        transition: 2,
                        slot: 0,
                        start: 16,
                        end: 32,
                        layer: 0,
                    },
                },
                {
                    tbl: "assignments",
                    row_id: 7,
                    before: {
                        id: 7,
                        marcher: 2,
                        transition: 2,
                        slot: 0,
                        start: 16,
                        end: 32,
                        layer: 0,
                    },
                    after: {
                        id: 7,
                        marcher: 2,
                        transition: 2,
                        slot: 0,
                        start: 16,
                        end: 32,
                        layer: 1,
                    },
                },
                {
                    tbl: "assignments",
                    row_id: 7,
                    before: {
                        id: 7,
                        marcher: 2,
                        transition: 2,
                        slot: 0,
                        start: 16,
                        end: 32,
                        layer: 1,
                    },
                    after: null,
                },
            ]);
        });
    });
});
