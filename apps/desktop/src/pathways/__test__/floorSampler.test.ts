import { describe, expect, it } from "vitest";
import { makeFloorSampler, solidFloor } from "../floorSampler";

/** How bright the floor is under the order lanes (pathways step 4i) */
describe("floorSampler", () => {
    it("a solid floor is its background's brightness everywhere on the field", () => {
        const white = solidFloor({ r: 255, g: 255, b: 255 });
        expect(white.brightnessAt(10, 10)).toBeCloseTo(1);
        const turf = solidFloor({ r: 52, g: 120, b: 58 });
        expect(turf.brightnessAt(0, 0)).toBeCloseTo(
            (0.2126 * 52 + 0.7152 * 120 + 0.0722 * 58) / 255,
        );
    });

    it("beyond the field it is the app's background, not the field's edge", () => {
        const floor = solidFloor(
            { r: 255, g: 255, b: 255 },
            { width: 100, height: 50, outside: 0.06 },
        );
        expect(floor.brightnessAt(50, 25)).toBeCloseTo(1);
        expect(floor.brightnessAt(-1, 25)).toBe(0.06);
        expect(floor.brightnessAt(50, 51)).toBe(0.06);
    });

    it("with no image (or no canvas to read one) it falls back to the solid floor", () => {
        const floor = makeFloorSampler({
            background: { r: 0, g: 0, b: 0 },
            image: null,
            placement: null,
            width: 100,
            height: 50,
            outside: 0.92,
        });
        expect(floor.brightnessAt(20, 20)).toBe(0);
        expect(floor.brightnessAt(200, 20)).toBe(0.92);
    });
});
