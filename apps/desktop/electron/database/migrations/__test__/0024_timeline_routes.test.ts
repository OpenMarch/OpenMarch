// @vitest-environment node
/**
 * Migration 0024 adds routes, pathways step 1 (ADR 0014, spec v0.9 §5.1): the `timeline_routes`
 * table, and `timeline_transitions` rebuilt with `route_id`, the `route` path style and the I-R2
 * CHECK. QA-MIG-R1: a v0.1.7 release file and a current fork file both open unchanged, and the
 * rebuild keeps every row and rowid, every trigger and every history trigger, so stored undo steps
 * still replay. QA-DB-R1 to QA-DB-R3: the CHECK, the foreign key and the commit checks.
 *
 * It comes after `0018_drop_page_era`, so a timeline file takes it on open. A page-era file also
 * takes its statements before the converter writes timeline rows (`CONVERTER_SCHEMA_MIGRATION_TAGS`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createResolver } from "@openmarch/core";
import { getOrm } from "../../db";
import { DrizzleMigrationService } from "../../services/DrizzleMigrationService";
import { applyFileVersionDecision } from "../../fileVersion";
import { runConvertOnOpen, type ConvertOnOpenUi } from "../../convertOnOpen";
import {
    createNewTimelineShow,
    createPageShow,
    migrationsFolder,
    withDb,
} from "../../__test__/convertOnOpenFixtures";
import {
    migrationAt,
    rollBackMigrationsFrom,
    rollBackRoutesSchema,
} from "../../__test__/migrationRollback";

const ROUTES_MIGRATION = migrationAt(19);
const V017_SMALL = path.resolve(
    __dirname,
    "../../__test__/v017-files/small.dots",
);

const withDbAsync = async <T>(
    filePath: string,
    fn: (db: DatabaseSync) => Promise<T>,
): Promise<T> => {
    const db = new DatabaseSync(filePath);
    try {
        return await fn(db);
    } finally {
        db.close();
    }
};

type Row = Record<string, string | number | null>;

const ui: ConvertOnOpenUi = { whilePreparing: async (work) => work(() => {}) };

/** Opens a file as `openShow` does: convert on open (agreed), the migrations, the undo triggers. */
const open = async (filePath: string) => {
    const db = new DatabaseSync(filePath);
    try {
        const outcome = await runConvertOnOpen(filePath, db, ui, {
            confirmed: true,
            migrationsFolder,
            hooks: { now: () => new Date("2026-11-03T12:00:00.000Z") },
        });
        applyFileVersionDecision(db, false);
        await new DrizzleMigrationService(
            getOrm(db),
            db,
        ).applyPendingMigrations(migrationsFolder);
        const { createAllUndoTriggers } =
            await import("@/db-functions/history");
        await createAllUndoTriggers(getOrm(db) as never);
        return outcome;
    } finally {
        db.close();
    }
};

const triggerNames = (db: DatabaseSync) =>
    (
        db
            .prepare(
                "SELECT name FROM sqlite_schema WHERE type = 'trigger' ORDER BY name",
            )
            .all() as { name: string }[]
    ).map((r) => r.name);

const columns = (db: DatabaseSync, table: string) =>
    (
        db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all() as {
            name: string;
        }[]
    ).map((c) => c.name);

const history = (db: DatabaseSync) => ({
    undo: db
        .prepare(
            "SELECT sequence, history_group, sql FROM history_undo ORDER BY sequence",
        )
        .all() as Row[],
    redo: db
        .prepare(
            "SELECT sequence, history_group, sql FROM history_redo ORDER BY sequence",
        )
        .all() as Row[],
});

const positions = async (db: DatabaseSync) => {
    const { readTimelineTables } = await import("@/timeline/timelineRows");
    const { snapshot } = await readTimelineTables(getOrm(db) as never);
    const resolver = createResolver(snapshot);
    const last = Number(
        (
            db.prepare("SELECT max(end_beat) AS n FROM timelines").get() as {
                n: number;
            }
        ).n,
    );
    const out: string[] = [];
    for (const id of resolver.marcherIds())
        for (let beat = 0; beat <= last; beat++)
            out.push(
                `${id}@${beat}:${resolver.positionAt(id, beat).join(",")}`,
            );
    return out;
};

