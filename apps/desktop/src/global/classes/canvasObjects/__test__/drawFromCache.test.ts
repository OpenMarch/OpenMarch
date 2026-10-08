import { describe, expect, it, vi } from "vitest";
import { fabric } from "fabric";
import OpenMarchCanvas from "../OpenMarchCanvas";
import CanvasMarcher from "../CanvasMarcher";
import Midpoint from "../Midpoint";
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

/** A field with marchers, their labels, a cached midpoint and an uncached line */
const setup = () => {
    const canvas = new OpenMarchCanvas({
        canvasRef: null,
        fieldProperties:
            FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES,
        uiSettings: defaultSettings,
    });
    canvas.setDimensions({ width: 400, height: 300 });
    canvas.setViewportTransform([1.5, 0, 0, 1.5, -20, -10]);
    const marchers = [1, 2, 3, 4].map(
        (id) =>
            new CanvasMarcher({
                marcher: marcher(id),
                coordinate: { x: id * 37.3, y: 40 + id * 11.7 },
            }),
    );
    for (const m of marchers) {
        canvas.add(m);
        canvas.add(m.textLabel);
    }
    const line = new fabric.Line([10, 10, 200, 150], {
        stroke: "green",
        strokeWidth: 3,
        objectCaching: false,
    });
    canvas.add(line);
    // A cached object that is not a marcher; also drawn from its cache
    const midpoint = new Midpoint({
        marcherId: 1,
        start: { x: 50, y: 50 },
        end: { x: 150, y: 130 },
        innerColor: "red",
        outerColor: "blue",
    });
    canvas.add(midpoint);
    canvas.sendCanvasMarchersToFront();
    return { canvas, marchers, line, midpoint };
};

const pixels = (canvas: OpenMarchCanvas) => {
    const el = canvas.getElement();
    return Array.from(
        el.getContext("2d")!.getImageData(0, 0, el.width, el.height)
            .data as Uint8ClampedArray,
    );
};

/** renderAll's picture, then the playback frame's picture (twice: record, then reuse) */
const compare = (canvas: OpenMarchCanvas) => {
    canvas.renderAll();
    const expected = pixels(canvas);
    canvas.renderPlaybackFrame();
    canvas.renderPlaybackFrame();
    const actual = pixels(canvas);
    let differing = 0;
    for (let i = 0; i < expected.length; i++)
        if (expected[i] !== actual[i]) differing++;
    return { differing, nonEmpty: expected.some((v) => v !== 0) };
};

