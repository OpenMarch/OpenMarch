// @vitest-environment node
import { describe, expect, it } from "vitest";
import { reorderTagAppearances } from "../tagAppearanceOrder";

const list = [
    { id: 10, priority: 2 },
    { id: 11, priority: 1 },
    { id: 12, priority: 0 },
];

describe("reorderTagAppearances", () => {
    it("moves an item up and renumbers priorities, highest first", () => {
        expect(reorderTagAppearances(list, 2, 1)).toEqual([
            { id: 10, priority: 2 },
            { id: 12, priority: 1 },
            { id: 11, priority: 0 },
        ]);
    });

    it("moves an item down", () => {
        expect(reorderTagAppearances(list, 0, 1)?.map((a) => a.id)).toEqual([
            11, 10, 12,
        ]);
    });

    it("moves across several places, as a drag does", () => {
        expect(reorderTagAppearances(list, 0, 2)?.map((a) => a.id)).toEqual([
            11, 12, 10,
        ]);
    });

    it("does nothing past either end or in place", () => {
        expect(reorderTagAppearances(list, 0, -1)).toBeNull();
        expect(reorderTagAppearances(list, 2, 3)).toBeNull();
        expect(reorderTagAppearances(list, 1, 1)).toBeNull();
    });

    it("does not change the input", () => {
        reorderTagAppearances(list, 0, 2);
        expect(list.map((a) => a.id)).toEqual([10, 11, 12]);
    });
});
