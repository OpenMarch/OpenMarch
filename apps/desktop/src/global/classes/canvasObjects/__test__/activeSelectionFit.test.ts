import { describe, expect, it } from "vitest";
import { fabric } from "fabric";
import type Marcher from "@/global/classes/Marcher";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { defaultSettings } from "@/stores/UiSettingsStore";
import OpenMarchCanvas from "../OpenMarchCanvas";
import CanvasMarcher from "../CanvasMarcher";

/**
 * A multi-marcher selection's box follows its marchers when a render moves them (defined-
 * coordinates 08: after **Only Page 2** an empty box stayed where the dots had been).
 */

const marcher = (id: number) =>
    ({
        id,
        name: null,
        section: "Brass",
        year: null,
        notes: null,
        drill_prefix: "B",
        drill_order: id,
        drill_number: `B${id}`,
        type: "marcher",
    }) as unknown as Marcher;

const setUp = () => {
    const canvas = new OpenMarchCanvas({
        canvasRef: null,
        fieldProperties:
            FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES,
        uiSettings: defaultSettings,
    });
    const marchers = [1, 2, 3].map(
        (id) =>
            new CanvasMarcher({
                marcher: marcher(id),
                coordinate: { x: 100 + id * 20, y: 100 },
            }),
    );
    for (const m of marchers) canvas.add(m);
    canvas.setActiveObjects(marchers);
    return { canvas, marchers };
};

/** Whether every marcher's dot lies inside the selection's box, in canvas units. */
const boxHoldsMarchers = (
    canvas: OpenMarchCanvas,
    marchers: CanvasMarcher[],
) => {
    const box = canvas.getActiveObject()!.getBoundingRect(true, true);
    return marchers.every((m) => {
        const { x, y } = m.getAbsoluteCoords();
        return (
            x >= box.left - 1 &&
            x <= box.left + box.width + 1 &&
            y >= box.top - 1 &&
            y <= box.top + box.height + 1
        );
    });
};

describe("the selection box after a render moves selected marchers", () => {
    it("starts around the marchers", () => {
        const { canvas, marchers } = setUp();
        expect(canvas.getActiveObject()).toBeInstanceOf(fabric.ActiveSelection);
        expect(boxHoldsMarchers(canvas, marchers)).toBe(true);
    });

    it("refits when the marchers' coordinates move them elsewhere", () => {
        const { canvas, marchers } = setUp();
        for (const m of marchers)
            m.coordinate = {
                ...m.coordinate,
                x: m.coordinate.x + 300,
                y: m.coordinate.y + 200,
            };
        canvas.refreshMarchers();
        expect(canvas.getActiveObject()).toBeInstanceOf(fabric.ActiveSelection);
        expect(canvas.getActiveObjects()).toHaveLength(3);
        expect(boxHoldsMarchers(canvas, marchers)).toBe(true);
        // The marchers are where their coordinates say
        expect(marchers.map((m) => m.getMarcherCoords().x)).toEqual(
            marchers.map((m) => m.coordinate.x),
        );
    });

    it("leaves the box alone during a drag", () => {
        const { canvas } = setUp();
        const before = canvas.getActiveObject()!.getBoundingRect(true, true);
        (
            canvas as unknown as { _currentTransform: unknown }
        )._currentTransform = {};
        canvas.fitActiveSelectionToMarchers();
        expect(canvas.getActiveObject()!.getBoundingRect(true, true)).toEqual(
            before,
        );
    });

    it("refits after a refused or snapped-back drop, which refreshes the marchers while Fabric still holds the transform (pre-merge review C1)", async () => {
        const { canvas, marchers } = setUp();
        const fabricCanvas = canvas as unknown as {
            _currentTransform: unknown;
        };
        // The drop handler puts the marchers back (here: elsewhere) from `object:modified`
        canvas.on("object:modified", () => {
            for (const m of marchers)
                m.coordinate = {
                    ...m.coordinate,
                    x: m.coordinate.x + 300,
                    y: m.coordinate.y + 200,
                };
            canvas.refreshMarchers();
        });
        // Fabric's mouse up: modified and mouse:up with the transform held, then cleared
        fabricCanvas._currentTransform = {};
        canvas.fire("object:modified", {});
        canvas.fire("mouse:up", {});
        expect(boxHoldsMarchers(canvas, marchers)).toBe(false);
        fabricCanvas._currentTransform = null;
        await Promise.resolve();
        expect(canvas.getActiveObjects()).toHaveLength(3);
        expect(boxHoldsMarchers(canvas, marchers)).toBe(true);
    });

    it("refits after a drag still going ends at the next mouse up", async () => {
        const { canvas, marchers } = setUp();
        const fabricCanvas = canvas as unknown as {
            _currentTransform: unknown;
        };
        fabricCanvas._currentTransform = {};
        for (const m of marchers)
            m.coordinate = { ...m.coordinate, x: m.coordinate.x + 300 };
        canvas.refreshMarchers();
        await Promise.resolve();
        expect(boxHoldsMarchers(canvas, marchers)).toBe(false);
        canvas.fire("mouse:up", {});
        fabricCanvas._currentTransform = null;
        await Promise.resolve();
        await Promise.resolve();
        expect(boxHoldsMarchers(canvas, marchers)).toBe(true);
    });
});