describe("OpenMarchCanvas.renderPlaybackFrame", () => {
    it("draws the same picture as renderAll", () => {
        const { canvas } = setup();
        const { differing, nonEmpty } = compare(canvas);
        expect(nonEmpty).toBe(true);
        expect(differing).toBe(0);
    });

    it("skips Fabric's render for marchers and labels once their caches are known", () => {
        const { canvas, marchers } = setup();
        canvas.renderPlaybackFrame();
        // Fabric's render applies the object's transform; spying on render itself would
        // replace Fabric's method and turn the fast path off
        const groupRender = vi.spyOn(marchers[0]!, "transform");
        const labelRender = vi.spyOn(marchers[0]!.textLabel, "transform");
        canvas.renderPlaybackFrame();
        marchers[0]!.setLiveCoordinates({ x: 210.25, y: 99.5 });
        canvas.renderPlaybackFrame();
        expect(groupRender).not.toHaveBeenCalled();
        expect(labelRender).not.toHaveBeenCalled();
    });

    it("matches renderAll after moving marchers", () => {
        const { canvas, marchers } = setup();
        canvas.renderPlaybackFrame();
        marchers.forEach((m, i) =>
            m.setLiveCoordinates({ x: 60 + i * 41.37, y: 120.6 - i * 9.1 }),
        );
        expect(compare(canvas).differing).toBe(0);
    });

    it("redraws a cache that changed: color, dimming, label text, zoom", () => {
        const { canvas, marchers } = setup();
        canvas.renderPlaybackFrame();
        const before = pixels(canvas);

        marchers[1]!.dotObject.set({ fill: "rgb(250, 10, 10)" });
        marchers[2]!.setTimelineDimmed(true);
        marchers[3]!.textLabel.set({ text: "XYZ99" });
        let result = compare(canvas);
        expect(result.differing).toBe(0);
        expect(pixels(canvas)).not.toEqual(before);

        canvas.setViewportTransform([2.25, 0, 0, 2.25, -100, -60]);
        result = compare(canvas);
        expect(result.differing).toBe(0);
    });

    it("shows a cache that a normal render redrew between playback frames", () => {
        const { canvas, marchers } = setup();
        canvas.renderPlaybackFrame();
        canvas.renderPlaybackFrame();
        marchers[0]!.dotObject.set({ fill: "rgb(10, 200, 30)" });
        // Fabric redraws the cache here, so the playback frame finds it clean
        canvas.renderAll();
        const expected = pixels(canvas);
        canvas.renderPlaybackFrame();
        expect(pixels(canvas)).toEqual(expected);
    });

    it("draws every marcher and label from the shared atlas", () => {
        const { canvas, marchers } = setup();
        canvas.renderPlaybackFrame();
        canvas.renderPlaybackFrame();
        for (const m of marchers) {
            expect(
                (m as unknown as { __atlasSlot?: unknown }).__atlasSlot,
            ).toBeTruthy();
            expect(
                (m.textLabel as unknown as { __atlasSlot?: unknown })
                    .__atlasSlot,
            ).toBeTruthy();
        }
    });

    it("draws the same after the atlas is freed and refilled", () => {
        const { canvas, marchers } = setup();
        canvas.renderPlaybackFrame();
        canvas.endPlaybackFrames();
        marchers[2]!.setLiveCoordinates({ x: 77.7, y: 33.3 });
        expect(compare(canvas).differing).toBe(0);
    });

    it("hides what renderAll hides, and culls offscreen objects", () => {
        const { canvas, marchers } = setup();
        canvas.renderPlaybackFrame();
        marchers[0]!.textLabel.set({ visible: false });
        marchers[1]!.setLiveCoordinates({ x: 5000, y: 5000 });
        const render = vi.spyOn(marchers[1]!, "isOnScreen");
        expect(compare(canvas).differing).toBe(0);
        // Only renderAll asked Fabric; the playback frames culled it themselves
        expect(render).toHaveBeenCalledTimes(1);
    });

    it("leaves other renders, such as exports, to Fabric", () => {
        const { canvas, marchers } = setup();
        canvas.renderPlaybackFrame();
        const render = vi.spyOn(marchers[0]!, "transform");
        canvas.renderAll();
        canvas.toDataURL();
        expect(render).toHaveBeenCalledTimes(2);
    });
});

describe("marcher cache size", () => {
    const limits = fabric as unknown as { minCacheSideLimit: number };
    const cache = (obj: fabric.Object) =>
        (obj as unknown as { _cacheCanvas: HTMLCanvasElement })._cacheCanvas;

    it("caches marchers and labels at their own size, not Fabric's 256 px floor", () => {
        const { canvas, marchers, midpoint } = setup();
        canvas.renderAll();
        expect(limits.minCacheSideLimit).toBe(256);
        expect(cache(marchers[0]!).width).toBeLessThan(40);
        expect(cache(marchers[0]!.textLabel).width).toBeLessThan(80);
        // everything else keeps Fabric's sizes
        expect(cache(midpoint).width).toBe(256);
    });

    it("draws the same picture as 256 px caches", () => {
        const { canvas, marchers } = setup();
        canvas.renderAll();
        const tight = pixels(canvas);
        for (const obj of marchers.flatMap((m) => [m, m.textLabel])) {
            const wide = obj as unknown as {
                _limitCacheSize: unknown;
                _removeCacheCanvas(): void;
            };
            wide._limitCacheSize = (
                fabric.Object.prototype as unknown as {
                    _limitCacheSize: unknown;
                }
            )._limitCacheSize;
            wide._removeCacheCanvas();
            obj.dirty = true;
        }
        canvas.renderAll();
        expect(cache(marchers[0]!).width).toBe(256);
        expect(pixels(canvas)).toEqual(tight);
    });
});
