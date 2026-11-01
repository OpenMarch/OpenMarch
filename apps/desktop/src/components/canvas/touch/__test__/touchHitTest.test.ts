import { describe, expect, it } from "vitest";
import {
    TOUCH_HIT_RADIUS_PX,
    distanceToRect,
    pickNearestWithinRadius,
} from "../touchHitTest";

const dot = (item: string, x: number, y: number, size = 4) => ({
    item,
    rect: { left: x - size / 2, top: y - size / 2, width: size, height: size },
});

describe("distanceToRect", () => {
    const rect = { left: 10, top: 10, width: 10, height: 10 };
    it("is 0 inside", () => {
        expect(distanceToRect({ x: 15, y: 15 }, rect)).toBe(0);
        expect(distanceToRect({ x: 10, y: 20 }, rect)).toBe(0);
    });
    it("measures to the nearest edge or corner", () => {
        expect(distanceToRect({ x: 5, y: 15 }, rect)).toBe(5);
        expect(distanceToRect({ x: 15, y: 26 }, rect)).toBe(6);
        expect(distanceToRect({ x: 23, y: 24 }, rect)).toBe(5);
    });
});

describe("pickNearestWithinRadius", () => {
    it("picks the nearest within the radius", () => {
        const picked = pickNearestWithinRadius(
            [dot("far", 0, 0), dot("near", 30, 0)],
            { x: 40, y: 0 },
            TOUCH_HIT_RADIUS_PX,
            1,
        );
        expect(picked).toBe("near");
    });

    it("picks nothing outside the radius", () => {
        expect(
            pickNearestWithinRadius(
                [dot("a", 0, 0)],
                { x: 0, y: 2 + TOUCH_HIT_RADIUS_PX + 0.5 },
                TOUCH_HIT_RADIUS_PX,
                1,
            ),
        ).toBeNull();
    });

    it("scales the radius with zoom: 22 screen px is 22/zoom canvas units", () => {
        // 10 canvas units from the dot's edge
        const point = { x: 12, y: 0 };
        expect(pickNearestWithinRadius([dot("a", 0, 0)], point, 22, 2)).toBe(
            "a",
        ); // radius 11 units
        expect(
            pickNearestWithinRadius([dot("a", 0, 0)], point, 22, 4),
        ).toBeNull(); // radius 5.5 units
        expect(
            pickNearestWithinRadius(
                [dot("a", 0, 0)],
                { x: 100, y: 0 },
                22,
                0.2,
            ),
        ).toBe("a"); // radius 110 units
    });

    it("gives ties to the one drawn on top (later)", () => {
        expect(
            pickNearestWithinRadius(
                [dot("under", 0, 0), dot("over", 0, 0)],
                { x: 5, y: 0 },
                22,
                1,
            ),
        ).toBe("over");
    });

    it("ignores bad input", () => {
        expect(
            pickNearestWithinRadius([dot("a", 0, 0)], { x: NaN, y: 0 }, 22, 1),
        ).toBeNull();
        expect(
            pickNearestWithinRadius([dot("a", 0, 0)], { x: 0, y: 0 }, 22, 0),
        ).toBeNull();
        expect(pickNearestWithinRadius([], { x: 0, y: 0 }, 22, 1)).toBeNull();
    });
});
