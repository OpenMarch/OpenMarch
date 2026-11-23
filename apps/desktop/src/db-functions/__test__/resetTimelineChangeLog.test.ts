import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { schema } from "@/global/database/db";
import { resetTimelineChangeLog } from "../history";
import type { DbConnection } from "../types";

/**
 * Every open clears `timeline_change_log`. With working-copy saves (ADR 0018) a commit that
 * changes the file counts as an edit and publishes the show again, so clearing a log that is
 * already empty must not write.
 */
describe("resetTimelineChangeLog", () => {
    let dir: string;
    let file: string;
    let db: DatabaseSync;
    /** A second connection, as the working copy's watcher is. */
    let watcher: DatabaseSync;
    let orm: DbConnection;

    const dataVersion = () =>
        (
            watcher.prepare("PRAGMA data_version").get() as {
                data_version: number;
            }
        ).data_version;
    const rows = () =>
        (
            db
                .prepare("SELECT count(*) AS n FROM timeline_change_log")
                .get() as { n: number }
        ).n;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "openmarch-change-log-"));
        file = path.join(dir, "show.dots");
        db = new DatabaseSync(file);
        db.exec("PRAGMA journal_mode = WAL");
        db.exec(
            "CREATE TABLE timeline_change_log (seq INTEGER PRIMARY KEY, tbl TEXT NOT NULL, row_id INTEGER NOT NULL, before TEXT, after TEXT)",
        );
        watcher = new DatabaseSync(file);
        orm = drizzle(
            async (sql, params) => {
                db.prepare(sql).run(...(params as never[]));
                return { rows: [] };
            },
            { schema, casing: "snake_case" },
        ) as unknown as DbConnection;
    });

    afterEach(() => {
        watcher.close();
        db.close();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it("writes nothing when the log is already empty", async () => {
        const before = dataVersion();

        await resetTimelineChangeLog(orm);

        expect(dataVersion()).toBe(before);
    });

    it("still clears the rows a write left", async () => {
        db.exec(
            "INSERT INTO timeline_change_log (tbl, row_id) VALUES ('marchers', 1), ('shapes', 2)",
        );

        await resetTimelineChangeLog(orm);

        expect(rows()).toBe(0);
    });
});
