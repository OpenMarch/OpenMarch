import { describe, expect, it, vi } from "vitest";
import { fabric } from "fabric";
import {
    cacheAtViewportResolution,
    cacheFitsAtFullResolution,
} from "../viewportRasterCache";

/** A canvas with one uncached rect whose drawing we count. */
const setup = () => {
    const el = document.createElement("canvas");
    const canvas = new fabric.StaticCanvas(el, {
        width: 200,
        height: 100,
        renderOnAddRemove: false,
    });
    const rect = new fabric.Rect({
        left: 10,
        top: 10,
        width: 50,
        height: 20,
        fill: "red",
        objectCaching: false,
    });
    const draws = vi.spyOn(rect, "drawObject");
    cacheAtViewportResolution(rect, canvas);
    canvas.add(rect);
    return { canvas, rect, draws };
};

const pixel = (canvas: fabric.StaticCanvas, x: number, y: number) =>
    Array.from(
        canvas.getContext().getImageData(x, y, 1, 1).data as Uint8ClampedArray,
    );

describe("cacheAtViewportResolution", () => {
    it("draws the object once while the viewport stays put", () => {
        const { canvas, draws } = setup();
        canvas.renderAll();
        canvas.renderAll();
        canvas.renderAll();
        expect(draws).toHaveBeenCalledTimes(1);
        expect(pixel(canvas, 30, 20)).toEqual([255, 0, 0, 255]);
        expect(pixel(canvas, 150, 80)[3]).toBe(0);
    });

    it("redraws after a zoom or pan, at the new position", () => {
        const { canvas, draws } = setup();
        canvas.renderAll();
        canvas.setZoom(2);
        canvas.renderAll();
        expect(draws).toHaveBeenCalledTimes(2);
        // the rect now covers 20..120 x 20..60
        expect(pixel(canvas, 100, 50)).toEqual([255, 0, 0, 255]);
        canvas.relativePan(new fabric.Point(-15, 0));
        canvas.renderAll();
        expect(draws).toHaveBeenCalledTimes(3);
        expect(pixel(canvas, 110, 50)[3]).toBe(0);
        expect(pixel(canvas, 100, 50)).toEqual([255, 0, 0, 255]);
    });

    it("redraws when the object changes", () => {
        const { canvas, rect, draws } = setup();
        canvas.renderAll();
        rect.set({ fill: "blue" });
        canvas.renderAll();
        expect(draws).toHaveBeenCalledTimes(2);
        expect(pixel(canvas, 30, 20)).toEqual([0, 0, 255, 255]);
    });

    it("leaves Fabric's own cache and other contexts alone", () => {
        const { canvas, rect, draws } = setup();
        rect.objectCaching = true;
        canvas.renderAll();
        canvas.renderAll();
        // Fabric's cache draws once too, but through its own cache canvas
        expect(draws).toHaveBeenCalledTimes(1);
        rect.objectCaching = false;
        draws.mockClear();
        const other = document.createElement("canvas").getContext("2d")!;
        rect.render(other);
        rect.render(other);
        expect(draws).toHaveBeenCalledTimes(2);
    });
});

describe("cacheAtViewportResolution, visibility and opacity", () => {
    it("draws nothing once the object is hidden after a render", () => {
        const { canvas, rect } = setup();
        canvas.renderAll();
        expect(pixel(canvas, 30, 20)).toEqual([255, 0, 0, 255]);
        // The video export shows the grid for one render, then hides it for every frame
        rect.visible = false;
        canvas.renderAll();
        expect(pixel(canvas, 30, 20)[3]).toBe(0);
    });

    it("follows an opacity change made after a render", () => {
        const { canvas, rect } = setup();
        canvas.renderAll();
        rect.opacity = 0.5;
        canvas.renderAll();
        const alpha = pixel(canvas, 30, 20)[3];
        expect(alpha).toBeGreaterThan(100);
        expect(alpha).toBeLessThan(155);
        rect.opacity = 1;
        canvas.renderAll();
        expect(pixel(canvas, 30, 20)).toEqual([255, 0, 0, 255]);
    });
});

describe("cacheFitsAtFullResolution", () => {
    it("is false once zoom makes an object's cache too big for Fabric's limits", () => {
        const canvas = new fabric.StaticCanvas(
            document.createElement("canvas"),
            { width: 200, height: 100, renderOnAddRemove: false },
        );
        const dot = new fabric.Circle({ radius: 4 });
        const line = new fabric.Line([0, 0, 1000, 0], { stroke: "black" });
        canvas.add(dot, line);
        expect(cacheFitsAtFullResolution(dot)).toBe(true);
        expect(cacheFitsAtFullResolution(line)).toBe(true);
        canvas.setZoom(10);
        expect(cacheFitsAtFullResolution(dot)).toBe(true);
        expect(cacheFitsAtFullResolution(line)).toBe(false);
    });
});