const transitionRows = (db: DatabaseSync) =>
    db
        .prepare(
            `SELECT rowid AS rid, id, timeline_id, dest_shape_id, path_style, path_params, order_mode,
                    slot_count, start_beat, end_beat FROM timeline_transitions ORDER BY rowid`,
        )
        .all();

describe(`Migration ${ROUTES_MIGRATION.tag} (QA-MIG-R1)`, () => {
    let tempDir: string;
    let showPath: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "om-0024-"));
        showPath = path.join(tempDir, "show.dots");
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
        vi.spyOn(console, "info").mockImplementation(() => {});
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("opens a v0.1.7 release file: it converts, gets routes, and has no route or broken key", async () => {
        fs.copyFileSync(V017_SMALL, showPath);
        expect(await open(showPath)).toMatchObject({ kind: "conversion" });
        withDb(showPath, (db) => {
            expect(columns(db, "timeline_transitions")).toContain("route_id");
            expect(columns(db, "timeline_routes")).toEqual(["id", "geometry"]);
            expect(
                db
                    .prepare(
                        "SELECT count(*) AS n FROM timeline_transitions WHERE route_id IS NOT NULL",
                    )
                    .get(),
            ).toEqual({ n: 0 });
            expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
            expect(
                db.prepare("SELECT * FROM timeline_route_violations").all(),
            ).toEqual([]);
            expect(
                db.prepare("SELECT * FROM timeline_commit_violations").all(),
            ).toEqual([]);
            // the conversion records 0024 once, like every other migration
            expect(
                db
                    .prepare(
                        "SELECT count(*) AS n FROM __drizzle_migrations WHERE created_at = ?",
                    )
                    .get(ROUTES_MIGRATION.when),
            ).toEqual({ n: 1 });
        });
        // Positions against v0.1.7's own playback: v017Files.test.ts
    });

    it("opens a current fork file: rows and row ids, triggers, history triggers and stored undo steps survive the rebuild", async () => {
        await createPageShow(showPath);
        await open(showPath);
        // This build reads only its own schema, so the positions are taken before the rollback
        const positionsBefore = await withDbAsync(showPath, positions);
        rollBackMigrationsFrom(showPath, ROUTES_MIGRATION.idx);
        // The real schema from before 0024, with the history triggers an older build created for it
        withDb(showPath, (db) => {
            db.exec("PRAGMA foreign_keys = OFF");
            rollBackRoutesSchema(db);
            db.exec("PRAGMA foreign_keys = ON");
        });
        await withDbAsync(showPath, async (db) => {
            const { createAllUndoTriggers } =
                await import("@/db-functions/history");
            await createAllUndoTriggers(getOrm(db) as never);
        });

        const before = await withDbAsync(showPath, async (db) => {
            expect(columns(db, "timeline_transitions")).not.toContain(
                "route_id",
            );
            // An undoable edit, logged by the old history trigger (old column list)
            db.exec("UPDATE history_stats SET cur_undo_group = 7");
            db.exec(
                "UPDATE timeline_transitions SET order_mode = 'slot' WHERE id = (SELECT min(id) FROM timeline_transitions)",
            );
            return {
                triggers: triggerNames(db),
                rows: transitionRows(db),
                history: history(db),
            };
        });
        expect(before.history.undo.at(-1)?.sql).toMatch(
            /^UPDATE "timeline_transitions" SET .* WHERE rowid=\d+$/,
        );

        expect(await open(showPath)).toMatchObject({ kind: "none" });

        await withDbAsync(showPath, async (db) => {
            expect(columns(db, "timeline_transitions")).toContain("route_id");
            // every row and rowid, with no route
            expect(transitionRows(db)).toEqual(before.rows);
            expect(
                db
                    .prepare(
                        "SELECT count(*) AS n FROM timeline_transitions WHERE route_id IS NOT NULL",
                    )
                    .get(),
            ).toEqual({ n: 0 });
            // every trigger is back, plus the routes' own
            const after = triggerNames(db);
            for (const name of before.triggers) expect(after).toContain(name);
            for (const name of [
                "timeline_transitions_it",
                "timeline_transitions_ut",
                "timeline_transitions_dt",
                "timeline_routes_it",
                "timeline_routes_ut",
                "timeline_routes_dt",
                "timeline_log_routes_ins",
                "timeline_log_routes_upd",
                "timeline_log_routes_del",
                "timeline_tr_range_check",
            ])
                expect(after).toContain(name);
            const ut = db
                .prepare(
                    "SELECT sql FROM sqlite_schema WHERE name = 'timeline_transitions_ut'",
                )
                .get() as { sql: string };
            expect(ut.sql).toContain('"route_id"');
            // the history is kept, and its stored step still replays
            expect(history(db)).toEqual(before.history);
            db.exec(String(before.history.undo.at(-1)!.sql));
            expect(await positions(db)).toEqual(positionsBefore);
            expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
            expect(db.prepare("PRAGMA integrity_check").get()).toEqual({
                integrity_check: "ok",
            });

            // A route and its delete reach the change log and the history (ADR 0014 Verification)
            db.exec("DELETE FROM timeline_change_log");
            db.exec("UPDATE history_stats SET cur_undo_group = 8");
            db.exec(
                `INSERT INTO timeline_routes (id, geometry) VALUES (41, '{"v":1,"from":[0,0],"to":[1,1],"points":[]}')`,
            );
            db.exec("DELETE FROM timeline_routes WHERE id = 41");
            const logged = db
                .prepare(
                    "SELECT tbl, row_id FROM timeline_change_log ORDER BY seq",
                )
                .all();
            expect(logged).toEqual([
                { tbl: "routes", row_id: 41 },
                { tbl: "routes", row_id: 41 },
            ]);
            const undo = history(db).undo.filter((r) => r.history_group === 8);
            expect(undo.map((r) => r.sql)).toEqual([
                'DELETE FROM "timeline_routes" WHERE rowid=41',
                `INSERT INTO "timeline_routes" ("id","geometry") VALUES (41,'{"v":1,"from":[0,0],"to":[1,1],"points":[]}')`,
            ]);
        });
    });
});

