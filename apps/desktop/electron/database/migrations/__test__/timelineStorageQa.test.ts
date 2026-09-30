import { describe, expect } from "vitest";
import { sql } from "drizzle-orm";
import { DbConnection, describeDbTests } from "@/test/base";

/**
 * The storage suite QA-DB (docs/timeline/spec.md §12.2, ported from docs/timeline/ref/db_tests.py),
 * run against the real desktop schema with raw SQL (P3.6). Table names carry the `timeline_`
 * prefix (C-4) and homes are `marchers.home_x/home_y` (C-5).
 *
 * Adaptations from the reference suite:
 * - Foreign keys from a timeline to its transitions, and from a transition to its assignments and
 *   destinations, are RESTRICT (C-1), so QA-DB-18 expects a parent delete with children to be
 *   rejected, and a child-first delete to succeed.
 * - Integer columns use `typeof` CHECKs, not STRICT tables (C-3), so QA-DB-27 also documents
 *   what integer affinity does to numeric-looking text.
 * - `slot_destinations` has a surrogate `id` (C-2).
 *
 * Not covered here, because they need the R-E1 range-edit procedure or the write wrapper
 * (Phase 4): QA-DB-11, -12, -13, -24, -25, -26 (and -26b), and -29. QA-DB-30 and -36 exercise the
 * `timeline_commit_violations` view and the change log directly inside a transaction, and then
 * ROLLBACK, in place of the wrapper.
 *
 * `timelineTriggers.test.ts` is the smoke test of each trigger; this file is the numbered suite.
 */

const exec = (db: DbConnection, statement: string) =>
    db.run(sql.raw(statement));

/** Rows as arrays of column values, in SELECT order (the proxy's raw row shape). */
const all = (db: DbConnection, statement: string) =>
    db.all<unknown[]>(sql.raw(statement));

const count = async (db: DbConnection, from: string) =>
    (await all(db, `SELECT count(*) FROM ${from}`))[0][0] as number;

/** The message of an error and of every `cause` beneath it (SQLite errors arrive as causes). */
const errorMessages = (error: unknown) => {
    const messages: string[] = [];
    for (let e: unknown = error; e instanceof Error; e = e.cause)
        messages.push(e.message);
    return messages.join("\n");
};

/** Asserts that a statement fails with a message (or a cause's message) matching `pattern`. */
const expectError = async (statement: Promise<unknown>, pattern: RegExp) => {
    const error = await statement.then(
        () => undefined,
        (e: unknown) => e,
    );
    expect(error, "expected the statement to fail").toBeInstanceOf(Error);
    expect(errorMessages(error)).toMatch(pattern);
};

/** Runs statements in order and returns the first error's messages, or null if all succeed. */
const firstError = async (db: DbConnection, statements: string[]) => {
    for (const statement of statements) {
        try {
            await exec(db, statement);
        } catch (e) {
            return errorMessages(e);
        }
    }
    return null;
};

/**
 * One edit as one transaction, checked at commit the way the write wrapper will (spec §6): a
 * statement error or a `timeline_commit_violations` row rolls everything back. Returns the
 * rejection message, or null after COMMIT. (The real wrapper is Phase 4.)
 */
const attempt = async (db: DbConnection, statements: string[]) => {
    await exec(db, "BEGIN");
    const error = await firstError(db, statements);
    if (error !== null) {
        await exec(db, "ROLLBACK");
        return error;
    }
    const violations = await all(
        db,
        `SELECT code, transition_id, detail FROM timeline_commit_violations`,
    );
    if (violations.length > 0) {
        await exec(db, "ROLLBACK");
        return `${violations[0][0]}: ${violations[0][2]}`;
    }
    await exec(db, "COMMIT");
    return null;
};

