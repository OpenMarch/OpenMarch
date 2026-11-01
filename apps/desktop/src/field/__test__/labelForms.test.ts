// @vitest-environment node
import { describe, expect, it } from "vitest";
import { autoLabelScale, crowdedLabels } from "../labelForms";

const box = (x: number, y = 0) => ({ x, y, width: 34, height: 14 });

describe("crowded labels", () => {
    it("marks labels that would touch, and leaves spread-out ones", () => {
        // 2 steps (24 units) apart touch; the last one is far away
        expect(crowdedLabels([box(0), box(24), box(200)])).toEqual([
            true,
            true,
            false,
        ]);
    });

    it("lets labels in different rows be", () => {
        expect(crowdedLabels([box(0, 0), box(10, 40)])).toEqual([false, false]);
    });
});

describe("auto label size", () => {
    const row = (gap: number) => (scale: number) =>
        [0, 1, 2].map((i) => ({
            x: i * gap,
            y: 0,
            width: 34 * scale,
            height: 14 * scale,
        }));

    it("keeps the full size while no labels touch", () => {
        expect(autoLabelScale(row(100))).toBe(1);
    });

    it("shrinks every label to the largest size where none touch", () => {
        expect(autoLabelScale(row(32))).toBe(0.85);
    });

    it("stops at the smallest readable size", () => {
        expect(autoLabelScale(row(5))).toBe(0.6);
    });
});
