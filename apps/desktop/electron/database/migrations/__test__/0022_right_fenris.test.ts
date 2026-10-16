// @vitest-environment node
/**
 * Migration 0022 adds the performer cue tables (ADR 0004 D-5): `cues`, `cue_marchers`,
 * `phrase_assets` and `page_performer_settings`. It only creates tables and indexes and needs no
 * `user_version` bump. It comes after `0020_drop_page_era`, so a timeline file takes it on open
 * and a page-era file takes it in its conversion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getOrm } from "../../db";
import { DrizzleMigrationService } from "../../services/DrizzleMigrationService";
import {
    applyFileVersionDecision,
    PAGE_MODEL_USER_VERSION,
    readUserVersion,
    TIMELINE_MODEL_USER_VERSION,
} from "../../fileVersion";
import { runConvertOnOpen, type ConvertOnOpenUi } from "../../convertOnOpen";
import {
    createPageShow,
    migrationsFolder,
    withDb,
} from "../../__test__/convertOnOpenFixtures";

type Journal = { entries: { idx: number; tag: string; when: number }[] };
const journal: Journal = JSON.parse(
    fs.readFileSync(path.join(migrationsFolder, "meta/_journal.json"), "utf-8"),
);
const CUE_MIGRATION = journal.entries.find((e) => e.idx === 22)!;

const CUE_TABLES = [
    "cue_marchers",
    "cues",
    "page_performer_settings",
    "phrase_assets",
];

/** Tables later migrations add (0023's 3D View cameras), gone from a file from before 0022 too */
const LATER_TABLES = ["view3d_cameras"];

const tableNames = (db: DatabaseSync) =>
    (
        db
            .prepare(
                "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
            )
            .all() as { name: string }[]
    ).map((r) => r.name);

const count = (db: DatabaseSync, table: string) =>
    Number(
        (
            db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as {
                n: number;
            }
        ).n,
    );

