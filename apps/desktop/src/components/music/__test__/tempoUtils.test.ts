import { describe, it, expect } from "vitest";
import { mixedMeterPermutations } from "../TempoGroup/TempoUtils";

describe("mixedMeterPermutations", () => {
    it("should return empty array for total beats of 0", () => {
        const result = mixedMeterPermutations(0);
        expect(result).toEqual([]);
    });

    it("should return empty array for total beats less than minimum allowed beat", () => {
        const result = mixedMeterPermutations(1, [2, 3]);
        expect(result).toEqual([]);
    });

    it("should find all permutations for 5/8 with default allowed beats [2,3]", () => {
        const result = mixedMeterPermutations(5);
        expect(result).toEqual([
            [3, 2],
            [2, 3],
        ]);
    });

    it("should find all permutations for 7/8 with default allowed beats [2,3]", () => {
        const result = mixedMeterPermutations(7);
        expect(result).toEqual([
            [3, 2, 2],
            [2, 3, 2],
            [2, 2, 3],
        ]);
    });

    it("should find all permutations for 8/8 with default allowed beats [2,3]", () => {
        const result = mixedMeterPermutations(8);
        expect(result).toEqual([
            [3, 3, 2],
            [3, 2, 3],
            [2, 3, 3],
            [2, 2, 2, 2],
        ]);
    });

    it("should work with custom allowed beats", () => {
        const result = mixedMeterPermutations(4, [1, 2]);
        expect(result).toEqual([
            [2, 2],
            [2, 1, 1],
            [1, 2, 1],
            [1, 1, 2],
            [1, 1, 1, 1],
        ]);
    });

    it("should handle single allowed beat value", () => {
        const result = mixedMeterPermutations(6, [2]);
        expect(result).toEqual([[2, 2, 2]]);
    });

    it("should return empty array when no valid permutations exist", () => {
        const result = mixedMeterPermutations(5, [4]);
        expect(result).toEqual([]);
    });

    it("should handle larger allowed beats array", () => {
        const result = mixedMeterPermutations(4, [1, 2, 3, 4]);
        expect(result).toEqual([
            [4],
            [3, 1],
            [2, 2],
            [2, 1, 1],
            [1, 3],
            [1, 2, 1],
            [1, 1, 2],
            [1, 1, 1, 1],
        ]);
    });
});
