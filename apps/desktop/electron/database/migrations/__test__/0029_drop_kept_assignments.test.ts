// @vitest-environment node
/**
 * Migration 0029 removes kept spots (holds #467, ADR 0001 amendment 2026-10-29): it drops
 * `timeline_kept_assignments`, which 0018 added. A kept spot's move is an ordinary move of the
 * marcher's own, so the timeline rows stay and the show plays the same.
 *
 * A stored undo or redo step that names the table would fail with "no such table" once it is
 * gone, so a file whose history names it gets both stacks cleared in the same migration (owner,
 * 2026-10-28). A file whose history doesn't name it keeps its history.
 *
 * It comes after `0020_drop_page_era`, so a timeline file takes it on open and a page-era file
 * takes it in its conversion; it needs no `user_version` bump.
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
    createPageShow,
    migrationsFolder,
    withDb,
} from "../../__test__/convertOnOpenFixtures";
import {
    migrationAt,
    rollBackMigrationsFrom,
} from "../../__test__/migrationRollback";

const DROP_MIGRATION = migrationAt(29);

/** `withDb` for work that awaits: the file stays open until `fn` settles */
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

const tableNames = (db: DatabaseSync) =>
    (
        db
            .prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")
            .all() as { name: string }[]
    ).map((r) => r.name);

const history = (db: DatabaseSync) => ({
    undo: db
        .prepare(
            "SELECT history_group, sql FROM history_undo ORDER BY sequence",
        )
        .all() as Row[],
    redo: db
        .prepare(
            "SELECT history_group, sql FROM history_redo ORDER BY sequence",
        )
        .all() as Row[],
    stats: db
        .prepare("SELECT cur_undo_group, cur_redo_group FROM history_stats")
        .get() as Row,
});

const migrate = async (db: DatabaseSync) => {
    applyFileVersionDecision(db, false);
    await new DrizzleMigrationService(getOrm(db), db).applyPendingMigrations(
        migrationsFolder,
    );
};

const ui: ConvertOnOpenUi = { whilePreparing: async (work) => work(() => {}) };

/**
 * Opens a file as `openShow` does: convert on open (the person agreed), the migrations, then the
 * undo triggers the renderer creates on every open.
 */
const open = async (filePath: string) => {
    const db = new DatabaseSync(filePath);
    try {
        const outcome = await runConvertOnOpen(filePath, db, ui, {
            confirmed: true,
            migrationsFolder,
            hooks: { now: () => new Date("2026-10-29T12:00:00.000Z") },
        });
        await migrate(db);
        const { createAllUndoTriggers } =
            await import("@/db-functions/history");
        await createAllUndoTriggers(getOrm(db) as never);
        return outcome;
    } finally {
        db.close();
    }
};

/** Every marcher's resolved position at every whole beat of the timeline, as the app plays it */
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

/**
 * A kept spot as a build with kept spots stored it: the marker on an existing assignment, and the
 * history the app's triggers wrote for Keep (undo deletes the marker) and for an undone Follow
 * again (redo deletes it again), beside an unrelated step on `marchers`.
 */
const addKeptSpotWithHistory = (db: DatabaseSync) => {
    const { id } = db
        .prepare("SELECT min(id) AS id FROM timeline_assignments")
        .get() as { id: number };
    db.prepare(
        "INSERT INTO timeline_kept_assignments (assignment_id) VALUES (?)",
    ).run(id);
    const undo = db.prepare(
        "INSERT INTO history_undo (history_group, sql) VALUES (?, ?)",
    );
    undo.run(1, `UPDATE "marchers" SET "name"='A' WHERE rowid=1`);
    undo.run(2, `DELETE FROM "timeline_assignments" WHERE rowid=${id}`);
    undo.run(2, `DELETE FROM "timeline_kept_assignments" WHERE rowid=${id}`);
    db.prepare(
        "INSERT INTO history_redo (history_group, sql) VALUES (?, ?)",
    ).run(1, `DELETE FROM "timeline_kept_assignments" WHERE rowid=${id}`);
    db.exec("UPDATE history_stats SET cur_undo_group = 3, cur_redo_group = 2");
    return id;
};

