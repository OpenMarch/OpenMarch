// @vitest-environment node
import { describe, expect, it } from "vitest";
import { addedColumn, skipsExistingColumn } from "../addColumnGuard";

describe("addColumnGuard", () => {
    const columns: Record<string, string[]> = {
        marchers: ["id", "name", "type"],
    };
    const columnsOf = (table: string) => columns[table] ?? [];

    it("reads the table and column of an ADD COLUMN, after leading comments", () => {
        expect(
            addedColumn(
                "-- why\n-- more\nALTER TABLE `marchers` ADD COLUMN `type` text DEFAULT 'marcher' NOT NULL",
            ),
        ).toEqual({ table: "marchers", column: "type" });
        expect(addedColumn('alter table "cues" add notes text')).toEqual({
            table: "cues",
            column: "notes",
        });
        expect(addedColumn("CREATE TABLE IF NOT EXISTS `items` (id)")).toBe(
            null,
        );
        expect(
            addedColumn("ALTER TABLE `__new_marchers` RENAME TO `marchers`"),
        ).toBe(null);
    });

    it("skips only an ADD COLUMN whose table has the column already", () => {
        expect(
            skipsExistingColumn(
                "ALTER TABLE `marchers` ADD COLUMN `type` text",
                columnsOf,
            ),
        ).toBe(true);
        expect(
            skipsExistingColumn(
                "ALTER TABLE `marchers` ADD COLUMN `TYPE` text",
                columnsOf,
            ),
        ).toBe(true);
        expect(
            skipsExistingColumn(
                "ALTER TABLE `marchers` ADD COLUMN `home_x` real",
                columnsOf,
            ),
        ).toBe(false);
        expect(
            skipsExistingColumn(
                "ALTER TABLE `items` ADD COLUMN `x`",
                columnsOf,
            ),
        ).toBe(false);
        expect(skipsExistingColumn("DROP TABLE `marchers`", columnsOf)).toBe(
            false,
        );
    });
});
