import { describe, expect, it } from "vitest";
import { hitRadius, marcherAt, MIN_HIT_SCREEN_RADIUS } from "../hitTest";

const drawn = (points: [number, number, number][]) => ({
    ids: points.map(([id]) => id),
    positions: Float64Array.from(points.flatMap(([, x, y]) => [x, y])),
});

describe("hitRadius", () => {
    it("is the dot's size when zoomed in", () => {
        // Six field units: the dot's five plus its outline
        expect(hitRadius(4)).toBe(6);
    });

    it("never gets smaller on screen than the minimum when zoomed out", () => {
        expect(hitRadius(0.25) * 0.25).toBeCloseTo(MIN_HIT_SCREEN_RADIUS);
    });
});

describe("marcherAt", () => {
    const marchers = drawn([
        [1, 100, 100],
        [2, 108, 100],
        [3, 300, 300],
    ]);

    it("finds the marcher under the point", () => {
        expect(marcherAt(marchers, { x: 300, y: 302 }, 6)).toBe(3);
    });

    it("finds nothing on empty field", () => {
        expect(marcherAt(marchers, { x: 200, y: 200 }, 6)).toBeNull();
    });

    it("counts the edge of the radius as a hit, and just past it as a miss", () => {
        expect(marcherAt(marchers, { x: 306, y: 300 }, 6)).toBe(3);
        expect(marcherAt(marchers, { x: 306.1, y: 300 }, 6)).toBeNull();
    });

    it("picks the nearest of overlapping marchers", () => {
        expect(marcherAt(marchers, { x: 103, y: 100 }, 6)).toBe(1);
        expect(marcherAt(marchers, { x: 105, y: 100 }, 6)).toBe(2);
    });

    it("passes over hidden marchers", () => {
        const withHidden = { ...marchers, hidden: Uint8Array.from([0, 1, 0]) };
        expect(marcherAt(withHidden, { x: 105, y: 100 }, 6)).toBe(1);
        expect(marcherAt(withHidden, { x: 113, y: 100 }, 6)).toBeNull();
    });

    it("passes over marchers that can't be selected", () => {
        const notTwo = (id: number) => id !== 2;
        expect(marcherAt(marchers, { x: 105, y: 100 }, 6, notTwo)).toBe(1);
        expect(marcherAt(marchers, { x: 113, y: 100 }, 6, notTwo)).toBeNull();
    });
});
