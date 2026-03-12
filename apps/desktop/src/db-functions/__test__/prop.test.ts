import { describe, expect, it } from "vitest";
import { buildPropPageGeometriesFromPrevious } from "../prop";
import {
    DEFAULT_PROP_WIDTH,
    DEFAULT_PROP_HEIGHT,
} from "../../global/classes/Prop";

describe("buildPropPageGeometriesFromPrevious", () => {
    it("uses defaults when no previous geometry", () => {
        const result = buildPropPageGeometriesFromPrevious({
            previousGeometryByMarcherId: new Map(),
            newPropMarcherPages: [
                { id: 10, marcher_id: 1 },
                { id: 11, marcher_id: 2 },
            ],
        });
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            marcher_page_id: 10,
            shape_type: "rectangle",
            width: DEFAULT_PROP_WIDTH,
            height: DEFAULT_PROP_HEIGHT,
            radius: null,
            rotation: 0,
        });
        expect(result[1]).toEqual({
            marcher_page_id: 11,
            shape_type: "rectangle",
            width: DEFAULT_PROP_WIDTH,
            height: DEFAULT_PROP_HEIGHT,
            radius: null,
            rotation: 0,
        });
    });

    it("copies geometry from previous by marcher_id", () => {
        const prev = new Map<
            number,
            {
                shape_type: string;
                width: number;
                height: number;
                radius: number | null;
                rotation: number;
            }
        >();
        prev.set(1, {
            shape_type: "circle",
            width: 20,
            height: 20,
            radius: 10,
            rotation: 45,
        });
        const result = buildPropPageGeometriesFromPrevious({
            previousGeometryByMarcherId: prev,
            newPropMarcherPages: [
                { id: 10, marcher_id: 1 },
                { id: 11, marcher_id: 2 },
            ],
        });
        expect(result[0]).toEqual({
            marcher_page_id: 10,
            shape_type: "circle",
            width: 20,
            height: 20,
            radius: 10,
            rotation: 45,
        });
        expect(result[1]).toEqual({
            marcher_page_id: 11,
            shape_type: "rectangle",
            width: DEFAULT_PROP_WIDTH,
            height: DEFAULT_PROP_HEIGHT,
            radius: null,
            rotation: 0,
        });
    });

    it("uses custom default dimensions when provided", () => {
        const result = buildPropPageGeometriesFromPrevious({
            previousGeometryByMarcherId: new Map(),
            newPropMarcherPages: [{ id: 5, marcher_id: 1 }],
            defaultWidth: 8,
            defaultHeight: 12,
        });
        expect(result[0]).toMatchObject({
            marcher_page_id: 5,
            width: 8,
            height: 12,
        });
    });
});