describe("routes and lanes storage (QA-DB-R1, QA-DB-R2, QA-DB-L1 to QA-DB-L3)", () => {
    let tempDir: string;
    let db: DatabaseSync;

    beforeEach(async () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "om-routes-db-"));
        const showPath = path.join(tempDir, "show.dots");
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
        await createNewTimelineShow(showPath);
        db = new DatabaseSync(showPath);
        db.exec("PRAGMA foreign_keys = ON");
        db.exec(`
            INSERT INTO marchers (id, section, drill_prefix, drill_order) VALUES (1, 'Brass', 'B', 1);
            INSERT INTO marchers (id, section, drill_prefix, drill_order) VALUES (2, 'Brass', 'B', 2);
            INSERT INTO timelines (id, start_beat, end_beat) VALUES (1, 0, 8);
            INSERT INTO timelines (id, start_beat, end_beat) VALUES (2, 0, 8);
            INSERT INTO timeline_routes (id, geometry) VALUES (1, '{"v":1,"from":[0,0],"to":[4,4],"points":[]}');
            INSERT INTO timeline_shapes (id, kind, geometry) VALUES (1, 'line', '{"points":[[0,0],[1,0]]}');
        `);
    });

    afterEach(() => {
        db.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    const insertTransition = (cols: Record<string, string | number | null>) => {
        const all = {
            id: 1,
            timeline_id: 1,
            slot_count: 2,
            start_beat: 0,
            end_beat: 8,
            dest_shape_id: 1,
            ...cols,
        };
        const keys = Object.keys(all);
        db.prepare(
            `INSERT INTO timeline_transitions (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`,
        ).run(...Object.values(all));
    };
    const row = (marcher: number, transition: number, slot: number) =>
        db.exec(
            `INSERT INTO timeline_assignments (marcher_id, transition_id, slot_index, start_beat, end_beat) VALUES (${marcher}, ${transition}, ${slot}, 0, 8)`,
        );
    const lane = (
        id: number,
        transition: number,
        slot: number,
        offset: [number, number] | null,
        route = 1,
    ) =>
        db.exec(
            `INSERT INTO timeline_lanes (id, transition_id, slot_index, route_id, offset_x, offset_y) VALUES (${id}, ${transition}, ${slot}, ${route}, ${offset?.[0] ?? "NULL"}, ${offset?.[1] ?? "NULL"})`,
        );
    const violations = () =>
        (
            db.prepare("SELECT code FROM timeline_route_violations").all() as {
                code: string;
            }[]
        ).map((r) => r.code);

    it("QA-DB-R1 (v0.10, I-R2′): no transition may be `route` or carry a route outside follow the leader (E-R2)", () => {
        insertTransition({ path_style: "direct", route_id: 1 });
        row(1, 1, 0);
        lane(1, 1, 0, null);
        expect(violations()).toEqual(["E-R2"]);
        db.exec("UPDATE timeline_transitions SET route_id = NULL WHERE id = 1");
        expect(violations()).toEqual([]);
    });

    it("QA-DB-R2: a route a lane uses can't be deleted, nor a transition with a lane (I-D3, RESTRICT)", () => {
        insertTransition({});
        row(1, 1, 0);
        lane(1, 1, 0, null);
        expect(() =>
            db.exec("DELETE FROM timeline_routes WHERE id = 1"),
        ).toThrow(/FOREIGN KEY constraint failed/);
        db.exec("DELETE FROM timeline_assignments");
        expect(() =>
            db.exec("DELETE FROM timeline_transitions WHERE id = 1"),
        ).toThrow(/FOREIGN KEY constraint failed/);
    });

    it("QA-DB-L1: a lane's slot is one of its transition's, from both sides (E-LN1)", () => {
        insertTransition({});
        expect(() => lane(1, 1, 2, null)).toThrow(/E-LN1/);
        lane(1, 1, 1, null);
        db.exec(
            "UPDATE timeline_transitions SET dest_shape_id = NULL WHERE id = 1",
        );
        expect(() =>
            db.exec(
                "UPDATE timeline_transitions SET slot_count = 1 WHERE id = 1",
            ),
        ).toThrow(/E-LN1/);
        expect(() =>
            db.exec("UPDATE timeline_lanes SET slot_index = 5 WHERE id = 1"),
        ).toThrow(/E-LN1/);
    });

    it("QA-DB-L2: one lane per slot (UNIQUE), an own lane alone on its route (E-R4), a lane on follow the leader is a trail (E-LN2)", () => {
        insertTransition({});
        row(1, 1, 0);
        row(2, 1, 1);
        lane(1, 1, 0, null);
        expect(() => lane(2, 1, 0, [1, 0])).toThrow(/UNIQUE/);
        lane(2, 1, 1, [1, 0]);
        expect(violations()).toEqual(["E-R4"]);
        db.exec(
            "UPDATE timeline_lanes SET offset_x = -1, offset_y = 0 WHERE id = 1",
        );
        expect(violations()).toEqual([]);
        db.exec(
            `UPDATE timeline_transitions SET path_style = 'follow_the_leader', path_params = '{"waypoints":[]}' WHERE id = 1`,
        );
        expect(violations()).toEqual(["E-LN2", "E-LN2"]);
    });

    it("QA-DB-L3: lanes of one route in one move (E-R5); a route walked by nobody fails (E-R3), a vacant spot keeps its lane while another has a marcher (Q1)", () => {
        expect(violations()).toEqual(["E-R3"]);
        insertTransition({});
        insertTransition({ id: 2, timeline_id: 2, slot_count: 1 });
        row(1, 1, 0);
        row(2, 2, 0);
        lane(1, 1, 0, [0, 0]);
        lane(2, 1, 1, [2, 0]);
        expect(violations()).toEqual([]);
        lane(3, 2, 0, [4, 0]);
        // one per pair of lanes in different moves
        expect(violations()).toEqual(["E-R5", "E-R5"]);
        db.exec("DELETE FROM timeline_lanes WHERE id = 3");
        db.exec("DELETE FROM timeline_assignments WHERE marcher_id = 1");
        expect(violations()).toEqual(["E-R3"]);
    });
});