/** Turns a migrated file back into one from before 0022: no cue tables, 0022 not recorded. */
const removeCueMigration = (filePath: string) =>
    withDb(filePath, (db) => {
        db.exec("PRAGMA foreign_keys = OFF");
        for (const table of [...CUE_TABLES, ...LATER_TABLES])
            db.exec(`DROP TABLE ${table}`);
        // This migration and every later one: the migrator applies only those after the last it finds
        db.prepare(
            "DELETE FROM __drizzle_migrations WHERE created_at >= ?",
        ).run(CUE_MIGRATION.when);
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
            hooks: { now: () => new Date("2026-10-12T12:00:00.000Z") },
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

/** A few cue rows on the page show's beats, marchers and pages. */
const insertCues = (db: DatabaseSync) => {
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(`
        INSERT INTO tags (id, name) VALUES (1, 'Front');
        INSERT INTO phrase_assets (id, name, label, source, channels_json, format_version, data_json)
            VALUES (1, 'Toss', '1x', 'copied_builtin', '["horn_equipment"]', 1, '{}');
        INSERT INTO cues (id, channel, kind, target_kind, beat_id, value, settings_json)
            VALUES (1, 'horn_equipment', 'state', 'band', 3, 'builtin:horn_equipment.horn.up', '{"angle":"box"}');
        INSERT INTO cues (id, channel, kind, target_kind, target_tag_id, beat_id, value, phrase_asset_id, length)
            VALUES (2, 'horn_equipment', 'phrase', 'tag', 1, 9, 'show:1', 1, 3);
        INSERT INTO cues (id, channel, kind, target_kind, beat_id, value, ripple_json)
            VALUES (3, 'silk', 'state', 'set', 10, 'library:4f1c2a7e@9a8b', '{"version":1,"span":4,"order":"drill"}');
        INSERT INTO cue_marchers (cue_id, marcher_id) VALUES (3, 1), (3, 2);
        INSERT INTO page_performer_settings (page_id, dot_mode) VALUES (1, 'body');
    `);
};

const cueRows = (db: DatabaseSync) => ({
    cues: db.prepare("SELECT * FROM cues ORDER BY id").all(),
    cue_marchers: db.prepare("SELECT * FROM cue_marchers ORDER BY id").all(),
    phrase_assets: db.prepare("SELECT * FROM phrase_assets ORDER BY id").all(),
    page_performer_settings: db
        .prepare("SELECT * FROM page_performer_settings ORDER BY page_id")
        .all(),
});

describe(`Migration ${CUE_MIGRATION.tag}`, () => {
    let tempDir: string;
    let showPath: string;

    beforeEach(async () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "om-0022-"));
        showPath = path.join(tempDir, "show.dots");
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
        await createPageShow(showPath);
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("leaves the tables out of a page-era file until it converts", async () => {
        const file = new DatabaseSync(showPath);
        try {
            await migrate(file);
        } finally {
            file.close();
        }

        withDb(showPath, (db) => {
            for (const table of CUE_TABLES)
                expect(tableNames(db)).not.toContain(table);
            expect(readUserVersion(db)).toBe(PAGE_MODEL_USER_VERSION);
        });
    });

    it("adds the tables when a page-era file converts, and keeps the show", async () => {
        const before = withDb(showPath, (db) => ({
            marchers: count(db, "marchers"),
            beats: count(db, "beats"),
            pages: count(db, "pages"),
        }));

        expect(await open(showPath)).toMatchObject({
            kind: "conversion",
            status: "converted",
        });

        withDb(showPath, (db) => {
            expect(tableNames(db)).toEqual(expect.arrayContaining(CUE_TABLES));
            expect(readUserVersion(db)).toBe(TIMELINE_MODEL_USER_VERSION);
            expect(count(db, "marchers")).toBe(before.marchers);
            expect(count(db, "beats")).toBe(before.beats);
            expect(count(db, "pages")).toBe(before.pages);
            insertCues(db);
            expect(cueRows(db).cues).toHaveLength(3);
        });
    });

    it("opens a converted timeline file from before it: the tables appear, version 8 and the timeline are kept", async () => {
        await open(showPath);
        removeCueMigration(showPath);
        const before = withDb(showPath, (db) => ({
            tables: tableNames(db),
            timelines: count(db, "timelines"),
            assignments: count(db, "timeline_assignments"),
        }));
        expect(before.tables).not.toContain("cues");
        expect(before.timelines).toBeGreaterThan(0);

        // A converted file doesn't convert again
        expect(await open(showPath)).toMatchObject({ kind: "none" });

        withDb(showPath, (db) => {
            expect(tableNames(db)).toEqual(
                [...before.tables, ...CUE_TABLES, ...LATER_TABLES].sort(),
            );
            expect(readUserVersion(db)).toBe(TIMELINE_MODEL_USER_VERSION);
            expect(count(db, "timelines")).toBe(before.timelines);
            expect(count(db, "timeline_assignments")).toBe(before.assignments);
            insertCues(db);
            expect(count(db, "cue_marchers")).toBe(2);
        });
    });

    describe("constraints", () => {
        let db: DatabaseSync;
        beforeEach(async () => {
            await open(showPath);
            db = new DatabaseSync(showPath);
            insertCues(db);
        });
        afterEach(() => db.close());

        const insert = (columns: Record<string, string | number | null>) => {
            const row = {
                channel: "body",
                kind: "state",
                target_kind: "band",
                beat_id: 4,
                value: "builtin:body.kneel",
                ...columns,
            };
            const names = Object.keys(row);
            db.prepare(
                `INSERT INTO cues (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`,
            ).run(...Object.values(row));
        };

        it.each<[string, Record<string, string | number | null>]>([
            ["a channel outside the seven", { channel: "head" }],
            ["an unknown kind", { kind: "move" }],
            ["an unknown target", { target_kind: "everyone" }],
            ["a section target with no section", { target_kind: "section" }],
            ["a tag target with no tag", { target_kind: "tag" }],
            ["a band target with a section", { target_section: "Trumpet" }],
            [
                "a section target with a tag too",
                {
                    target_kind: "section",
                    target_section: "T",
                    target_tag_id: 1,
                },
            ],
            [
                "a set target with a tag",
                { target_kind: "set", target_tag_id: 1 },
            ],
            ["a phrase with no length", { kind: "phrase" }],
            ["a phrase of length 1", { kind: "phrase", length: 1 }],
            [
                "a phrase with a transition",
                { kind: "phrase", length: 4, transition_length: 2 },
            ],
            ["a state with a length", { length: 4 }],
            ["a transition of 0", { transition_length: 0 }],
            ["a fractional transition", { transition_length: 1.5 }],
            ["a value with no form", { value: "kneel" }],
            ["a builtin value naming a phrase asset", { phrase_asset_id: 1 }],
            [
                "a show value on a state",
                { value: "show:1", phrase_asset_id: 1 },
            ],
            [
                "a show value naming another asset",
                {
                    kind: "phrase",
                    length: 3,
                    value: "show:2",
                    phrase_asset_id: 1,
                },
            ],
            [
                "a show value with no asset",
                { kind: "phrase", length: 3, value: "show:1" },
            ],
            ["a library value on Body", { value: "library:a@b" }],
            [
                "a library value with no version",
                { channel: "uniform", value: "library:a" },
            ],
            [
                "a library value on a phrase",
                {
                    channel: "carry",
                    kind: "phrase",
                    length: 3,
                    value: "library:a@b",
                },
            ],
            ["none on Silk", { channel: "silk", value: "none" }],
            ["settings that aren't an object", { settings_json: "[]" }],
            ["settings that aren't JSON", { settings_json: "{" }],
            [
                "a ripple on Feet",
                {
                    channel: "feet",
                    value: "builtin:feet.step",
                    ripple_json: '{"version":1,"span":4,"order":"drill"}',
                },
            ],
            [
                "a ripple of another version",
                { ripple_json: '{"version":2,"span":4,"order":"drill"}' },
            ],
            [
                "a ripple of 0 counts",
                { ripple_json: '{"version":1,"span":0,"order":"drill"}' },
            ],
            [
                "a ripple with a fractional span",
                { ripple_json: '{"version":1,"span":1.5,"order":"drill"}' },
            ],
            [
                "a ripple in an unknown order",
                { ripple_json: '{"version":1,"span":4,"order":"spiral"}' },
            ],
            ["a missing beat", { beat_id: 99999 }],
            ["a missing tag", { target_kind: "tag", target_tag_id: 99 }],
        ])("rejects %s", (_, columns) => {
            expect(() => insert(columns)).toThrow();
        });

        it.each<[string, Record<string, string | number | null>]>([
            ["a band state", {}],
            [
                "a section state",
                { target_kind: "section", target_section: "Trumpet" },
            ],
            ["a tag state", { target_kind: "tag", target_tag_id: 1 }],
            ["a set state", { target_kind: "set" }],
            [
                "a builtin phrase",
                { kind: "phrase", length: 8, value: "builtin:body.dance" },
            ],
            [
                "a show phrase",
                {
                    kind: "phrase",
                    length: 3,
                    value: "show:1",
                    phrase_asset_id: 1,
                },
            ],
            ["a transition", { transition_length: 3 }],
            ["Carry none", { channel: "carry", value: "none" }],
            [
                "a Carry library item",
                { channel: "carry", value: "library:3b1a@ff00" },
            ],
            [
                "a Uniform library item",
                { channel: "uniform", value: "library:3b1a@ff00" },
            ],
            [
                "a ripple on Silk",
                {
                    channel: "silk",
                    value: "library:a@b",
                    ripple_json: '{"version":1,"span":8,"order":"down_form"}',
                },
            ],
            // States only on Facing, Carry, Silk and Uniform is compile's rule (a flag), not storage's
            [
                "a builtin phrase on Facing",
                {
                    channel: "facing",
                    kind: "phrase",
                    length: 2,
                    value: "builtin:facing.spin",
                },
            ],
        ])("accepts %s", (_, columns) => {
            expect(() => insert(columns)).not.toThrow();
        });

        it("cascades beat, tag, marcher and cue deletes, and restricts a phrase asset in use", () => {
            db.exec("DELETE FROM beats WHERE id = 3");
            expect(db.prepare("SELECT id FROM cues ORDER BY id").all()).toEqual(
                [{ id: 2 }, { id: 3 }],
            );
            expect(() =>
                db.exec("DELETE FROM phrase_assets WHERE id = 1"),
            ).toThrow();
            db.exec("DELETE FROM tags WHERE id = 1");
            expect(db.prepare("SELECT id FROM cues ORDER BY id").all()).toEqual(
                [{ id: 3 }],
            );
            db.exec("DELETE FROM phrase_assets WHERE id = 1");
            db.exec("DELETE FROM marchers WHERE id = 1");
            expect(
                db.prepare("SELECT marcher_id FROM cue_marchers").all(),
            ).toEqual([{ marcher_id: 2 }]);
            db.exec("DELETE FROM cues WHERE id = 3");
            expect(count(db, "cue_marchers")).toBe(0);
        });

        it("rejects a duplicate set member and an unknown dot mode; deleting a page deletes its dot mode", () => {
            expect(() =>
                db.exec(
                    "INSERT INTO cue_marchers (cue_id, marcher_id) VALUES (3, 1)",
                ),
            ).toThrow();
            expect(() =>
                db.exec(
                    "INSERT INTO page_performer_settings (page_id, dot_mode) VALUES (2, 'hip')",
                ),
            ).toThrow();
            db.exec("DELETE FROM pages WHERE id = 1");
            expect(count(db, "page_performer_settings")).toBe(0);
        });
    });
});
