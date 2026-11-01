// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GUIDE_INK, GUIDE_INK_TEXT } from "../guideInk";

/** The snap guide's color (#427) reads on the common field themes */
const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const f = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
};
const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
};

describe("the guide ink", () => {
    it("is at least 3:1 on a white field and a dark one, and under its white name", () => {
        expect(contrast(GUIDE_INK, "#ffffff")).toBeGreaterThanOrEqual(3);
        expect(contrast(GUIDE_INK, "#1e1e23")).toBeGreaterThanOrEqual(3);
        expect(GUIDE_INK_TEXT).toBe("white");
    });
});
