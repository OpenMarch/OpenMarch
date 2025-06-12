import { describe, it, expect } from "vitest";
import { selectNearbyMarchers, type MarcherCoord } from "./index";

describe("selectNearbyMarchers", () => {
    it("should select marchers within the specified radius", () => {
        const allMarchers: MarcherCoord[] = [
            { id: 1, coordinate: { x: 0, y: 0 } },
            { id: 2, coordinate: { x: 1, y: 0 } },
            { id: 3, coordinate: { x: 2, y: 0 } },
            { id: 4, coordinate: { x: 5, y: 5 } },
        ];

        const selectedMarchers: MarcherCoord[] = [
            { id: 1, coordinate: { x: 0, y: 0 } },
        ];

        const result = selectNearbyMarchers(allMarchers, selectedMarchers, 1.5);
        expect(result).toHaveLength(2);
        expect(result.map((m) => m.id).sort()).toEqual([1, 2]);
    });

    it("should handle multiple selected marchers", () => {
        const allMarchers: MarcherCoord[] = [
            { id: 1, coordinate: { x: 0, y: 0 } },
            { id: 2, coordinate: { x: 1, y: 0 } },
            { id: 3, coordinate: { x: 2, y: 0 } },
            { id: 4, coordinate: { x: 3, y: 0 } },
        ];

        const selectedMarchers: MarcherCoord[] = [
            { id: 1, coordinate: { x: 0, y: 0 } },
            { id: 4, coordinate: { x: 3, y: 0 } },
        ];

        const result = selectNearbyMarchers(allMarchers, selectedMarchers, 1.5);
        expect(result).toHaveLength(4);
        expect(result.map((m) => m.id).sort()).toEqual([1, 2, 3, 4]);
    });

    it("should handle empty selection", () => {
        const allMarchers: MarcherCoord[] = [
            { id: 1, coordinate: { x: 0, y: 0 } },
            { id: 2, coordinate: { x: 1, y: 0 } },
        ];

        const result = selectNearbyMarchers(allMarchers, [], 1.5);
        expect(result).toHaveLength(0);
    });

    it("should handle diagonal distances correctly", () => {
        const allMarchers: MarcherCoord[] = [
            { id: 1, coordinate: { x: 0, y: 0 } },
            { id: 2, coordinate: { x: 1, y: 1 } }, // ~1.414 units away
            { id: 3, coordinate: { x: 2, y: 2 } }, // ~2.828 units away
        ];

        const selectedMarchers: MarcherCoord[] = [
            { id: 1, coordinate: { x: 0, y: 0 } },
        ];

        const result = selectNearbyMarchers(allMarchers, selectedMarchers, 1.5);
        expect(result).toHaveLength(2);
        expect(result.map((m) => m.id).sort()).toEqual([1, 2]);
    });

    it("should use default radius when not specified", () => {
        const allMarchers: MarcherCoord[] = [
            { id: 1, coordinate: { x: 0, y: 0 } },
            { id: 2, coordinate: { x: 1.5, y: 0 } },
            { id: 3, coordinate: { x: 3, y: 0 } },
        ];

        const selectedMarchers: MarcherCoord[] = [
            { id: 1, coordinate: { x: 0, y: 0 } },
        ];

        const result = selectNearbyMarchers(allMarchers, selectedMarchers);
        expect(result).toHaveLength(2);
        expect(result.map((m) => m.id).sort()).toEqual([1, 2]);
    });
});
