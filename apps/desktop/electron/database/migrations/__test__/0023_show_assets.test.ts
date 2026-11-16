// @vitest-environment node
/**
 * Migration 0023 adds the show asset store (ADR 0010 amendment 2026-11-15, fork #997): two new
 * tables, outside the undo history. A file saved before it opens with every row kept and ends
 * with a new file's schema; the tables' CHECKs hold the store's rules even for SQL that skips the
 * app's code.
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

const HASH = "a".repeat(64);

const tables = (file: string) =>
    withDb(file, (db) =>
        (
            db
                .prepare(
                    "SELECT name FROM sqlite_schema WHERE type = 'table' AND name LIKE 'show_asset%' ORDER BY name",
                )
                .all() as { name: string }[]
        ).map((t) => t.name),
    );

describe("0023_show_assets", () => {
    let dir: string;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "om-0023-"));
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
    });
    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("adds the tables to a file from before it, keeping its rows, with no triggers", async () => {
        const file = path.join(dir, "show.dots");
        await createNewTimelineShow(file);
        const fresh = withDb(file, normalizedSchema);

        rollBackMigrationsFrom(file, 23);
        expect(tables(file)).toEqual([]);
        withDb(file, (db) =>
            db.exec(`
                INSERT INTO marchers (id, section, drill_prefix, drill_order, type) VALUES
                    (100, 'Prop', 'PROP', 1, 'item');
                INSERT INTO items (id, marcher_id, kind, surface_type, model) VALUES
                    (1, 100, 'prop', 'floor', 'pit/marimba-4.3');
            `),
        );

        await migrateFile(file);

        expect(withDb(file, normalizedSchema)).toEqual(fresh);
        expect(tables(file)).toEqual(["show_asset_blobs", "show_assets"]);
        expect(
            withDb(file, (db) =>
                db
                    .prepare(
                        "SELECT name FROM sqlite_schema WHERE type = 'trigger' AND tbl_name LIKE 'show_asset%'",
                    )
                    .all(),
            ),
        ).toEqual([]);
        expect(
            withDb(file, (db) => ({
                ...db.prepare("SELECT id, model FROM items").get(),
            })),
        ).toEqual({ id: 1, model: "pit/marimba-4.3" });
    });

    it("refuses rows that break the store's rules, and takes any kind", async () => {
        const file = path.join(dir, "show.dots");
        await createNewTimelineShow(file);
        withDb(file, (db) => {
            const blob = (hash: string, data: string) =>
                db.exec(
                    `INSERT INTO show_asset_blobs (hash, data) VALUES ('${hash}', ${data})`,
                );
            expect(() => blob("abc", "x'00'")).toThrow(/hash_check/);
            expect(() => blob("A".repeat(64), "x'00'")).toThrow(/hash_check/);
            expect(() => blob(HASH, "'text'")).toThrow(/data_check/);
            blob(HASH, "x'00'");

            const asset = (columns: Record<string, string>) => {
                const row = {
                    id: "'id-1'",
                    version_hash: `'${HASH}'`,
                    kind: "'model'",
                    name: "'Marimba'",
                    parts: `'{"model":"${HASH}"}'`,
                    ...columns,
                };
                db.exec(
                    `INSERT INTO show_assets (${Object.keys(row).join(", ")}) VALUES (${Object.values(row).join(", ")})`,
                );
            };
            expect(() => asset({ id: "''" })).toThrow(/id_check/);
            expect(() => asset({ version_hash: "'nope'" })).toThrow(
                /version_hash_check/,
            );
            expect(() => asset({ parts: "'[]'" })).toThrow(/parts_check/);
            expect(() => asset({ sidecar: "'not json'" })).toThrow(
                /sidecar_check/,
            );
            expect(() => asset({ credits: "'\"a\"'" })).toThrow(
                /credits_check/,
            );
            asset({ kind: "'a-kind-from-a-newer-build'" });
            expect(() => asset({})).toThrow(/UNIQUE/);
            expect({
                ...db
                    .prepare("SELECT kind, sidecar, credits FROM show_assets")
                    .get(),
            }).toEqual({
                kind: "a-kind-from-a-newer-build",
                sidecar: "{}",
                credits: "{}",
            });
        });
    });
});
