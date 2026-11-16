// @vitest-environment node
/**
 * Migration 0020 gives items an optional built-in 3D model and a lock. A file saved before it
 * opens with every item kept, drawn as a block (no model) and unlocked, and ends with a new file's
 * schema.
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

const itemColumns = (file: string) =>
    withDb(file, (db) =>
        (
            db.prepare("SELECT name FROM pragma_table_info('items')").all() as {
                name: string;
            }[]
        ).map((c) => c.name),
    );

describe("0020_item_model_and_lock", () => {
    let dir: string;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "om-0020-"));
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
    });
    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("adds the column in place to a file from before it, keeping every item as an unlocked block placed by hand", async () => {
        const file = path.join(dir, "show.dots");
        await createNewTimelineShow(file);
        const fresh = withDb(file, normalizedSchema);

        rollBackMigrationsFrom(file, 20);
        expect(itemColumns(file)).not.toContain("model");
        expect(itemColumns(file)).not.toContain("locked");
        expect(itemColumns(file)).not.toContain("from_preset");
        withDb(file, (db) =>
            db.exec(`
                INSERT INTO marchers (id, section, drill_prefix, drill_order, type) VALUES
                    (100, 'Prop', 'PROP', 1, 'item'),
                    (101, 'Equipment', 'EQUIP', 1, 'item');
                INSERT INTO items (id, marcher_id, kind, surface_type, color) VALUES
                    (1, 100, 'prop', 'floor', 'rgba(1, 2, 3, 1)'),
                    (2, 101, 'equipment', NULL, NULL);
            `),
        );

        await migrateFile(file);

        expect(withDb(file, normalizedSchema)).toEqual(fresh);
        expect(
            withDb(file, (db) =>
                db
                    .prepare(
                        "SELECT id, marcher_id, kind, surface_type, color, model, locked, from_preset FROM items ORDER BY id",
                    )
                    .all()
                    .map((row) => ({ ...row })),
            ),
        ).toEqual([
            {
                id: 1,
                marcher_id: 100,
                kind: "prop",
                surface_type: "floor",
                color: "rgba(1, 2, 3, 1)",
                model: null,
                locked: 0,
                from_preset: 0,
            },
            {
                id: 2,
                marcher_id: 101,
                kind: "equipment",
                surface_type: null,
                color: null,
                model: null,
                locked: 0,
                from_preset: 0,
            },
        ]);
    });

    it("keeps equipment's surface type rule: a model doesn't stand in for one", async () => {
        const file = path.join(dir, "show.dots");
        await createNewTimelineShow(file);
        withDb(file, (db) => {
            db.exec(
                "INSERT INTO marchers (id, section, drill_prefix, drill_order, type) VALUES (100, 'Equipment', 'EQUIP', 1, 'item')",
            );
            db.exec(
                "INSERT INTO items (id, marcher_id, kind, model) VALUES (1, 100, 'equipment', 'pit/marimba-5.0')",
            );
            expect(() =>
                db.exec("UPDATE items SET surface_type = 'floor' WHERE id = 1"),
            ).toThrow(/items_surface_type_check/);
        });
    });
});
