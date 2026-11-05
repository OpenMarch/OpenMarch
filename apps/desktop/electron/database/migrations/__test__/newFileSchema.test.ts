// @vitest-environment node
/**
 * A brand-new file is exactly the schema `schema.ts` describes: every table with exactly its
 * columns, and no other table. `_blank.dots` (`pnpm run migrate`) is such a file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "../schema";
import {
    createNewTimelineShow,
    migrationsFolder,
    withDb,
} from "../../__test__/convertOnOpenFixtures";
import { normalizedSchema } from "../../legacyFork/__test__/forkFileFixtures";

const schemaTables = Object.values(schema)
    .filter((value): value is SQLiteTable => value instanceof SQLiteTable)
    .map((table) => getTableConfig(table));

describe("a new file", () => {
    let dir: string;
    let file: string;
    beforeEach(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "om-new-file-"));
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
        file = path.join(dir, "new.dots");
        await createNewTimelineShow(file);
    });
    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("has every table of schema.ts with exactly its columns, and no other", () => {
        withDb(file, (db) => {
            const tables = (
                db
                    .prepare(
                        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations' ORDER BY name",
                    )
                    .all() as { name: string }[]
            ).map((t) => t.name);
            expect(tables).toEqual(schemaTables.map((t) => t.name).sort());
            for (const table of schemaTables)
                expect(
                    (
                        db
                            .prepare("SELECT name FROM pragma_table_info(?)")
                            .all(table.name) as { name: string }[]
                    )
                        .map((c) => c.name)
                        .sort(),
                    table.name,
                ).toEqual(table.columns.map((c) => c.name).sort());
        });
    });

    it("is what _blank.dots is", () => {
        expect(
            withDb(
                path.join(migrationsFolder, "_blank.dots"),
                normalizedSchema,
            ),
        ).toEqual(withDb(file, normalizedSchema));
    });
});
