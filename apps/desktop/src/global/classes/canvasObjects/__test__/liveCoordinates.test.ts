import { describe, expect, it } from "vitest";
import OpenMarchCanvas from "../OpenMarchCanvas";
import { fabric } from "fabric";
import CanvasMarcher, { setTranslatedCoords } from "../CanvasMarcher";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type Marcher from "@/global/classes/Marcher";
import { defaultSettings } from "@/stores/UiSettingsStore";

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

const setup = () => {
    const canvas = new OpenMarchCanvas({
        canvasRef: null,
        fieldProperties:
            FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES,
        uiSettings: defaultSettings,
    });
    const marchers = [1, 2].map(
        (id) =>
            new CanvasMarcher({
                marcher: marcher(id),
                coordinate: { x: id * 20, y: 40 },
            }),
    );
    for (const m of marchers) {
        canvas.add(m);
        canvas.add(m.textLabel);
    }
    return { canvas, marchers };
};

describe("CanvasMarcher.setLiveCoordinates", () => {
    it("puts the marcher and its label where the full update does", () => {
        const { marchers } = setup();
        const [live, full] = marchers;
        live!.setLiveCoordinates({ x: 123.5, y: 77.25 });
        full!.setMarcherCoords({ x: 123.5, y: 77.25 });
        expect(live!.left).toBeCloseTo(full!.left!, 9);
        expect(live!.top).toBeCloseTo(full!.top!, 9);
        expect(live!.getMarcherCoords()).toEqual(full!.getMarcherCoords());
        expect(live!.textLabel.left).toBeCloseTo(full!.textLabel.left!, 9);
        expect(live!.textLabel.top).toBeCloseTo(full!.textLabel.top!, 9);
        // bounding coords follow, for offscreen culling and hit tests
        expect(live!.aCoords!.tl.x).toBeCloseTo(full!.aCoords!.tl.x, 9);
        expect(live!.textLabel.aCoords!.br.y).toBeCloseTo(
            full!.textLabel.aCoords!.br.y,
            9,
        );
    });
});

describe("OpenMarchCanvas.getLiveCanvasMarchers", () => {
    it("keeps the list until a marcher is added or removed", () => {
        const { canvas, marchers } = setup();
        const first = canvas.getLiveCanvasMarchers();
        expect(first).toHaveLength(2);
        expect(canvas.getLiveCanvasMarchers()).toBe(first);
        canvas.remove(marchers[0]!.textLabel);
        expect(canvas.getLiveCanvasMarchers()).toBe(first);
        canvas.remove(marchers[0]!);
        expect(canvas.getLiveCanvasMarchers()).toEqual([marchers[1]]);
        const third = new CanvasMarcher({
            marcher: marcher(3),
            coordinate: { x: 0, y: 0 },
        });
        canvas.add(third);
        expect(canvas.getLiveCanvasMarchers()).toContain(third);
    });
});

describe("setTranslatedCoords", () => {
    const coordsOf = (obj: fabric.Object) => ({
        aCoords: obj.aCoords,
        lineCoords: (obj as unknown as { lineCoords: unknown }).lineCoords,
    });

    it("gives exactly Fabric's setCoords(true) for marchers, labels and padded objects", () => {
        const { canvas, marchers } = setup();
        canvas.setViewportTransform([1.7, 0, 0, 1.7, -33.3, 12.9]);
        const padded = new fabric.Circle({
            left: 41.3,
            top: 17.9,
            radius: 3.3,
            strokeWidth: 1.5,
            originX: "center",
            originY: "center",
            padding: 2.5,
        });
        canvas.add(padded);
        // twice: the second call updates the corners it made in place
        for (const position of [
            { x: 123.37, y: 77.31 },
            { x: -12.06, y: 301.9 },
        ]) {
            marchers[0]!.setLiveCoordinates(position);
            padded.left = position.x;
            for (const obj of [marchers[0]!, marchers[0]!.textLabel, padded]) {
                expect(setTranslatedCoords(obj)).toBe(true);
                const ours = coordsOf(obj);
                const actual = structuredClone(ours);
                fabric.Object.prototype.setCoords.call(obj, true);
                expect(actual).toEqual(structuredClone(coordsOf(obj)));
                // put ours back, so the next position reuses them
                Object.assign(obj, ours);
            }
        }
    });

    it("leaves rotated and corner-origin objects to Fabric", () => {
        const { canvas } = setup();
        const rotated = new fabric.Rect({
            width: 4,
            height: 4,
            angle: 30,
            originX: "center",
            originY: "center",
        });
        const cornered = new fabric.Rect({ width: 4, height: 4 });
        canvas.add(rotated, cornered);
        expect(setTranslatedCoords(rotated)).toBe(false);
        expect(setTranslatedCoords(cornered)).toBe(false);
    });
});
