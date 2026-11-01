// @vitest-environment node
import { describe, expect, it } from "vitest";
import { boxTool } from "../box/boxTool";
import { rowTool } from "./fakeRowKind";
import {
    basicShapeRows,
    intervalNote,
    MAX_STARS,
    starredRows,
    toggleStar,
    type ShapeLibraryRow,
} from "../library/shapeLibrary";
import type { ShapeToolEntry } from "../tool/shapeTools";

const basics: ShapeToolEntry[] = [
    { kind: boxTool, action: "shapeBlock" },
    { kind: rowTool, action: "shapeBlock" },
];

/** A row for a shape that isn't a basic kind, as saved shapes will be (#353) */
const other = (id: string): ShapeLibraryRow => ({
    id,
    group: "saved",
    label: id,
    note: null,
    kind: rowTool,
});

describe("the shape library's rows", () => {
    it("lists every basic kind in the Shapes tab's order, with its name and spacing", () => {
        const rows = basicShapeRows(basics);
        expect(
            rows.map(({ id, group, label, note }) => ({
                id,
                group,
                label,
                note,
            })),
        ).toEqual([
            { id: "block", group: "basic", label: "Box", note: "2 apart" },
            { id: "test-row", group: "basic", label: "Row", note: "2 apart" },
        ]);
        expect(rows[0].kind).toBe(boxTool);
    });

    it("says how far apart a shape's spots are, once when every spacing is the same", () => {
        expect(intervalNote([2, 2])).toBe("2 apart");
        expect(intervalNote([2, 4])).toBe("2 × 4 apart");
        expect(intervalNote([1.5])).toBe("1½ apart");
        expect(intervalNote([])).toBeNull();
    });
});

describe("stars", () => {
    const rows = [...basicShapeRows(basics), other("a"), other("b")];

    it("starring adds a shape at the end and starring it again takes it away", () => {
        const starred = toggleStar([], "b", rows);
        expect(starred).toEqual({ stars: ["b"] });
        const both = toggleStar(["b"], "block", rows);
        expect(both).toEqual({ stars: ["b", "block"] });
        expect(toggleStar(["b", "block"], "b", rows)).toEqual({
            stars: ["block"],
        });
    });

    it("gives the starred shapes in the order they were starred, skipping shapes that are gone", () => {
        expect(
            starredRows(["b", "gone", "block"], rows).map((r) => r.id),
        ).toEqual(["b", "block"]);
    });

    it(`holds ${MAX_STARS} at most: a ninth asks to unstar one first and changes nothing`, () => {
        const many = Array.from({ length: MAX_STARS }, (_, i) =>
            other(`s${i}`),
        );
        const all = [...rows, ...many];
        const full = many.map((r) => r.id);
        expect(toggleStar(full, "block", all)).toEqual({ full: true });
        // Unstarring still works when full
        expect(toggleStar(full, "s0", all)).toEqual({ stars: full.slice(1) });
    });

    it("doesn't count stars on shapes that are gone toward the limit", () => {
        const full = Array.from({ length: MAX_STARS }, (_, i) => `gone${i}`);
        expect(toggleStar(full, "block", rows)).toEqual({
            stars: [...full, "block"],
        });
    });
});
