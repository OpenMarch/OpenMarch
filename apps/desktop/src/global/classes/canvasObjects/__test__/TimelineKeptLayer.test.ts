import { fabric } from "fabric";
import { describe, expect, it, vi } from "vitest";
import OpenMarchCanvas from "../OpenMarchCanvas";
import CanvasMarcher, { DEFAULT_DOT_RADIUS } from "../CanvasMarcher";
import TimelineKeptLayer, { keptMarkBox } from "../TimelineKeptLayer";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type Marcher from "@/global/classes/Marcher";
import { defaultSettings } from "@/stores/UiSettingsStore";

/**
 * UI-18 kept marchers on the field (wp20): the broken chain beside a kept marcher's dot. It sits
 * right of the dot and stays between 10 and 16 screen pixels at any zoom; the canvas draws one
 * layer above the marchers, follows the dots where they are, and removes it with no marks.
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

const setup = () => {
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
                coordinate: { x: id * 40, y: 80 },
            }),
    );
    for (const m of marchers) {
        canvas.add(m);
        canvas.add(m.textLabel);
    }
    return { canvas, marchers };
};

const layersOf = (canvas: OpenMarchCanvas) =>
    canvas.getObjects().filter((o) => o instanceof TimelineKeptLayer);

describe("keptMarkBox", () => {
    it("sits just right of the dot, a little below its center", () => {
        const box = keptMarkBox({ x: 100, y: 50 }, 1);
        expect(box.x).toBeGreaterThan(100 + DEFAULT_DOT_RADIUS);
        expect(box.x).toBeLessThan(100 + DEFAULT_DOT_RADIUS + 3);
        const centerY = box.y + box.size / 2;
        expect(centerY).toBeGreaterThan(50);
        // the drill number sits above the dot; the mark's top stays below the dot's top
        expect(box.y).toBeGreaterThan(50 - DEFAULT_DOT_RADIUS * 2.2);
    });

    it.each([
        [0.25, 10],
        [0.5, 10],
        [1, 12],
        [1.25, 15],
        [2.61, 16],
        [8, 16],
    ])("at zoom %s is %s screen pixels", (zoom, screen) => {
        const box = keptMarkBox({ x: 0, y: 0 }, zoom);
        expect(box.size * zoom).toBeCloseTo(screen, 9);
    });
});

describe("OpenMarchCanvas.renderTimelineKeptMarks", () => {
    it("draws one layer above the marchers, and none without marks", () => {
        const { canvas } = setup();
        canvas.renderTimelineKeptMarks([
            { marcherId: 1, text: "Kept on Page 3 · won't follow Page 2" },
        ]);
        expect(layersOf(canvas)).toHaveLength(1);
        const objects = canvas.getObjects();
        expect(objects[objects.length - 1]).toBe(canvas.timelineKeptLayer);

        canvas.renderTimelineKeptMarks([
            { marcherId: 1, text: "a" },
            { marcherId: 3, text: "b" },
        ]);
        expect(layersOf(canvas)).toHaveLength(1);
        expect(canvas.timelineKeptLayer!.marks.map((m) => m.marcherId)).toEqual(
            [1, 3],
        );

        canvas.renderTimelineKeptMarks([]);
        expect(layersOf(canvas)).toHaveLength(0);
        expect(canvas.timelineKeptLayer).toBeNull();
    });

    it("stays above the marchers when they're raised", () => {
        const { canvas } = setup();
        canvas.renderTimelineKeptMarks([{ marcherId: 2, text: "b" }]);
        canvas.sendCanvasMarchersToFront();
        const objects = canvas.getObjects();
        expect(objects[objects.length - 1]).toBe(canvas.timelineKeptLayer);
    });

    it("stays above the marchers after refreshMarchers, and is never culled offscreen (pre-merge review C2)", () => {
        const { canvas } = setup();
        canvas.renderTimelineKeptMarks([{ marcherId: 2, text: "b" }]);
        canvas.refreshMarchers();
        const objects = canvas.getObjects();
        expect(objects[objects.length - 1]).toBe(canvas.timelineKeptLayer);
        // Panned far from the layer's own box, its marks still draw
        canvas.absolutePan(new fabric.Point(100000, 100000));
        expect(canvas.timelineKeptLayer!.isOnScreen()).toBe(true);
    });

    it("marks only the kept marchers' dots, where they are now", () => {
        const { canvas, marchers } = setup();
        canvas.renderTimelineKeptMarks([{ marcherId: 2, text: "kept" }]);
        const layer = canvas.timelineKeptLayer!;
        const boxes = layer.boxes();
        expect(boxes).toHaveLength(1);
        const dot = marchers[1]!.getAbsoluteCoords();
        expect(boxes[0]!.box).toEqual(keptMarkBox(dot, canvas.getZoom()));

        // on the mark, or on its dot
        const { box } = boxes[0]!;
        const mid = box.size / 2;
        expect(layer.markAt(box.x + mid, box.y + mid)?.text).toBe("kept");
        expect(layer.markAt(dot.x, dot.y)?.text).toBe("kept");
        // not on another marcher
        const other = marchers[0]!.getAbsoluteCoords();
        expect(layer.markAt(other.x, other.y)).toBeNull();

        // a drag moves the dot; the mark follows without a rebuild
        marchers[1]!.setMarcherCoords({ x: 300, y: 200 });
        const moved = marchers[1]!.getAbsoluteCoords();
        expect(layer.boxes()[0]!.box).toEqual(
            keptMarkBox(moved, canvas.getZoom()),
        );
    });

    it("leaves out hidden marchers and marchers no longer on the canvas", () => {
        const { canvas, marchers } = setup();
        canvas.renderTimelineKeptMarks([
            { marcherId: 1, text: "a" },
            { marcherId: 2, text: "b" },
            { marcherId: 99, text: "gone" },
        ]);
        marchers[0]!.set({ visible: false });
        expect(
            canvas.timelineKeptLayer!.boxes().map((b) => b.mark.marcherId),
        ).toEqual([2]);
    });

    it("draws a backing for each mark, and nothing without marks", () => {
        const { canvas } = setup();
        canvas.renderTimelineKeptMarks([
            { marcherId: 1, text: "a" },
            { marcherId: 2, text: "b" },
        ]);
        const layer = canvas.timelineKeptLayer!;
        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            translate: vi.fn(),
            scale: vi.fn(),
            beginPath: vi.fn(),
            roundRect: vi.fn(),
            rect: vi.fn(),
            fill: vi.fn(),
            stroke: vi.fn(),
        };
        layer._render(ctx as unknown as CanvasRenderingContext2D);
        expect(ctx.roundRect).toHaveBeenCalledTimes(2);
        ctx.roundRect.mockClear();
        layer.update([]);
        layer._render(ctx as unknown as CanvasRenderingContext2D);
        expect(ctx.roundRect).not.toHaveBeenCalled();
    });
});
