// @vitest-environment node
/**
 * The rollback helper turns a new file back into upstream's 0016 (a timeline file a later upstream
 * release could write before it has this build's migrations), and opening it brings it back to
 * exactly a new file, its rows kept.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
    createNewTimelineShow,
    migrationsFolder,
    withDb,
} from "./convertOnOpenFixtures";
import { journal, rollBackMigrationsFrom } from "./migrationRollback";
import {
    normalizedSchema,
    upstreamFile,
    migrateFile,
} from "../legacyFork/__test__/forkFileFixtures";

describe("rollBackMigrationsFrom", () => {
    let dir: string;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "om-rollback-"));
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
    });
    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("has a rollback for every migration after upstream's 0016", async () => {
        const file = path.join(dir, "show.dots");
        await createNewTimelineShow(file);
        expect(journal.entries.length).toBeGreaterThan(17);
        expect(() => rollBackMigrationsFrom(file, 17)).not.toThrow();
    });

    it("rolls a new file back to upstream's 0016, and opening it brings back a new file with its rows", async () => {
        const file = path.join(dir, "show.dots");
        await createNewTimelineShow(file);
        withDb(file, (db) =>
            db.exec(`
                INSERT INTO beats (id, duration, position) VALUES (1, 0.5, 1);
                INSERT INTO measures (id, start_beat) VALUES (1, 1);
                INSERT INTO marchers (id, section, drill_prefix, drill_order) VALUES (1, 'Brass', 'B', 1);
            `),
        );
        const fresh = withDb(file, normalizedSchema);
        const rows = () =>
            withDb(file, (db) => ({
                beats: db.prepare("SELECT id, duration FROM beats").all(),
                measures: db
                    .prepare("SELECT id, start_beat FROM measures")
                    .all(),
                marchers: db
                    .prepare("SELECT id, section, drill_order FROM marchers")
                    .all(),
            }));
        const before = rows();

        rollBackMigrationsFrom(file, 17);

        const upstream = path.join(dir, "upstream.dots");
        withDb(upstream, (db) => upstreamFile(db, 8));
        const upstreamSchema = withDb(upstream, normalizedSchema);
        expect(withDb(file, normalizedSchema)).toEqual(upstreamSchema);
        expect(rows()).toEqual(before);

        await migrateFile(file);
        expect(withDb(file, normalizedSchema)).toEqual(fresh);
        expect(rows()).toEqual(before);
    });
});
