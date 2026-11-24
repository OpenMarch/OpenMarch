import { describe, expect, it } from "vitest";
import { stadiumAt } from "../hs/track";

describe("stadiumAt", () => {
    const straight = 45.72;
    const inner = 28.96;
    const outer = 38.1;
    const mid = (inner + outer) / 2;

    it("keeps inner and outer edges side by side when they share a reference radius", () => {
        for (let i = 0; i < 400; i++) {
            const t = i / 400;
            const a = stadiumAt(0, 0, straight, inner, t, mid);
            const b = stadiumAt(0, 0, straight, outer, t, mid);
            // Square across the track: the edges are exactly a track width apart.
            expect(a.distanceTo(b)).toBeCloseTo(outer - inner, 6);
        }
    });

    it("traces the outline of its own radius by default", () => {
        const p = stadiumAt(0, 0, straight, outer, 0.5);
        expect(p.x).toBeCloseTo(straight, 6);
        expect(p.y).toBeCloseTo(outer, 6);
    });
});
