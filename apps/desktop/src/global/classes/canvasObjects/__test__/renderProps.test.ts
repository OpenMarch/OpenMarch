import { describe, expect, it } from "vitest";
import { fabric } from "fabric";
import {
    addPropsToCanvas,
    removePropsFromCanvas,
    propDisplayName,
} from "../renderProps";
import CanvasProp from "../CanvasProp";
import type MarcherPage from "@/global/classes/MarcherPage";
import type {
    PropWithMarcher,
    DatabasePropPageGeometry,
} from "@/global/classes/Prop";

const makeProp = (id: number, marcherId: number): PropWithMarcher =>
    ({
        id,
        marcher_id: marcherId,
        image_opacity: 1,
        marcher: {
            id: marcherId,
            name: id === 1 ? "Tarp" : null,
            drill_prefix: "PROP",
            drill_order: id,
            section: "PROP",
            type: "prop",
        },
    }) as unknown as PropWithMarcher;

const makeMarcherPage = (id: number, marcherId: number): MarcherPage =>
    ({ id, marcher_id: marcherId, x: 100, y: 200 }) as MarcherPage;

const makeGeometry = (marcherPageId: number): DatabasePropPageGeometry =>
    ({
        id: marcherPageId * 10,
        marcher_page_id: marcherPageId,
        outline_type: "rectangle",
        width: 10,
        height: 10,
        rotation: 0,
        custom_outline: null,
    }) as unknown as DatabasePropPageGeometry;

/** One prop (id 1, marcher 100) on one page (marcher_page 500). */
const fixture = () => ({
    props: [makeProp(1, 100)],
    geometries: [makeGeometry(500)],
    marcherPages: [makeMarcherPage(500, 100)],
    pixelsPerFoot: 12,
});

describe("addPropsToCanvas", () => {
    it("adds a CanvasProp keyed by marcher id", () => {
        const canvas = new fabric.StaticCanvas(null);

        const byId = addPropsToCanvas({ canvas, ...fixture() });

        expect(Object.keys(byId)).toEqual(["100"]);
        expect(byId[100]).toBeInstanceOf(CanvasProp);
        expect(canvas.getObjects()).toContain(byId[100]);
    });

    it("omits the name label when no display options are given", () => {
        const canvas = new fabric.StaticCanvas(null);

        const byId = addPropsToCanvas({ canvas, ...fixture() });

        // Export callers pass no display options, so the canvas holds only the
        // prop itself — no invisible label objects.
        expect(canvas.getObjects()).toHaveLength(1);
        expect(canvas.getObjects()).not.toContain(byId[100].propNameLabel);
    });

    it("adds the name label when the prop should show its name", () => {
        const canvas = new fabric.StaticCanvas(null);

        const byId = addPropsToCanvas({
            canvas,
            ...fixture(),
            display: { showNameFor: () => true },
        });

        expect(canvas.getObjects()).toContain(byId[100].propNameLabel);
        expect(byId[100].propNameLabel.visible).toBe(true);
    });

    it("skips props the user has hidden", () => {
        const canvas = new fabric.StaticCanvas(null);

        const byId = addPropsToCanvas({
            canvas,
            ...fixture(),
            display: { hiddenPropIds: { "1": true } },
        });

        expect(byId).toEqual({});
        expect(canvas.getObjects()).toHaveLength(0);
    });

    it("skips props with no marcher_page or no geometry on this page", () => {
        const canvas = new fabric.StaticCanvas(null);
        const base = fixture();

        const noGeometry = addPropsToCanvas({
            canvas,
            ...base,
            geometries: [],
        });
        expect(noGeometry).toEqual({});

        const noMarcherPage = addPropsToCanvas({
            canvas,
            ...base,
            marcherPages: [],
        });
        expect(noMarcherPage).toEqual({});
        expect(canvas.getObjects()).toHaveLength(0);
    });

    it("accepts marcherPages as a record keyed by marcher id", () => {
        const canvas = new fabric.StaticCanvas(null);
        const base = fixture();

        const byId = addPropsToCanvas({
            canvas,
            ...base,
            marcherPages: { 100: makeMarcherPage(500, 100) },
        });

        expect(byId[100]).toBeInstanceOf(CanvasProp);
    });
});

describe("removePropsFromCanvas", () => {
    it("removes the props and their labels, leaving the canvas empty", () => {
        const canvas = new fabric.StaticCanvas(null);
        const byId = addPropsToCanvas({
            canvas,
            ...fixture(),
            display: { showNameFor: () => true },
        });
        expect(canvas.getObjects().length).toBeGreaterThan(1);

        removePropsFromCanvas(canvas, byId);

        expect(canvas.getObjects()).toHaveLength(0);
    });

    it("accepts an array as well as a keyed record", () => {
        const canvas = new fabric.StaticCanvas(null);
        const byId = addPropsToCanvas({ canvas, ...fixture() });

        removePropsFromCanvas(canvas, Object.values(byId));

        expect(canvas.getObjects()).toHaveLength(0);
    });

    it("is a no-op for props whose labels were never added", () => {
        const canvas = new fabric.StaticCanvas(null);
        const byId = addPropsToCanvas({ canvas, ...fixture() });

        expect(() => removePropsFromCanvas(canvas, byId)).not.toThrow();
        expect(canvas.getObjects()).toHaveLength(0);
    });
});

describe("propDisplayName", () => {
    it("uses the marcher name when set", () => {
        expect(propDisplayName(makeProp(1, 100))).toBe("Tarp");
    });

    it("falls back to the drill number", () => {
        expect(propDisplayName(makeProp(2, 101))).toBe("PROP2");
    });
});
