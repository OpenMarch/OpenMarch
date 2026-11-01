// @vitest-environment node
import { describe, expect, it } from "vitest";
import { resolveLayout, shownFamily } from "../layouts";

/** The layout a box reads as (#437): a Short back with nothing short is Full, for display */

describe("the layout a box reads as", () => {
    it("is Full for a Short back whose width divides the count, and it's still stored as Short back", () => {
        const r = resolveLayout(
            { family: "shortBack", files: 3, byFile: false },
            15,
        );
        expect(r.lines).toEqual([3, 3, 3, 3, 3]);
        expect(r.layout.family).toBe("shortBack");
        expect(shownFamily(r)).toBe("full");
    });

    it("is Full when everyone fits on one line", () => {
        expect(
            shownFamily(
                resolveLayout(
                    { family: "shortBack", files: 6, byFile: false },
                    4,
                ),
            ),
        ).toBe("full");
    });

    it("is Short back with a short line", () => {
        expect(
            shownFamily(
                resolveLayout(
                    { family: "shortBack", files: 4, byFile: false },
                    15,
                ),
            ),
        ).toBe("shortBack");
    });

    it("leaves the other layouts as they are: they always leave a spot out", () => {
        for (const family of ["stagger", "rounded", "notched"] as const)
            for (let n = 5; n <= 40; n++)
                for (let files = 2; files <= 8; files++) {
                    const r = resolveLayout(
                        { family, files, byFile: false },
                        n,
                    );
                    if (r.layout.family !== "shortBack")
                        expect(shownFamily(r)).toBe(r.layout.family);
                    if (r.layout.family === family)
                        expect(r.lines.every((l) => l === r.lines[0])).toBe(
                            false,
                        );
                }
    });
});
