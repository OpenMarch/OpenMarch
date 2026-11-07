import { describe, expect, it } from "vitest";
import { fitText, showCreditsFrom } from "../environment/brand";

describe("showCreditsFrom", () => {
    it("uses the show name, designer and client when set", () => {
        expect(
            showCreditsFrom(
                { projectName: " Fall ", designer: "Sam", client: "CHS" },
                "fall-v3",
            ),
        ).toEqual({ title: "Fall", designer: "Sam", client: "CHS" });
    });

    it("falls back to the file name and drops blank credits", () => {
        expect(
            showCreditsFrom(
                { projectName: "  ", designer: "", client: undefined },
                "fall-v3",
            ),
        ).toEqual({ title: "fall-v3" });
    });
});

describe("fitText", () => {
    /** A context whose text is 1 px per character per 10 px of font size. */
    function fakeContext() {
        const g = {
            font: "",
            measureText: (t: string) => ({
                width:
                    ([...t].length * Number(/(\d+)px/.exec(g.font)?.[1])) / 10,
            }),
        };
        return g as unknown as CanvasRenderingContext2D & { font: string };
    }

    it("keeps text that fits at full size", () => {
        const g = fakeContext();
        expect(fitText(g, "Fall", 600, 90, 40, 100)).toBe("Fall");
        expect(g.font).toContain("90px");
    });

    it("shrinks the font before shortening the text", () => {
        const g = fakeContext();
        // 20 chars: 180 px at 90 px, 100 px at 50 px
        expect(fitText(g, "a".repeat(20), 600, 90, 40, 100)).toBe(
            "a".repeat(20),
        );
        expect(g.font).toContain("50px");
    });

    it("ends with an ellipsis when even the smallest size is too wide", () => {
        const g = fakeContext();
        const text = fitText(
            g,
            "The Road Not Taken: Reflections",
            600,
            90,
            40,
            60,
        );
        expect(g.font).toContain("40px");
        expect(text.endsWith("…")).toBe(true);
        expect(g.measureText(text).width).toBeLessThanOrEqual(60);
        expect(text).toBe("The Road Not T…");
    });
});
