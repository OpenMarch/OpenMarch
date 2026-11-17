// @vitest-environment node
/**
 * 0021 adds a Held mark's hold style (ADR 0015 D-5): a file from before it keeps its Held marks,
 * each with no style (the show setting), and ends with a new file's schema.
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

describe("0021_held_mark_style", () => {
    let dir: string;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "om-0021-"));
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
    });
    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    const columns = (file: string) =>
        withDb(file, (db) =>
            (
                db
                    .prepare(
                        "SELECT name FROM pragma_table_info('timeline_held_marks')",
                    )
                    .all() as { name: string }[]
            ).map((c) => c.name),
        );

    it("adds the column in place: the file's Held marks stay, with no style", async () => {
        const file = path.join(dir, "show.dots");
        await createNewTimelineShow(file);
        const fresh = withDb(file, normalizedSchema);
        rollBackMigrationsFrom(file, 21);
        expect(columns(file)).toEqual([
            "id",
            "marcher_id",
            "start_beat",
            "end_beat",
        ]);
        withDb(file, (db) =>
            db.exec(`
                INSERT INTO marchers (id, section, drill_prefix, drill_order) VALUES (1, 'Brass', 'B', 1);
                INSERT INTO timeline_held_marks (id, marcher_id, start_beat, end_beat) VALUES (7, 1, 17, 25);
            `),
        );

        await migrateFile(file);

        expect(withDb(file, normalizedSchema)).toEqual(fresh);
        expect(
            withDb(file, (db) =>
                db.prepare("SELECT * FROM timeline_held_marks").all(),
            ),
        ).toEqual([
            { id: 7, marcher_id: 1, start_beat: 17, end_beat: 25, style: null },
        ]);
    });
});
