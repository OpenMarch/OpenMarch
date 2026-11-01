// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isPerformer, performersOnly } from "../Marcher";

describe("performersOnly", () => {
    it("keeps performers and drops items, in order", () => {
        const rows = [
            { id: 1, type: "marcher" },
            { id: 2, type: "item" },
            { id: 3, type: "marcher" },
        ];
        expect(performersOnly(rows).map((r) => r.id)).toEqual([1, 3]);
    });

    it("counts a row read without its type as a performer", () => {
        expect(isPerformer({})).toBe(true);
        expect(isPerformer({ type: "item" })).toBe(false);
    });
});
