// @vitest-environment node
/**
 * The page-era freeze (docs/timeline/phases/09-flip.md P9.5, ADR 0001 §1): with the file's
 * timeline flag on, `marcher_pages`, `midsets`, `pathways`, `shapes`, `shape_pages` and
 * `shape_page_marchers` refuse inserts, updates and deletes at the database. With the flag off
 * (page mode) they write as before. A row whose parent is gone may still be deleted (a marcher or
 * page delete cascades) and, with foreign keys off as in undo replay, inserted.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getOrm } from "../db";
import { DrizzleMigrationService } from "../services/DrizzleMigrationService";
import { convertFileOnOpen } from "../convertOnOpen";
import {
    PAGE_ERA_FROZEN_RAISE_SUFFIX,
    PAGE_ERA_FROZEN_TRIGGER_PREFIX,
    recreatePageEraFreezeTriggers,
} from "../migrations/triggers";
import {
    isPageEraFrozenError,
    PAGE_ERA_FROZEN_DB_MARKER,
} from "@/db-functions/pageEraFreezeMarker";
import {
    createBlankShow,
    createPageShow,
    migrationsFolder,
} from "./convertOnOpenFixtures";

const FROZEN_TABLES = [
    "marcher_pages",
    "midsets",
    "pathways",
    "shapes",
    "shape_pages",
    "shape_page_marchers",
] as const;
type FrozenTable = (typeof FROZEN_TABLES)[number];

const FROZEN = /read-only in timeline mode/;

/**
 * Marchers 1 and 2 with a marcher page on pages 0 and 1; a pathway; a midset on marcher 1's
 * page 1; a shape with a shape page on page 1 holding marchers 1 and 2. Marcher 3 and page 2 have
 * no page-era rows, so the inserts below have every parent present. Ids are fixed.
 */
const SEED = `
    INSERT INTO beats (id, duration, position) VALUES (1, 0.5, 1), (2, 0.5, 2);
    INSERT INTO pages (id, start_beat, is_subset) VALUES (1, 1, 0), (2, 2, 0);
    INSERT INTO marchers (id, section, drill_prefix, drill_order) VALUES
        (1, 'Brass', 'B', 1), (2, 'Brass', 'B', 2), (3, 'Brass', 'B', 3);
    INSERT INTO pathways (id, path_data) VALUES (1, '{}');
    INSERT INTO marcher_pages (id, marcher_id, page_id, x, y, path_data_id) VALUES
        (1, 1, 0, 0, 0, NULL), (2, 2, 0, 10, 0, NULL), (3, 1, 1, 0, 20, 1), (4, 2, 1, 10, 20, NULL);
    INSERT INTO midsets (id, mp_id, x, y, progress_placement) VALUES (1, 3, 0, 10, 0.5);
    INSERT INTO shapes (id, name) VALUES (1, 'line');
    INSERT INTO shape_pages (id, shape_id, page_id, svg_path) VALUES (1, 1, 1, 'M 0 20 L 10 20');
    INSERT INTO shape_page_marchers (id, shape_page_id, marcher_id, position_order) VALUES (1, 1, 1, 1), (2, 1, 2, 2);
`;

/** A new row for each frozen table, fitting the seed (all its parents exist). */
const INSERTS: Record<FrozenTable, string> = {
    marcher_pages: `INSERT INTO marcher_pages (marcher_id, page_id, x, y) VALUES (1, 2, 5, 5)`,
    midsets: `INSERT INTO midsets (mp_id, x, y, progress_placement) VALUES (4, 10, 10, 0.5)`,
    pathways: `INSERT INTO pathways (path_data) VALUES ('{}')`,
    shapes: `INSERT INTO shapes (name) VALUES ('another')`,
    shape_pages: `INSERT INTO shape_pages (shape_id, page_id, svg_path) VALUES (1, 0, 'M 0 0 L 10 0')`,
    shape_page_marchers: `INSERT INTO shape_page_marchers (shape_page_id, marcher_id, position_order) VALUES (1, 3, 3)`,
};

const UPDATES: Record<FrozenTable, string> = {
    marcher_pages: `UPDATE marcher_pages SET x = 99 WHERE id = 1`,
    midsets: `UPDATE midsets SET x = 99 WHERE id = 1`,
    pathways: `UPDATE pathways SET notes = 'edited' WHERE id = 1`,
    shapes: `UPDATE shapes SET name = 'edited' WHERE id = 1`,
    shape_pages: `UPDATE shape_pages SET svg_path = 'M 0 0 L 1 1' WHERE id = 1`,
    shape_page_marchers: `UPDATE shape_page_marchers SET position_order = 9 WHERE id = 1`,
};

const DELETES: Record<FrozenTable, string> = {
    marcher_pages: `DELETE FROM marcher_pages WHERE id = 1`,
    midsets: `DELETE FROM midsets WHERE id = 1`,
    pathways: `DELETE FROM pathways WHERE id = 1`,
    shapes: `DELETE FROM shapes WHERE id = 1`,
    shape_pages: `DELETE FROM shape_pages WHERE id = 1`,
    shape_page_marchers: `DELETE FROM shape_page_marchers WHERE id = 1`,
};