const INSERT_ASSIGNMENT = (
    marcher: number,
    transition: number,
    slot: number | string,
    start: number | string,
    end: number | string,
    layer?: number | string,
) =>
    layer === undefined
        ? `INSERT INTO timeline_assignments (marcher_id, transition_id, slot_index, start_beat, end_beat)
            VALUES (${marcher}, ${transition}, ${slot}, ${start}, ${end})`
        : `INSERT INTO timeline_assignments (marcher_id, transition_id, slot_index, start_beat, end_beat, layer)
            VALUES (${marcher}, ${transition}, ${slot}, ${start}, ${end}, ${layer})`;

const INSERT_TRANSITION = (
    id: number,
    shape: number | null,
    slots: number,
    start: number,
    end: number,
    style = "direct",
) =>
    `INSERT INTO timeline_transitions (id, timeline_id, dest_shape_id, path_style, slot_count, start_beat, end_beat)
        VALUES (${id}, 1, ${shape ?? "NULL"}, '${style}', ${slots}, ${start}, ${end})`;

/** The reference suite's `fresh()` database: marchers M1 and M2, a line and a 2x2 block, one timeline over [0, 32), a 2-slot transition [0, 16) on the line and marcher 1 in slot 0. */
const seed = async (db: DbConnection) => {
    await exec(
        db,
        `INSERT INTO marchers (id, name, section, drill_prefix, drill_order, home_x, home_y) VALUES
            (1, 'M1', 'Brass', 'B', 1, 0, 0), (2, 'M2', 'Brass', 'B', 2, 2, 0)`,
    );
    await exec(
        db,
        `INSERT INTO timeline_shapes (id, name, kind, geometry) VALUES
            (1, 'pt', 'line', '{"points":[[16,0],[17,0]]}'),
            (2, 'blk', 'block', '{"origin":[0,0],"rows":2,"cols":2,"spacing":[2,2]}')`,
    );
    await exec(
        db,
        `INSERT INTO timelines (id, name, start_beat, end_beat) VALUES (1, 'tl', 0, 32)`,
    );
    await exec(db, INSERT_TRANSITION(1, 1, 2, 0, 16));
    await exec(db, INSERT_ASSIGNMENT(1, 1, 0, 0, 16));
    await exec(db, `DELETE FROM timeline_change_log`);
};

const SHAPELESS = `INSERT INTO timeline_transitions (id, timeline_id, dest_shape_id, path_style, path_params, slot_count, start_beat, end_beat)
    VALUES (5, 1, NULL, 'direct', NULL, 2, 0, 8)`;
const POINTS = [
    `INSERT INTO timeline_slot_destinations (transition_id, slot_index, x, y) VALUES (5, 0, 3.5, -2)`,
    `INSERT INTO timeline_slot_destinations (transition_id, slot_index, x, y) VALUES (5, 1, 7, 4)`,
];

// The bounds triggers raise one shared "E-A1/E-A2: …" message, so these two patterns match the
// same error; each test's setup decides which half of the invariant it exercises.
const E_A1 = /E-A1/;
const E_A2 = /E-A2/;
const E_A3 = /E-A3/;
const E_T1 = /E-T1/;
const E_T3_T4 = /E-T3\/E-T4/;
const E_T6 = /E-T6/;
const CHECK = /CHECK constraint failed/;
const CHECK_OR_NOT_NULL = /CHECK constraint failed|NOT NULL constraint failed/;

