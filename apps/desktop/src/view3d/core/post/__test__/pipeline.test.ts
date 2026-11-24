import { describe, expect, it } from "vitest";
import { bloomLevelSizes } from "../pipeline";

describe("post pipeline", () => {
    it("blurs from half resolution down, a few steps at most", () => {
        const sizes = bloomLevelSizes(1920, 1080);
        expect(sizes[0]).toEqual([960, 540]);
        expect(sizes).toHaveLength(5);
        sizes.slice(1).forEach(([w, h], i) => {
            expect(w).toBe(Math.floor(sizes[i][0] / 2));
            expect(h).toBe(Math.floor(sizes[i][1] / 2));
        });
        // The whole chain is about a third of the screen's pixels.
        const pixels = sizes.reduce((sum, [w, h]) => sum + w * h, 0);
        expect(pixels / (1920 * 1080)).toBeLessThan(0.34);
    });

    it("stops before a target gets too small to blur", () => {
        const sizes = bloomLevelSizes(200, 120);
        expect(sizes.length).toBeLessThan(5);
        expect(Math.min(...sizes.flat())).toBeGreaterThanOrEqual(12);
        expect(bloomLevelSizes(1, 1)).toEqual([[1, 1]]);
    });
});
