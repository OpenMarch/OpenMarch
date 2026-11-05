import { describe, expect, it } from "vitest";
import { addTap, TAP_RESET_MS, tapBpm } from "../tapTempoMath";

const tapAll = (times: number[]) =>
    times.reduce<number[]>((taps, t) => addTap(taps, t), []);

describe("tap tempo", () => {
    it("needs two taps", () => {
        expect(tapBpm([])).toBeNull();
        expect(tapBpm(tapAll([1000]))).toBeNull();
    });

    it("averages the taps since the first", () => {
        // 500 ms apart: 120
        expect(tapBpm(tapAll([0, 500, 1000, 1500]))).toBeCloseTo(120, 6);
        // one late tap and one early one cancel out
        expect(tapBpm(tapAll([0, 530, 1000, 1470, 2000]))).toBeCloseTo(120, 6);
    });

    it("starts over after a long pause", () => {
        const taps = tapAll([0, 500, 1000, 1000 + TAP_RESET_MS + 1]);
        expect(taps).toEqual([1000 + TAP_RESET_MS + 1]);
        expect(tapBpm(tapAll([0, 500, 4000, 4400, 4800]))).toBeCloseTo(150, 6);
    });

    it("keeps the last 32 taps", () => {
        const taps = tapAll(Array.from({ length: 40 }, (_, i) => i * 400));
        expect(taps).toHaveLength(32);
        expect(tapBpm(taps)).toBeCloseTo(150, 6);
    });
});
