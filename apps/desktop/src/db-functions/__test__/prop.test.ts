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
            outline_type: "rectangle",
            width: DEFAULT_PROP_WIDTH,
            height: DEFAULT_PROP_HEIGHT,
            rotation: 0,
            custom_outline: null,
        });
        expect(result[1]).toEqual({
            marcher_page_id: 11,
            outline_type: "rectangle",
            width: DEFAULT_PROP_WIDTH,
            height: DEFAULT_PROP_HEIGHT,
            rotation: 0,
            custom_outline: null,
        });
    });

    it("copies geometry from previous by marcher_id", () => {
        const prev = new Map<
            number,
            {
                outline_type: string;
                width: number;
                height: number;
                rotation: number;
                custom_outline: string | null;
            }
        >();
        prev.set(1, {
            outline_type: "circle",
            width: 20,
            height: 20,
            rotation: 45,
            custom_outline: null,
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
            outline_type: "circle",
            width: 20,
            height: 20,
            rotation: 45,
            custom_outline: null,
        });
        expect(result[1]).toEqual({
            marcher_page_id: 11,
            outline_type: "rectangle",
            width: DEFAULT_PROP_WIDTH,
            height: DEFAULT_PROP_HEIGHT,
            rotation: 0,
            custom_outline: null,
        });
    });

    it("preserves custom_outline and outline_type for custom-shaped props", () => {
        const customGeometry = JSON.stringify([
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 5, y: 10 },
        ]);
        const prev = new Map<
            number,
            {
                outline_type: string;
                width: number;
                height: number;
                rotation: number;
                custom_outline: string | null;
            }
        >();
        prev.set(1, {
            outline_type: "polygon",
            width: 30,
            height: 25,
            rotation: 0,
            custom_outline: customGeometry,
        });
        const result = buildPropPageGeometriesFromPrevious({
            previousGeometryByMarcherId: prev,
            newPropMarcherPages: [{ id: 10, marcher_id: 1 }],
        });
        expect(result[0]).toEqual({
            marcher_page_id: 10,
            outline_type: "polygon",
            width: 30,
            height: 25,
            rotation: 0,
            custom_outline: customGeometry,
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

describeDbTests("prop geometry propagation", (it) => {
    it("propagates a width change to every page of the prop", async ({
        db,
        pages,
    }) => {
        // Ensure pages fixture is loaded so createProps gets marcher_pages
        expect(pages.expectedPages.length).toBeGreaterThan(0);

        const [prop] = await createProps({
            db,
            newProps: [{ name: "Propagation Test", width: 10, height: 10 }],
        });
        expect(prop).toBeDefined();

        const before = await getPropPageGeometry({ db });
        expect(before.length).toBeGreaterThan(0);
        expect(before.every((g) => g.width === 10)).toBe(true);

        const currentPageId = pages.expectedPages[0].id;
        const updated = await updatePropGeometryWithPropagation({
            propId: prop.id,
            currentPageId,
            changes: { width: 25 },
            propagation: "all",
            db,
        });

        expect(updated.length).toBe(before.length);
        expect(updated.every((g) => g.width === 25)).toBe(true);

        const after = await getPropPageGeometry({ db });
        expect(after.every((g) => g.width === 25)).toBe(true);
        // Untouched fields survive the propagation
        expect(after.every((g) => g.height === 10)).toBe(true);
    });
});