const rows = (db: DatabaseSync, table: string) =>
    db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();

const snapshot = (db: DatabaseSync) =>
    Object.fromEntries(FROZEN_TABLES.map((t) => [t, rows(db, t)]));

const setSettings = (db: DatabaseSync, json: string) =>
    db.prepare("UPDATE workspace_settings SET json_data = ?").run(json);

const setTimelineMode = (db: DatabaseSync, on: boolean) => {
    const { json_data } = db
        .prepare("SELECT json_data FROM workspace_settings")
        .get() as { json_data: string };
    setSettings(
        db,
        JSON.stringify({
            ...(JSON.parse(json_data) as object),
            timelineMode: on,
        }),
    );
};

const freezeTriggerNames = (db: DatabaseSync) =>
    (
        db
            .prepare(
                "SELECT name FROM sqlite_master WHERE type = 'trigger' AND substr(name, 1, length(?)) = ? ORDER BY name",
            )
            .all(
                PAGE_ERA_FROZEN_TRIGGER_PREFIX,
                PAGE_ERA_FROZEN_TRIGGER_PREFIX,
            ) as { name: string }[]
    ).map((r) => r.name);

describe("page-era freeze triggers (P9.5)", () => {
    let dir: string;
    let file: string;
    let db: DatabaseSync;

    beforeEach(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "om-page-era-freeze-"));
        file = path.join(dir, "show.dots");
        await createBlankShow(file);
        db = new DatabaseSync(file);
        db.exec(SEED);
    });
    afterEach(() => {
        if (db.isOpen) db.close();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it("a new file has an insert, update and delete trigger on every frozen table", () => {
        expect(freezeTriggerNames(db)).toEqual(
            FROZEN_TABLES.flatMap((t) =>
                ["del", "ins", "upd"].map(
                    (op) => `${PAGE_ERA_FROZEN_TRIGGER_PREFIX}${t}_${op}`,
                ),
            ).sort(),
        );
    });

    describe("in timeline mode", () => {
        beforeEach(() => setTimelineMode(db, true));

        it.each(FROZEN_TABLES)(
            "%s refuses insert, update and delete",
            (table) => {
                const before = snapshot(db);
                expect(() => db.exec(INSERTS[table])).toThrow(FROZEN);
                expect(() => db.exec(UPDATES[table])).toThrow(FROZEN);
                expect(() => db.exec(DELETES[table])).toThrow(FROZEN);
                expect(snapshot(db)).toEqual(before);
            },
        );

        it("the refusal is the one undo recognizes and skips", () => {
            expect(PAGE_ERA_FROZEN_DB_MARKER).toBe(
                PAGE_ERA_FROZEN_RAISE_SUFFIX,
            );
            let caught: unknown;
            try {
                db.exec(UPDATES.marcher_pages);
            } catch (e) {
                caught = e;
            }
            expect(isPageEraFrozenError(caught)).toBe(true);
            expect(
                isPageEraFrozenError(
                    new Error("wrapper", { cause: caught as Error }),
                ),
            ).toBe(true);
            expect(isPageEraFrozenError(new Error("no such column"))).toBe(
                false,
            );
        });

        it("reads still work", () => {
            expect(rows(db, "marcher_pages")).toHaveLength(4);
            expect(rows(db, "shape_page_marchers")).toHaveLength(2);
        });

        it("deleting a marcher cascades into its frozen rows", () => {
            db.exec("DELETE FROM marchers WHERE id = 1");
            expect(
                rows(db, "marcher_pages").map((r) => (r as { id: number }).id),
            ).toEqual([2, 4]);
            // The midset was on marcher 1's page 1, and marcher 1's shape page marcher goes too
            expect(rows(db, "midsets")).toEqual([]);
            expect(
                rows(db, "shape_page_marchers").map(
                    (r) => (r as { id: number }).id,
                ),
            ).toEqual([2]);
            // Page-era rows with no parent stay
            expect(rows(db, "pathways")).toHaveLength(1);
            expect(rows(db, "shapes")).toHaveLength(1);
        });

        it("deleting a page cascades into its marcher pages, midsets, shape pages and their marchers", () => {
            db.exec("DELETE FROM pages WHERE id = 1");
            expect(
                rows(db, "marcher_pages").map((r) => (r as { id: number }).id),
            ).toEqual([1, 2]);
            expect(rows(db, "midsets")).toEqual([]);
            expect(rows(db, "shape_pages")).toEqual([]);
            expect(rows(db, "shape_page_marchers")).toEqual([]);
            expect(rows(db, "shapes")).toHaveLength(1);
        });

        it("with foreign keys off (undo replay), a row whose parent is gone can be put back and removed again", () => {
            const [row] = db
                .prepare("SELECT * FROM marcher_pages WHERE id = 1")
                .all() as Record<string, number | string | null>[];
            db.exec("DELETE FROM marchers WHERE id = 1"); // cascades row 1 away
            db.exec("PRAGMA foreign_keys = OFF");
            try {
                // Undo of the marcher delete replays the child first, while the marcher is gone
                db.prepare(
                    "INSERT INTO marcher_pages (id, marcher_id, page_id, x, y) VALUES (?, ?, ?, ?, ?)",
                ).run(row!.id, row!.marcher_id, row!.page_id, row!.x, row!.y);
                expect(rows(db, "marcher_pages")).toHaveLength(3);
                // While the parent is gone, the orphan can go again (redo, or repair)
                db.exec("DELETE FROM marcher_pages WHERE id = 1");
                expect(rows(db, "marcher_pages")).toHaveLength(2);
                // A row whose parents are all present still can't be inserted
                expect(() =>
                    db.exec(
                        "INSERT INTO marcher_pages (marcher_id, page_id, x, y) VALUES (2, 2, 0, 0)",
                    ),
                ).toThrow(FROZEN);
            } finally {
                db.exec("PRAGMA foreign_keys = ON");
            }
        });

        it("a marcher page whose marcher and page both exist can't be deleted directly", () => {
            expect(() =>
                db.exec("DELETE FROM marcher_pages WHERE page_id = 1"),
            ).toThrow(FROZEN);
            expect(rows(db, "marcher_pages")).toHaveLength(4);
        });
    });

    describe("in page mode", () => {
        const pageModeSettings: [string, string][] = [
            ["flag off", JSON.stringify({ timelineMode: false })],
            ["flag missing", JSON.stringify({ defaultTempo: 120 })],
            ["flag not the JSON true", JSON.stringify({ timelineMode: 1 })],
            ["malformed settings JSON", "{not json"],
        ];
        it.each(pageModeSettings)(
            "every frozen table writes as before (%s)",
            (_label, json) => {
                setSettings(db, json);
                for (const table of FROZEN_TABLES) {
                    db.exec(INSERTS[table]);
                    db.exec(UPDATES[table]);
                }
                expect(
                    (
                        db
                            .prepare("SELECT x FROM marcher_pages WHERE id = 1")
                            .get() as { x: number }
                    ).x,
                ).toBe(99);
                for (const table of [...FROZEN_TABLES].reverse())
                    db.exec(DELETES[table]);
                expect(
                    db.prepare("SELECT 1 FROM shapes WHERE id = 1").get(),
                ).toBeUndefined();
            },
        );

        it("turning the flag back off lifts the freeze", () => {
            setTimelineMode(db, true);
            expect(() => db.exec(UPDATES.marcher_pages)).toThrow(FROZEN);
            setTimelineMode(db, false);
            db.exec(UPDATES.marcher_pages);
        });
    });

    describe("on open", () => {
        const migrate = async () => {
            await new DrizzleMigrationService(
                getOrm(db),
                db,
            ).applyPendingMigrations(migrationsFolder);
        };
        const schemaVersion = () =>
            (
                db.prepare("PRAGMA schema_version").get() as {
                    schema_version: number;
                }
            ).schema_version;

        it("adds missing freeze triggers and fixes changed ones, with no migration pending", async () => {
            const all = freezeTriggerNames(db);
            db.exec(
                `DROP TRIGGER ${PAGE_ERA_FROZEN_TRIGGER_PREFIX}marcher_pages_upd`,
            );
            db.exec(`DROP TRIGGER ${PAGE_ERA_FROZEN_TRIGGER_PREFIX}shapes_del`);
            db.exec(
                `CREATE TRIGGER ${PAGE_ERA_FROZEN_TRIGGER_PREFIX}shapes_del BEFORE DELETE ON shapes BEGIN SELECT 1; END`,
            );
            await migrate();
            expect(freezeTriggerNames(db)).toEqual(all);
            setTimelineMode(db, true);
            expect(() => db.exec(UPDATES.marcher_pages)).toThrow(FROZEN);
            expect(() => db.exec(DELETES.shapes)).toThrow(FROZEN);
        });

        it("the refresh doesn't write to a file whose triggers are current", () => {
            const before = schemaVersion();
            recreatePageEraFreezeTriggers(db);
            expect(schemaVersion()).toBe(before);
        });
    });
});

describe("conversion and the freeze (P9.3, P9.5)", () => {
    let dir: string;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "om-page-era-convert-"));
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it("conversion reads the page-era tables without writing them, clears history, then the freeze holds", async () => {
        const file = path.join(dir, "show.dots");
        await createPageShow(file);
        const db = new DatabaseSync(file);
        try {
            const before = snapshot(db);
            expect(before.marcher_pages.length).toBeGreaterThan(0);
            const result = await convertFileOnOpen(file, db, {
                backup: () => ({
                    ok: true,
                    backupPath: path.join(dir, "backup.dots"),
                    userVersion: 7,
                }),
            });
            expect(result.status).toBe("converted");
            expect(snapshot(db)).toEqual(before);
            // Nothing from before the conversion is left to replay into the frozen tables
            expect(
                db
                    .prepare(
                        "SELECT (SELECT count(*) FROM history_undo) + (SELECT count(*) FROM history_redo) AS n",
                    )
                    .get(),
            ).toEqual({ n: 0 });
            expect(() => db.exec("UPDATE marcher_pages SET x = x + 1")).toThrow(
                FROZEN,
            );
        } finally {
            db.close();
        }
    });
});
