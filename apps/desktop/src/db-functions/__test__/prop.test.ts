import { describe, expect, it } from "vitest";
import {
    buildPropPageGeometriesFromPrevious,
    createProps,
    getPropPageGeometry,
    updatePropGeometryWithPropagation,
} from "../prop";
import {
    DEFAULT_PROP_WIDTH,
    DEFAULT_PROP_HEIGHT,
} from "../../global/classes/Prop";
import { describeDbTests } from "@/test/base";

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
            rotation: 0,
            custom_geometry: null,
        });
        expect(result[1]).toEqual({
            marcher_page_id: 11,
            shape_type: "rectangle",
            width: DEFAULT_PROP_WIDTH,
            height: DEFAULT_PROP_HEIGHT,
            rotation: 0,
            custom_geometry: null,
        });
    });

    it("copies geometry from previous by marcher_id", () => {
        const prev = new Map<
            number,
            {
                shape_type: string;
                width: number;
                height: number;
                rotation: number;
                custom_geometry: string | null;
            }
        >();
        prev.set(1, {
            shape_type: "circle",
            width: 20,
            height: 20,
            rotation: 45,
            custom_geometry: null,
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
            rotation: 45,
            custom_geometry: null,
        });
        expect(result[1]).toEqual({
            marcher_page_id: 11,
            shape_type: "rectangle",
            width: DEFAULT_PROP_WIDTH,
            height: DEFAULT_PROP_HEIGHT,
            rotation: 0,
            custom_geometry: null,
        });
    });

    it("preserves custom_geometry and shape_type for custom-shaped props", () => {
        const customGeometry = JSON.stringify([
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 5, y: 10 },
        ]);
        const prev = new Map<
            number,
            {
                shape_type: string;
                width: number;
                height: number;
                rotation: number;
                custom_geometry: string | null;
            }
        >();
        prev.set(1, {
            shape_type: "polygon",
            width: 30,
            height: 25,
            rotation: 0,
            custom_geometry: customGeometry,
        });
        const result = buildPropPageGeometriesFromPrevious({
            previousGeometryByMarcherId: prev,
            newPropMarcherPages: [{ id: 10, marcher_id: 1 }],
        });
        expect(result[0]).toEqual({
            marcher_page_id: 10,
            shape_type: "polygon",
            width: 30,
            height: 25,
            rotation: 0,
            custom_geometry: customGeometry,
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

describeDbTests("prop visibility", (it) => {
    it("persists visible:false via updatePropGeometryWithPropagation", async ({
        db,
        pages,
    }) => {
        // Ensure pages fixture is loaded so createProps gets marcher_pages
        expect(pages.expectedPages.length).toBeGreaterThan(0);

        const [prop] = await createProps({
            db,
            newProps: [{ name: "Visibility Test", width: 10, height: 10 }],
        });
        expect(prop).toBeDefined();

        const before = await getPropPageGeometry({ db });
        expect(before.length).toBeGreaterThan(0);
        expect(before.every((g) => g.visible)).toBe(true);

        const currentPageId = pages.expectedPages[0].id;
        const updated = await updatePropGeometryWithPropagation({
            propId: prop.id,
            currentPageId,
            changes: { visible: false },
            propagation: "current",
            db,
        });

        expect(updated.length).toBeGreaterThan(0);
        expect(updated.every((g) => g.visible === false)).toBe(true);

        const after = await getPropPageGeometry({ db });
        const pageGeom = after.filter((g) =>
            updated.some((u) => u.id === g.id),
        );
        expect(pageGeom.every((g) => g.visible === false)).toBe(true);
    });
});
