// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    groundDistanceAt,
    groundSpeedAt,
    groundTrack,
    turnRateAt,
} from "../groundMotion";

// stand 2 counts, march 4 counts at 0.5 m a count along +x, stand 2 counts
const xs = [0, 0, 0, 0.5, 1, 1.5, 2, 2, 2];
const positions = Float64Array.from(xs.flatMap((x) => [x, 3]));
const half = () => 0.5; // 120 bpm
const track = groundTrack(positions, half);

describe("ground motion", () => {
    it("adds up the distance covered by each count boundary", () => {
        expect([...track.distance]).toEqual([0, 0, 0, 0.5, 1, 1.5, 2, 2, 2]);
        expect([...track.speed]).toEqual([0, 0, 1, 1, 1, 1, 0, 0]);
    });

    it("reads the distance between boundaries linearly", () => {
        expect(groundDistanceAt(track, 3.5)).toBeCloseTo(0.75, 12);
        expect(groundDistanceAt(track, -1)).toBe(0);
        expect(groundDistanceAt(track, 100)).toBe(2);
    });

    it("eases the speed between count middles, with no jump at a boundary", () => {
        expect(groundSpeedAt(track, 0.5)).toBe(0);
        expect(groundSpeedAt(track, 2.5)).toBe(1);
        expect(groundSpeedAt(track, 2)).toBeCloseTo(0.5, 12);
        const e = 1e-9;
        expect(groundSpeedAt(track, 2 - e)).toBeCloseTo(
            groundSpeedAt(track, 2 + e),
            6,
        );
        expect(groundSpeedAt(track, 4)).toBe(1);
        expect(groundSpeedAt(track, 7.5)).toBe(0);
    });

    it("gives the same answer however the clock got there", () => {
        const a = [groundSpeedAt(track, 2.3), groundDistanceAt(track, 2.3)];
        groundSpeedAt(track, 6.1);
        groundDistanceAt(track, 0.2);
        expect([
            groundSpeedAt(track, 2.3),
            groundDistanceAt(track, 2.3),
        ]).toEqual(a);
    });

    it("measures the turn rate in rad/s, across the ±π seam", () => {
        // a quarter turn over one count of 0.5 s: π rad/s
        const heading = (c: number) =>
            Math.PI - 0.1 + (Math.PI / 2) * Math.min(Math.max(c - 1, 0), 1);
        expect(turnRateAt(heading, 1.5, half)).toBeCloseTo(Math.PI, 9);
        expect(turnRateAt(heading, 3, half)).toBe(0);
    });
});
