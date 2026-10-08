import { describe, expect, it } from "vitest";
import { fabric } from "fabric";
import OpenMarchCanvas from "../OpenMarchCanvas";
import CanvasMarcher from "../CanvasMarcher";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type Marcher from "@/global/classes/Marcher";
import { defaultSettings } from "@/stores/UiSettingsStore";
import type { TimelinePositionBuffer } from "@/timeline/timelineCanvas";

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

/** The resolver's answer at some beat: marcher n at (100 + n, 200) */
const positions = {
    forEachMarcher: (
        marchers: Iterable<CanvasMarcher>,
        apply: (marcher: CanvasMarcher, x: number, y: number) => void,
    ) => {
        for (const m of marchers) apply(m, 100 + m.marcherObj.id, 200);
    },
} as unknown as TimelinePositionBuffer;

/** Fabric's record of a drag in progress (`_setupCurrentTransform`) */
const holdOnCanvas = (canvas: OpenMarchCanvas, target: fabric.Object) => {
    (canvas as unknown as { _currentTransform: unknown })._currentTransform = {
        target,
        action: "drag",
    };
};
const release = (canvas: OpenMarchCanvas) => {
    (canvas as unknown as { _currentTransform: unknown })._currentTransform =
        null;
};

describe("the timeline static render while a marcher is held", () => {
    it("leaves a dragged marcher under the pointer, and returns it to the new beat later", () => {
        const { canvas, marchers } = setup();
        const [held, other] = marchers as [CanvasMarcher, CanvasMarcher];
        // An arrow-key run moved everyone live; the user then grabbed a marcher and dragged it
        held.setLiveCoordinates({ x: 55, y: 66 });
        holdOnCanvas(canvas, held);
        // The run's full update arrives mid-drag
        canvas.renderMarcherPositions(positions, 3);
        expect(held.getMarcherCoords()).toMatchObject({ x: 55, y: 66 });
        expect(other.getMarcherCoords()).toMatchObject({ x: 102, y: 200 });
        // The record is current, so a refused move returns it to this beat, not the old one
        release(canvas);
        canvas.refreshMarchers();
        expect(held.getMarcherCoords()).toMatchObject({ x: 101, y: 200 });
        expect(held.coordinate.page_id).toBe(3);
    });

    it("leaves every marcher of a dragged selection where it is", () => {
        const { canvas, marchers } = setup();
        const [a, b] = marchers as [CanvasMarcher, CanvasMarcher];
        const selection = new fabric.ActiveSelection([a, b], { canvas });
        canvas.setActiveObject(selection);
        // Inside a selection, positions are relative to it
        const before = [a.left, a.top, b.left, b.top];
        holdOnCanvas(canvas, selection);
        canvas.renderMarcherPositions(positions, 3);
        expect([a.left, a.top, b.left, b.top]).toEqual(before);
        expect(a.coordinate).toMatchObject({ x: 101, y: 200 });
    });
});
