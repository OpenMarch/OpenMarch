// @vitest-environment node
/**
 * 0022 adds the cue tables (ADR 0015 D-9): a file from before it gets them empty and ends with a
 * new file's schema, and a cue of a type this build doesn't know is still there after the file
 * is opened again. A file that already has tables of those names, left by an older fork build,
 * gets this migration's in their place.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
    createNewTimelineShow,
    withDb,
} from "../../__test__/convertOnOpenFixtures";
import { rollBackMigrationsFrom } from "../../__test__/migrationRollback";
import {
    migrateFile,
    normalizedSchema,
} from "../../legacyFork/__test__/forkFileFixtures";

describe("0022_cues", () => {
    let dir: string;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "om-0022-"));
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
    });
    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    const tables = (file: string) =>
        withDb(file, (db) =>
            (
                db
                    .prepare(
                        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name LIKE 'cue%' ORDER BY name",
                    )
                    .all() as { name: string }[]
            ).map((t) => t.name),
        );
    it("adds both tables, empty: the file ends as a new file", async () => {
        const file = path.join(dir, "show.dots");
        await createNewTimelineShow(file);
        const fresh = withDb(file, normalizedSchema);
        rollBackMigrationsFrom(file, 22);
        expect(tables(file)).toEqual([]);

        await migrateFile(file);

        expect(withDb(file, normalizedSchema)).toEqual(fresh);
        expect(tables(file)).toEqual(["cue_marchers", "cues"]);
        expect(
            withDb(file, (db) => db.prepare("SELECT * FROM cues").all()),
        ).toEqual([]);
    });

    it("replaces cue tables an older fork build left in the file, and the file opens", async () => {
        const file = path.join(dir, "show.dots");
        await createNewTimelineShow(file);
        const fresh = withDb(file, normalizedSchema);
        rollBackMigrationsFrom(file, 22);
        // The fork's old `cues` (its 0022, before the merge with upstream), with a row, an index
        // and a trigger, in a file the fork-file repair has no reason to touch
        withDb(file, (db) =>
            db.exec(`
                INSERT INTO marchers (id, section, drill_prefix, drill_order) VALUES (1, 'Brass', 'B', 1);
                CREATE TABLE cues (
                    id integer PRIMARY KEY NOT NULL,
                    channel text NOT NULL,
                    kind text NOT NULL,
                    beat_id integer NOT NULL,
                    target_kind text NOT NULL,
                    value text NOT NULL,
                    name text,
                    notes text,
                    FOREIGN KEY (beat_id) REFERENCES beats(id) ON DELETE cascade
                );
                CREATE INDEX cues_beat_id_idx ON cues (beat_id);
                CREATE TABLE cue_marchers (
                    cue_id integer NOT NULL,
                    marcher_id integer NOT NULL,
                    PRIMARY KEY (cue_id, marcher_id),
                    FOREIGN KEY (cue_id) REFERENCES cues(id) ON DELETE cascade,
                    FOREIGN KEY (marcher_id) REFERENCES marchers(id) ON DELETE cascade
                );
                CREATE TRIGGER legacy_cues_ut AFTER UPDATE ON cues BEGIN SELECT 1; END;
                INSERT INTO cues (id, channel, kind, beat_id, target_kind, value, name)
                    VALUES (4, 'feet', 'state', 0, 'band', 'builtin:feet.step', 'Mark time');
                INSERT INTO cue_marchers (cue_id, marcher_id) VALUES (4, 1);
            `),
        );

        await migrateFile(file);

        expect(withDb(file, normalizedSchema)).toEqual(fresh);
        expect(tables(file)).toEqual(["cue_marchers", "cues"]);
        withDb(file, (db) => {
            // the old rows went with the old tables, and nothing else did
            expect(db.prepare("SELECT * FROM cues").all()).toEqual([]);
            expect(db.prepare("SELECT * FROM cue_marchers").all()).toEqual([]);
            expect(db.prepare("SELECT id FROM marchers").all()).toEqual([
                { id: 1 },
            ]);
            expect(
                db
                    .prepare(
                        "SELECT name FROM sqlite_schema WHERE name = 'legacy_cues_ut'",
                    )
                    .all(),
            ).toEqual([]);
            // the new tables take a cue in ADR 0015's shape
            db.exec(`
                INSERT INTO cues (id, type, beat_id, value) VALUES (7, 'look', 0, 'builtin:look.guard');
                INSERT INTO cue_marchers (cue_id, marcher_id) VALUES (7, 1);
            `);
        });
    });

    it("replaces a lone old `cues` table too, as the bug-report fixture once had", async () => {
        const file = path.join(dir, "show.dots");
        await createNewTimelineShow(file);
        const fresh = withDb(file, normalizedSchema);
        rollBackMigrationsFrom(file, 22);
        withDb(file, (db) =>
            db.exec(`
                CREATE TABLE cues (id INTEGER PRIMARY KEY, name TEXT, notes TEXT);
                INSERT INTO cues (name, notes) VALUES ('Mr. Hayes solo', 'Count off from Jordan');
            `),
        );

        await migrateFile(file);

        expect(withDb(file, normalizedSchema)).toEqual(fresh);
        expect(
            withDb(file, (db) => db.prepare("SELECT * FROM cues").all()),
        ).toEqual([]);
    });

    it("reaches a file from before 0019 too: it takes the silk Artwork table, the migrations between, and then the cue tables", async () => {
        const file = path.join(dir, "show.dots");
        await createNewTimelineShow(file);
        const fresh = withDb(file, normalizedSchema);
        rollBackMigrationsFrom(file, 19);
        const hasSilkArtwork = () =>
            withDb(
                file,
                (db) =>
                    db
                        .prepare(
                            "SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'view3d_silk_artwork'",
                        )
                        .all().length === 1,
            );
        expect(tables(file)).toEqual([]);
        expect(hasSilkArtwork()).toBe(false);

        await migrateFile(file);

        expect(withDb(file, normalizedSchema)).toEqual(fresh);
        expect(tables(file)).toEqual(["cue_marchers", "cues"]);
        expect(hasSilkArtwork()).toBe(true);
    });

    it("keeps a cue of a type and value no build knows yet when the file is opened again", async () => {
        const file = path.join(dir, "show.dots");
        await createNewTimelineShow(file);
        withDb(file, (db) =>
            db.exec(`
                INSERT INTO marchers (id, section, drill_prefix, drill_order) VALUES (1, 'Brass', 'B', 1);
                INSERT INTO cues (id, type, beat_id, value, settings_json, length, transition, label, notes)
                    VALUES (7, 'lights', 0, 'future:lights.on', '{"color":"#ff0000"}', 4, 2, 'Brass', 'from a later build');
                INSERT INTO cue_marchers (id, cue_id, marcher_id) VALUES (3, 7, 1);
            `),
        );
        const rows = () =>
            withDb(file, (db) => ({
                cues: db
                    .prepare(
                        "SELECT id, type, beat_id, value, settings_json, length, transition, label, notes FROM cues",
                    )
                    .all(),
                performers: db.prepare("SELECT * FROM cue_marchers").all(),
            }));
        const before = rows();

        await migrateFile(file);

        expect(rows()).toEqual(before);
        expect(before.cues).toEqual([
            {
                id: 7,
                type: "lights",
                beat_id: 0,
                value: "future:lights.on",
                settings_json: '{"color":"#ff0000"}',
                length: 4,
                transition: 2,
                label: "Brass",
                notes: "from a later build",
            },
        ]);
    });

    it("deletes a cue's performers with it, and a marcher's cue rows with the marcher", async () => {
        const file = path.join(dir, "show.dots");
        await createNewTimelineShow(file);
        const left = withDb(file, (db) => {
            db.exec(`
                PRAGMA foreign_keys = ON;
                INSERT INTO marchers (id, section, drill_prefix, drill_order) VALUES (1, 'Brass', 'B', 1), (2, 'Brass', 'B', 2);
                INSERT INTO cues (id, type, beat_id, value) VALUES (7, 'look', 0, 'builtin:look.guard'), (8, 'look', 0, 'builtin:look.band');
                INSERT INTO cue_marchers (cue_id, marcher_id) VALUES (7, 1), (7, 2), (8, 1);
                DELETE FROM cues WHERE id = 8;
                DELETE FROM marchers WHERE id = 2;
            `);
            return db
                .prepare("SELECT cue_id, marcher_id FROM cue_marchers")
                .all();
        });
        expect(left).toEqual([{ cue_id: 7, marcher_id: 1 }]);
    });

    it("refuses a performer twice on one cue, a length or transition under 1, and settings that aren't JSON", async () => {
        const file = path.join(dir, "show.dots");
        await createNewTimelineShow(file);
        withDb(file, (db) => {
            db.exec(`
                INSERT INTO marchers (id, section, drill_prefix, drill_order) VALUES (1, 'Brass', 'B', 1);
                INSERT INTO cues (id, type, beat_id, value) VALUES (7, 'look', 0, 'builtin:look.guard');
                INSERT INTO cue_marchers (cue_id, marcher_id) VALUES (7, 1);
            `);
            const refused = [
                "INSERT INTO cue_marchers (cue_id, marcher_id) VALUES (7, 1)",
                "INSERT INTO cues (type, beat_id, value, length) VALUES ('look', 0, 'v', 0)",
                "INSERT INTO cues (type, beat_id, value, transition) VALUES ('look', 0, 'v', 0)",
                "INSERT INTO cues (type, beat_id, value, settings_json) VALUES ('look', 0, 'v', 'not json')",
            ];
            for (const statement of refused)
                expect(() => db.exec(statement), statement).toThrow();
            // any text is a type or a value: they are checked in code
            db.exec(
                "INSERT INTO cues (type, beat_id, value) VALUES ('anything', 0, 'at all')",
            );
        });
    });
});