describe(`Migration ${DROP_MIGRATION.tag}`, () => {
    let tempDir: string;
    let showPath: string;

    beforeEach(async () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "om-0029-"));
        showPath = path.join(tempDir, "show.dots");
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
        vi.spyOn(console, "info").mockImplementation(() => {});
        await createPageShow(showPath);
        // A converted timeline file from before 0029, as fork nightlies and the lab build saved it
        await open(showPath);
        rollBackMigrationsFrom(showPath, DROP_MIGRATION.idx);
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("drops the kept table and clears both history stacks of a file whose history names it; the show plays the same", async () => {
        const before = await withDbAsync(showPath, async (db) => {
            expect(tableNames(db)).toContain("timeline_kept_assignments");
            addKeptSpotWithHistory(db);
            return {
                positions: await positions(db),
                assignments: db
                    .prepare("SELECT * FROM timeline_assignments ORDER BY id")
                    .all(),
            };
        });

        expect(await open(showPath)).toMatchObject({ kind: "none" });

        await withDbAsync(showPath, async (db) => {
            expect(tableNames(db)).not.toContain("timeline_kept_assignments");
            expect(history(db)).toEqual({
                undo: [],
                redo: [],
                stats: { cur_undo_group: 1, cur_redo_group: 1 },
            });
            // The kept spot's move is an ordinary move: every row stays, and every position
            expect(
                db
                    .prepare("SELECT * FROM timeline_assignments ORDER BY id")
                    .all(),
            ).toEqual(before.assignments);
            expect(await positions(db)).toEqual(before.positions);
            expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
        });
    });

    it("clears both stacks when only the redo stack names it", async () => {
        withDb(showPath, (db) => {
            db.prepare(
                "INSERT INTO history_undo (history_group, sql) VALUES (1, ?)",
            ).run(`UPDATE "marchers" SET "name"='A' WHERE rowid=1`);
            db.prepare(
                "INSERT INTO history_redo (history_group, sql) VALUES (1, ?)",
            ).run(
                `INSERT INTO "timeline_kept_assignments" ("assignment_id","created_at") VALUES (1,'2026-10-20 10:00:00')`,
            );
            db.exec(
                "UPDATE history_stats SET cur_undo_group = 2, cur_redo_group = 2",
            );
        });

        await open(showPath);

        withDb(showPath, (db) =>
            expect(history(db)).toEqual({
                undo: [],
                redo: [],
                stats: { cur_undo_group: 1, cur_redo_group: 1 },
            }),
        );
    });

    it("keeps the history of a file whose history doesn't name it", async () => {
        const kept = withDb(showPath, (db) => {
            db.prepare(
                "INSERT INTO history_undo (history_group, sql) VALUES (1, ?)",
            ).run(`UPDATE "marchers" SET "name"='A' WHERE rowid=1`);
            db.prepare(
                "INSERT INTO history_redo (history_group, sql) VALUES (1, ?)",
            ).run(`UPDATE "marchers" SET "name"='B' WHERE rowid=1`);
            db.exec(
                "UPDATE history_stats SET cur_undo_group = 2, cur_redo_group = 2",
            );
            return history(db);
        });
        expect(kept.undo).toHaveLength(1);

        await open(showPath);

        withDb(showPath, (db) => {
            expect(tableNames(db)).not.toContain("timeline_kept_assignments");
            expect(history(db)).toEqual(kept);
        });
    });

    it("a new edit after the migration undoes and redoes", async () => {
        withDb(showPath, (db) => addKeptSpotWithHistory(db));
        await open(showPath);

        await withDbAsync(showPath, async (db) => {
            const { performRedo, performUndo } =
                await import("@/db-functions/history");
            const orm = getOrm(db) as never;
            const nameOf = () =>
                (
                    db
                        .prepare("SELECT name FROM marchers WHERE id = 1")
                        .get() as {
                        name: string | null;
                    }
                ).name;
            const was = nameOf();
            // The undo triggers log the edit into the current undo group
            db.exec("UPDATE marchers SET name = 'Renamed' WHERE id = 1");
            expect(history(db).undo).toHaveLength(1);

            expect((await performUndo(orm)).success).toBe(true);
            expect(nameOf()).toBe(was);
            expect((await performRedo(orm)).success).toBe(true);
            expect(nameOf()).toBe("Renamed");
        });
    });

    it("comes to a page-era file in its conversion, after the kept table's 0018", async () => {
        const pageEra = path.join(tempDir, "page-era.dots");
        await createPageShow(pageEra);
        // Up to the timeline-only migrations: the kept table is there until the conversion
        withDb(pageEra, (db) => {
            applyFileVersionDecision(db, false);
        });
        const db = new DatabaseSync(pageEra);
        try {
            await migrate(db);
            expect(tableNames(db)).toContain("timeline_kept_assignments");
        } finally {
            db.close();
        }

        await open(pageEra);

        withDb(pageEra, (after) =>
            expect(tableNames(after)).not.toContain(
                "timeline_kept_assignments",
            ),
        );
    });
});