describeDbTests("QA-DB storage suite", (it) => {
    describe("assignments and ranges", () => {
        it("QA-DB-01: an assignment past its transition's end is rejected (E-A1)", async ({
            db,
        }) => {
            await seed(db);
            await expectError(
                exec(db, INSERT_ASSIGNMENT(2, 1, 1, 0, 20)),
                E_A1,
            );
        });

        it("QA-DB-02: slot_index >= slot_count is rejected (E-A2)", async ({
            db,
        }) => {
            await seed(db);
            await expectError(
                exec(db, INSERT_ASSIGNMENT(2, 1, 2, 0, 16)),
                E_A2,
            );
        });

        it("QA-DB-03: two assignments in the same slot are rejected (UNIQUE)", async ({
            db,
        }) => {
            await seed(db);
            await expectError(
                exec(db, INSERT_ASSIGNMENT(2, 1, 0, 0, 16)),
                /UNIQUE constraint failed/,
            );
        });

        it("QA-DB-04: the same marcher twice in one transition is rejected (E-A3 or UNIQUE)", async ({
            db,
        }) => {
            await seed(db);
            await expectError(
                exec(db, INSERT_ASSIGNMENT(1, 1, 1, 0, 8)),
                /E-A3|UNIQUE constraint failed/,
            );
        });

        it("QA-DB-05: the same marcher overlapping itself at the same layer across transitions is rejected (E-A3)", async ({
            db,
        }) => {
            await seed(db);
            await exec(db, INSERT_TRANSITION(2, 1, 1, 8, 24));
            await expectError(
                exec(db, INSERT_ASSIGNMENT(1, 2, 0, 8, 24, 0)),
                E_A3,
            );
        });

        it("QA-DB-06: overlapping at a higher layer (a steal) is accepted", async ({
            db,
        }) => {
            await seed(db);
            await exec(db, INSERT_TRANSITION(2, 1, 1, 8, 16));
            await exec(db, INSERT_ASSIGNMENT(1, 2, 0, 8, 16, 1));
            expect(await count(db, "timeline_assignments")).toBe(2);
        });

        it("QA-DB-07: ranges that touch end to start at the same layer are accepted (half-open)", async ({
            db,
        }) => {
            await seed(db);
            await exec(db, INSERT_TRANSITION(2, 1, 1, 16, 24));
            await exec(db, INSERT_ASSIGNMENT(1, 2, 0, 16, 24, 0));
            expect(await count(db, "timeline_assignments")).toBe(2);
        });

        it("QA-DB-08: a transition outside its timeline is rejected (E-T1)", async ({
            db,
        }) => {
            await seed(db);
            await expectError(
                exec(db, INSERT_TRANSITION(3, 1, 1, 30, 40)),
                E_T1,
            );
        });

        it("QA-DB-09: shrinking a timeline below one of its transitions is rejected (E-T1)", async ({
            db,
        }) => {
            await seed(db);
            await expectError(
                exec(db, `UPDATE timelines SET end_beat = 10 WHERE id = 1`),
                E_T1,
            );
        });

        it("QA-DB-10: shrinking slot_count below an occupied slot is rejected (E-A2)", async ({
            db,
        }) => {
            await seed(db);
            await exec(db, INSERT_ASSIGNMENT(2, 1, 1, 0, 16));
            await expectError(
                exec(
                    db,
                    `UPDATE timeline_transitions SET slot_count = 1 WHERE id = 1`,
                ),
                E_A2,
            );
        });

        it("QA-DB-13b: a plain range UPDATE that strands an assignment is rejected (E-A1, tr_range_check)", async ({
            db,
        }) => {
            await seed(db);
            await expectError(
                exec(
                    db,
                    `UPDATE timeline_transitions SET end_beat = 10 WHERE id = 1`,
                ),
                E_A1,
            );
        });

        it("QA-DB-22: a zero-length assignment is rejected (CHECK)", async ({
            db,
        }) => {
            await seed(db);
            await expectError(
                exec(db, INSERT_ASSIGNMENT(2, 1, 1, 8, 8)),
                CHECK,
            );
        });

        it("QA-DB-23: updating an assignment into an overlap at the same layer is rejected (E-A3)", async ({
            db,
        }) => {
            await seed(db);
            // The reference suite's transition 2 is [16, 32), where moving the start to 12 would fail
            // the bounds check first (E-A1). Widening it to [8, 32) makes E-A3 the failure under test.
            await exec(db, INSERT_TRANSITION(2, 1, 1, 8, 32));
            await exec(db, INSERT_ASSIGNMENT(1, 2, 0, 16, 32, 0));
            await expectError(
                exec(
                    db,
                    `UPDATE timeline_assignments SET start_beat = 12 WHERE transition_id = 2`,
                ),
                E_A3,
            );
        });
    });

    describe("destinations, shapes and path styles", () => {
        it("QA-DB-14: a follow-the-leader transition into a block is rejected (E-T3)", async ({
            db,
        }) => {
            await seed(db);
            await expectError(
                exec(db, INSERT_TRANSITION(3, 2, 4, 0, 8, "follow_the_leader")),
                E_T3_T4,
            );
        });

        it("QA-DB-15: a block destination with too many slots is rejected (E-T4)", async ({
            db,
        }) => {
            await seed(db);
            await expectError(
                exec(db, INSERT_TRANSITION(3, 2, 5, 0, 8)),
                E_T3_T4,
            );
        });

        it("QA-DB-16: a block destination exactly at capacity is accepted", async ({
            db,
        }) => {
            await seed(db);
            await exec(db, INSERT_TRANSITION(3, 2, 4, 0, 8));
            expect(await count(db, "timeline_transitions")).toBe(2);
        });

        it("QA-DB-17: deleting a shape that a transition uses is rejected (FK)", async ({
            db,
        }) => {
            await seed(db);
            await expectError(
                exec(db, `DELETE FROM timeline_shapes WHERE id = 1`),
                /FOREIGN KEY constraint failed/,
            );
        });

        it("QA-DB-18: deleting a transition with assignments is rejected (RESTRICT, C-1); deleting the children first succeeds", async ({
            db,
        }) => {
            await seed(db);
            await expectError(
                exec(db, `DELETE FROM timeline_transitions WHERE id = 1`),
                /FOREIGN KEY constraint failed/,
            );
            expect(await count(db, "timeline_assignments")).toBe(1);
            await exec(
                db,
                `DELETE FROM timeline_assignments WHERE transition_id = 1`,
            );
            await exec(db, `DELETE FROM timeline_transitions WHERE id = 1`);
            expect(await count(db, "timeline_transitions")).toBe(0);
            expect(await count(db, "timeline_assignments")).toBe(0);
        });

        it("QA-DB-19: an unknown path_style is rejected (CHECK)", async ({
            db,
        }) => {
            await seed(db);
            await expectError(
                exec(
                    db,
                    `UPDATE timeline_transitions SET path_style = 'spiral' WHERE id = 1`,
                ),
                CHECK,
            );
        });

        it("QA-DB-20: geometry that is not valid JSON is rejected (CHECK)", async ({
            db,
        }) => {
            await seed(db);
            await expectError(
                exec(
                    db,
                    `INSERT INTO timeline_shapes (id, kind, geometry) VALUES (9, 'line', 'not json')`,
                ),
                CHECK,
            );
        });

        it("QA-DB-21: reshaping a block too small for a transition using it is rejected (E-T4)", async ({
            db,
        }) => {
            await seed(db);
            await exec(db, INSERT_TRANSITION(3, 2, 4, 0, 8));
            await expectError(
                exec(
                    db,
                    `UPDATE timeline_shapes SET geometry = '{"origin":[0,0],"rows":1,"cols":2,"spacing":[2,2]}' WHERE id = 2`,
                ),
                E_T3_T4,
            );
        });
    });

    describe("numeric columns", () => {
        it("QA-DB-27: fractional slot_index, start_beat, end_beat, layer and text in an integer column are rejected (typeof CHECK, I-N1)", async ({
            db,
        }) => {
            await seed(db);
            await expectError(
                exec(db, INSERT_ASSIGNMENT(2, 1, 0.5, 0, 16)),
                CHECK,
            );
            await expectError(
                exec(db, INSERT_ASSIGNMENT(2, 1, 1, 0.5, 16)),
                CHECK,
            );
            await expectError(
                exec(db, INSERT_ASSIGNMENT(2, 1, 1, 0, 15.5)),
                CHECK,
            );
            await expectError(
                exec(db, INSERT_ASSIGNMENT(2, 1, 1, 0, 16, 0.5)),
                CHECK,
            );
            await expectError(
                exec(
                    db,
                    `UPDATE timeline_transitions SET slot_count = 'many' WHERE id = 1`,
                ),
                // Text also fails the BETWEEN range check, so name the typeof CHECK to pin I-N1
                /CHECK constraint failed: timeline_transitions_slot_count_type_check/,
            );
            // Text that looks like a fractional number is converted to REAL by the column's integer
            // affinity, so the typeof CHECK rejects it too
            await expectError(
                exec(db, INSERT_ASSIGNMENT(2, 1, 1, "'0.5'", 16)),
                CHECK,
            );
            expect(await count(db, "timeline_assignments")).toBe(1);
        });

        it("QA-DB-27: text that looks like an integer is coerced to an integer by the column's affinity and accepted (the known difference from STRICT)", async ({
            db,
        }) => {
            await seed(db);
            // With STRICT tables '5' would be rejected. A typeof CHECK runs after affinity
            // conversion, so the stored value is the integer 5: the data is still valid.
            await exec(
                db,
                `UPDATE timeline_transitions SET slot_count = '5' WHERE id = 1`,
            );
            expect(
                await all(
                    db,
                    `SELECT typeof(slot_count), slot_count FROM timeline_transitions WHERE id = 1`,
                ),
            ).toEqual([["integer", 5]]);
        });

        it("QA-DB-28: negative beats, beats above 2^31-1, out-of-range layers and non-finite homes are rejected (I-N2)", async ({
            db,
        }) => {
            await seed(db);
            await expectError(
                exec(
                    db,
                    `INSERT INTO timelines (id, name, start_beat, end_beat) VALUES (2, 'x', -4, 8)`,
                ),
                CHECK,
            );
            await expectError(
                exec(
                    db,
                    `INSERT INTO timelines (id, name, start_beat, end_beat) VALUES (2, 'x', 0, 3000000000)`,
                ),
                CHECK,
            );
            await expectError(
                exec(db, INSERT_ASSIGNMENT(2, 1, 1, 0, 16, 5000)),
                CHECK,
            );
            await expectError(
                exec(db, `UPDATE marchers SET home_x = 1e999 WHERE id = 1`),
                CHECK,
            );
            // NaN has no SQLite representation: 0.0/0.0 evaluates to NULL
            await expectError(
                exec(db, `UPDATE marchers SET home_x = 0.0/0.0 WHERE id = 1`),
                CHECK_OR_NOT_NULL,
            );
            expect(
                await all(db, `SELECT home_x FROM marchers WHERE id = 1`),
            ).toEqual([[0]]);
        });
    });

    describe("commit-time checks and the change log", () => {
        it("QA-DB-30: a rolled-back edit leaves no change-log rows", async ({
            db,
        }) => {
            await seed(db);
            await exec(db, "BEGIN");
            await exec(db, `UPDATE marchers SET home_x = 9 WHERE id = 1`);
            // The earlier statement is logged while the transaction is open...
            expect(await count(db, "timeline_change_log")).toBe(1);
            // ...and a failing statement aborts only itself
            await expectError(
                exec(db, INSERT_ASSIGNMENT(2, 1, 9, 0, 16)),
                E_A2,
            );
            expect(await count(db, "timeline_change_log")).toBe(1);
            await exec(db, "ROLLBACK");
            expect(await count(db, "timeline_change_log")).toBe(0);
            expect(
                await all(db, `SELECT home_x FROM marchers WHERE id = 1`),
            ).toEqual([[0]]);
        });

        it("QA-DB-31: json_valid rejects Infinity but accepts 1e999, so geometry finiteness is an app-level check (I-S1)", async ({
            db,
        }) => {
            expect(
                await all(
                    db,
                    `SELECT json_valid('{"points":[[Infinity,0],[1,0]]}'), json_valid('{"points":[[1e999,0],[1,0]]}')`,
                ),
            ).toEqual([[0, 1]]);
        });

        it("QA-DB-32: a circle radius must be numeric, > 0 and <= 1e6", async ({
            db,
        }) => {
            await seed(db);
            const circle = (radius: string | null) =>
                `INSERT INTO timeline_shapes (id, kind, geometry) VALUES (9, 'circle',
                    '{"center":[0,0],${radius === null ? "" : `"radius":${radius},`}"start_angle":0,"clockwise":false}')`;
            for (const [radius, accepted] of [
                ["10000", true],
                ["0", false],
                ["2e6", false],
                ['"5"', false],
                [null, false],
            ] as const) {
                const error = await firstError(db, [circle(radius)]);
                expect(error === null, `radius ${radius}`).toBe(accepted);
                if (!accepted) expect(error).toMatch(CHECK);
                await exec(db, `DELETE FROM timeline_shapes WHERE id = 9`);
            }
        });

        it("QA-DB-33: an arc bulge must be numeric with |bulge| <= 0.5; a direct transition needs no params", async ({
            db,
        }) => {
            await seed(db);
            for (const [style, params, accepted] of [
                ["arc", `'{"bulge":0.5}'`, true],
                ["arc", `'{"bulge":-0.5}'`, true],
                ["arc", `'{"bulge":0.6}'`, false],
                ["arc", `'{"bulge":2}'`, false],
                ["arc", `'{"bulge":1e999}'`, false],
                ["arc", `'{"bulge":"0.5"}'`, false],
                ["arc", "NULL", false],
                ["direct", "NULL", true],
            ] as const) {
                const error = await firstError(db, [
                    `UPDATE timeline_transitions SET path_style = '${style}', path_params = ${params} WHERE id = 1`,
                ]);
                expect(error === null, `${style} ${params}`).toBe(accepted);
                if (!accepted) expect(error).toMatch(CHECK);
            }
        });

        it("QA-DB-34: a circle start_angle must be numeric in [0, 2pi)", async ({
            db,
        }) => {
            await seed(db);
            for (const [angle, accepted] of [
                ["0", true],
                ["6.28", true],
                ["6.3", false],
                ["-0.1", false],
                ["1e20", false],
                ['"1"', false],
                [null, false],
            ] as const) {
                const geometry = `{"center":[0,0],"radius":1,${angle === null ? "" : `"start_angle":${angle},`}"clockwise":false}`;
                const error = await firstError(db, [
                    `INSERT INTO timeline_shapes (id, kind, geometry) VALUES (9, 'circle', '${geometry}')`,
                ]);
                expect(error === null, `start_angle ${angle}`).toBe(accepted);
                if (!accepted) expect(error).toMatch(CHECK);
                await exec(db, `DELETE FROM timeline_shapes WHERE id = 9`);
            }
        });

        it("QA-DB-35: a shapeless direct transition with a point for each slot is accepted in one edit", async ({
            db,
        }) => {
            await seed(db);
            expect(await attempt(db, [SHAPELESS, ...POINTS])).toBeNull();
            expect(await count(db, "timeline_slot_destinations")).toBe(2);
        });

        it("QA-DB-36: a shapeless transition with an unplaced slot is reported at commit (E-T6) and the whole edit rolls back", async ({
            db,
        }) => {
            await seed(db);
            // Directly, inside one transaction: the view reports the gap, and ROLLBACK leaves no trace
            await exec(db, "BEGIN");
            await exec(db, `UPDATE marchers SET name = 'X' WHERE id = 1`);
            await exec(db, SHAPELESS);
            await exec(db, POINTS[0]);
            expect(
                await all(db, `SELECT * FROM timeline_commit_violations`),
            ).toEqual([
                ["E-T6", 5, "shapeless transition has 1 of 2 destinations"],
            ]);
            await exec(db, "ROLLBACK");
            expect(
                await all(db, `SELECT name FROM marchers WHERE id = 1`),
            ).toEqual([["M1"]]);
            expect(await count(db, "timeline_transitions WHERE id = 5")).toBe(
                0,
            );
            expect(await count(db, "timeline_slot_destinations")).toBe(0);
            expect(await count(db, "timeline_change_log")).toBe(0);

            // Through the commit check
            const error = await attempt(db, [
                `UPDATE marchers SET name = 'X' WHERE id = 1`,
                SHAPELESS,
                POINTS[0],
            ]);
            expect(error).toMatch(E_T6);
            expect(
                await all(db, `SELECT name FROM marchers WHERE id = 1`),
            ).toEqual([["M1"]]);
            expect(await count(db, "timeline_transitions WHERE id = 5")).toBe(
                0,
            );
        });

        it("QA-DB-37: follow-the-leader without a shape is rejected (I-T5)", async ({
            db,
        }) => {
            await seed(db);
            const error = await attempt(db, [
                `INSERT INTO timeline_transitions (id, timeline_id, dest_shape_id, path_style, path_params, slot_count, start_beat, end_beat)
                    VALUES (6, 1, NULL, 'follow_the_leader', '{"waypoints":[]}', 1, 0, 8)`,
            ]);
            expect(error).toMatch(CHECK);
        });

        it("QA-DB-38: a shape and individual destinations are exclusive, and converting either way works in one edit", async ({
            db,
        }) => {
            await seed(db);
            // A point on a shaped transition
            expect(
                await attempt(db, [
                    `INSERT INTO timeline_slot_destinations (transition_id, slot_index, x, y) VALUES (1, 0, 1, 1)`,
                ]),
            ).toMatch(E_T6);
            // Setting a shape while points exist
            expect(
                await attempt(db, [
                    SHAPELESS,
                    ...POINTS,
                    `UPDATE timeline_transitions SET dest_shape_id = 1 WHERE id = 5`,
                ]),
            ).toMatch(E_T6);
            expect(await count(db, "timeline_transitions WHERE id = 5")).toBe(
                0,
            );
            // Individual -> shape
            expect(
                await attempt(db, [
                    SHAPELESS,
                    ...POINTS,
                    `DELETE FROM timeline_slot_destinations WHERE transition_id = 5`,
                    `UPDATE timeline_transitions SET dest_shape_id = 1 WHERE id = 5`,
                ]),
            ).toBeNull();
            // Shape -> individual
            expect(
                await attempt(db, [
                    `UPDATE timeline_transitions SET dest_shape_id = NULL WHERE id = 1`,
                    `INSERT INTO timeline_slot_destinations (transition_id, slot_index, x, y) VALUES (1, 0, 0, 0)`,
                    `INSERT INTO timeline_slot_destinations (transition_id, slot_index, x, y) VALUES (1, 1, 2, 0)`,
                ]),
            ).toBeNull();
            expect(
                await count(
                    db,
                    "timeline_slot_destinations WHERE transition_id = 1",
                ),
            ).toBe(2);
        });

        it("QA-DB-39: destination rows stay consistent with slot_count", async ({
            db,
        }) => {
            await seed(db);
            expect(
                await attempt(db, [
                    SHAPELESS,
                    ...POINTS,
                    `INSERT INTO timeline_slot_destinations (transition_id, slot_index, x, y) VALUES (5, 2, 0, 0)`,
                ]),
                // The commit-time view would also report E-T6 here, so match the row trigger's message
            ).toMatch(/E-T6: .*outside slot_count/);
            expect(
                await attempt(db, [
                    SHAPELESS,
                    ...POINTS,
                    `UPDATE timeline_transitions SET slot_count = 1 WHERE id = 5`,
                ]),
            ).toMatch(/E-T6: slot_count below a placed destination/);
            expect(
                await attempt(db, [
                    SHAPELESS,
                    ...POINTS,
                    `UPDATE timeline_transitions SET slot_count = 3 WHERE id = 5`,
                ]),
            ).toMatch(E_T6);
            expect(
                await attempt(db, [
                    SHAPELESS,
                    ...POINTS,
                    `UPDATE timeline_transitions SET slot_count = 3 WHERE id = 5`,
                    `INSERT INTO timeline_slot_destinations (transition_id, slot_index, x, y) VALUES (5, 2, 1, 1)`,
                ]),
            ).toBeNull();
            expect(await count(db, "timeline_slot_destinations")).toBe(3);
        });

        it("QA-DB-40: a point with an out-of-range, infinite, NaN or text coordinate is rejected (I-D2)", async ({
            db,
        }) => {
            await seed(db);
            for (const x of ["2e6", "1e999", "0.0/0.0", "'abc'"]) {
                const error = await attempt(db, [
                    SHAPELESS,
                    `INSERT INTO timeline_slot_destinations (transition_id, slot_index, x, y) VALUES (5, 0, ${x}, 0)`,
                    POINTS[1],
                ]);
                expect(error, `x = ${x}`).toMatch(CHECK_OR_NOT_NULL);
            }
            expect(await count(db, "timeline_slot_destinations")).toBe(0);
        });

        it("QA-DB-41: the change log records destination edits under the transition's id, including the explicit child-first deletes", async ({
            db,
        }) => {
            await seed(db);
            const drain = async () => {
                const rows = (await all(
                    db,
                    `SELECT tbl, row_id, "before", "after" FROM timeline_change_log ORDER BY seq`,
                )) as [string, number, string | null, string | null][];
                await exec(db, `DELETE FROM timeline_change_log`);
                return rows.filter(([tbl]) => tbl === "slot_destinations");
            };
            expect(await attempt(db, [SHAPELESS, ...POINTS])).toBeNull();
            const inserted = await drain();
            expect(
                inserted.map(([, id, b, a]) => [id, b, JSON.parse(a!)]),
            ).toEqual([
                [5, null, { transition: 5, slot: 0, x: 3.5, y: -2 }],
                [5, null, { transition: 5, slot: 1, x: 7, y: 4 }],
            ]);

            expect(
                await attempt(db, [
                    `UPDATE timeline_slot_destinations SET x = 0 WHERE transition_id = 5 AND slot_index = 1`,
                ]),
            ).toBeNull();
            const updated = await drain();
            expect(updated).toHaveLength(1);
            expect(JSON.parse(updated[0][2]!)).toEqual({
                transition: 5,
                slot: 1,
                x: 7,
                y: 4,
            });
            expect(JSON.parse(updated[0][3]!)).toEqual({
                transition: 5,
                slot: 1,
                x: 0,
                y: 4,
            });

            // RESTRICT (C-1): the parent delete fails until the points are gone, so the deletes
            // the reference suite saw as cascades are explicit here
            await expectError(
                exec(db, `DELETE FROM timeline_transitions WHERE id = 5`),
                /FOREIGN KEY constraint failed/,
            );
            expect(
                await attempt(db, [
                    `DELETE FROM timeline_slot_destinations WHERE transition_id = 5`,
                    `DELETE FROM timeline_transitions WHERE id = 5`,
                ]),
            ).toBeNull();
            const deleted = await drain();
            expect(
                deleted.map(([, id, b, a]) => [id, JSON.parse(b!), a]),
            ).toEqual([
                [5, { transition: 5, slot: 0, x: 3.5, y: -2 }, null],
                [5, { transition: 5, slot: 1, x: 0, y: 4 }, null],
            ]);
        });
    });
});
