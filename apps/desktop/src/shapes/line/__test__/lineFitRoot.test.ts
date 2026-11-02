import { describe, expect, it } from "vitest";
import { lineInterval, lineSpots, type LineParams } from "../lineGeometry";

/**
 * Fit straight across on a curve that curls back (review on #596): the reach of a run of even
 * gaps can pass the far end and fall short of it again as the gaps grow, so more than one interval
 * reaches exactly end to end. The line takes the smallest, every time, which is the one the search
 * before #596 found here too; #596's quicker search found the other, and laid this line out with
 * its middle marcher 25 units away, so a line placed before it moved when it was opened again.
 */

/** A smooth curve through five points that comes back past where it started */
const curl: LineParams = {
    points: [
        { x: 55, y: 90 },
        { x: 40, y: 5 },
        { x: 80, y: 30 },
        { x: 80, y: 5 },
        { x: 60, y: 95 },
    ].map((q) => ({ ...q, tension: 1 })),
    spacing: { mode: "fit" },
    measured: "straight",
};

describe("Fit straight across on a curl-back (review on #596)", () => {
    it("takes the smallest interval that reaches end to end", () => {
        // The other one that does is about 108.79
        expect(lineInterval(curl, 3)).toBeCloseTo(97.99234, 4);
    });

    it("lays its marchers out where it did before #596", () => {
        const spots = lineSpots(curl, 3, 10);
        expect(spots).toHaveLength(3);
        expect(spots[0]).toMatchObject({ x: 55, y: 90 });
        expect(spots[1]!.x).toBeCloseTo(57.707221, 4);
        expect(spots[1]!.y).toBeCloseTo(15.063039, 4);
        expect(spots[2]!.x).toBeCloseTo(60, 9);
        expect(spots[2]!.y).toBeCloseTo(95, 9);
    });

    it("lays it out the same each time", () => {
        expect(lineSpots(curl, 3, 10)).toEqual(lineSpots(curl, 3, 10));
    });
});
