import { describe, expect, it } from "vitest";
import {
    canvasWindowCovers,
    getBeatsInSpan,
    getCanvasWindow,
    TIMELINE_CANVAS_ALIGN_PX,
} from "../TimelineGeometry";

/** Chromium's largest canvas side, in device pixels */
const CHROMIUM_MAX_CANVAS_SIDE = 65_535;

describe("timeline canvas window", () => {
    it("draws a layer no wider than the viewport plus overscan whole, from 0", () => {
        expect(
            getCanvasWindow({
                layerWidth: 1234.5,
                visibleLeft: 0,
                visibleWidth: 1200,
                overscan: 600,
            }),
        ).toEqual({ left: 0, width: 1234.5 });
    });

    it("covers the viewport and the overscan either side, on aligned pixels", () => {
        const visible = {
            layerWidth: 64_000,
            visibleLeft: 30_003,
            visibleWidth: 1201,
        };
        const span = getCanvasWindow({ ...visible, overscan: 600 });
        expect(span.left % TIMELINE_CANVAS_ALIGN_PX).toBe(0);
        expect(span.left).toBeLessThanOrEqual(30_003 - 600);
        expect(span.left + span.width).toBeGreaterThanOrEqual(
            30_003 + 1201 + 600,
        );
        // No more than the viewport, the overscan and one alignment step each side
        expect(span.width).toBeLessThanOrEqual(
            1201 + 1200 + 2 * TIMELINE_CANVAS_ALIGN_PX,
        );
        expect(canvasWindowCovers(span, visible)).toBe(true);
    });

    it("stays inside the layer at either end", () => {
        const start = getCanvasWindow({
            layerWidth: 10_000,
            visibleLeft: -50,
            visibleWidth: 1000,
            overscan: 500,
        });
        expect(start.left).toBe(0);
        expect(start.width).toBeGreaterThanOrEqual(2000);

        const end = getCanvasWindow({
            layerWidth: 10_000.25,
            visibleLeft: 9000.25,
            visibleWidth: 1000,
            overscan: 500,
        });
        expect(end.left % TIMELINE_CANVAS_ALIGN_PX).toBe(0);
        // Never past the layer, so the canvas never widens the scroll area
        expect(end.left + end.width).toBe(10_000.25);
        expect(end.left).toBeLessThanOrEqual(9000.25 - 500);
    });

    it("keeps a deep zoom on a long show under Chromium's largest canvas", () => {
        // 1000 beats at 64px a beat, at a device pixel ratio of 2: the whole layer would be
        // 128,000 device pixels wide, which Chromium can't draw
        const layerWidth = 1000 * 64;
        expect(layerWidth * 2).toBeGreaterThan(CHROMIUM_MAX_CANVAS_SIDE);
        for (const visibleLeft of [0, layerWidth / 2, layerWidth - 1600]) {
            const span = getCanvasWindow({
                layerWidth,
                visibleLeft,
                visibleWidth: 1600,
                overscan: 800,
            });
            expect(span.width * 2).toBeLessThan(CHROMIUM_MAX_CANVAS_SIDE);
        }
    });

    it("needs a redraw only once the viewport leaves the drawn window", () => {
        const layerWidth = 20_000;
        const drawn = getCanvasWindow({
            layerWidth,
            visibleLeft: 5000,
            visibleWidth: 1000,
            overscan: 500,
        });
        const at = (visibleLeft: number) =>
            canvasWindowCovers(drawn, {
                layerWidth,
                visibleLeft,
                visibleWidth: 1000,
            });
        expect(at(5000)).toBe(true);
        expect(at(4600)).toBe(true);
        expect(at(5400)).toBe(true);
        expect(at(drawn.left - 1)).toBe(false);
        expect(at(drawn.left + drawn.width - 999)).toBe(false);
    });

    it("counts a viewport past the layer's end as covered by a window reaching it", () => {
        const drawn = { left: 8000, width: 2000 };
        expect(
            canvasWindowCovers(drawn, {
                layerWidth: 10_000,
                visibleLeft: 9500,
                visibleWidth: 1000,
            }),
        ).toBe(true);
    });

    it("finds the beats whose lines can fall in a span", () => {
        expect(getBeatsInSpan({ left: 0, width: 100 }, 16, 1000)).toEqual({
            first: 0,
            last: 7,
        });
        const middle = getBeatsInSpan({ left: 1600, width: 320 }, 16, 1000);
        expect(middle.first).toBeLessThanOrEqual(100);
        expect(middle.last).toBeGreaterThanOrEqual(120);
        expect(middle.last - middle.first).toBeLessThanOrEqual(23);
        // Clamped to the show's last beat
        expect(
            getBeatsInSpan({ left: 15_900, width: 400 }, 16, 1000).last,
        ).toBe(1000);
    });

    it("draws every beat a whole-layer span would at a fractional zoom", () => {
        const pixelsPerBeat = 1.237;
        const width = 1000 * pixelsPerBeat;
        const lastBeat = Math.floor(width / pixelsPerBeat);
        const xs = (span: { left: number; width: number }) => {
            const { first, last } = getBeatsInSpan(
                span,
                pixelsPerBeat,
                lastBeat,
            );
            const out: number[] = [];
            for (let beat = first; beat <= last; beat++) {
                const x = Math.round(beat * pixelsPerBeat);
                if (x + 1 >= span.left && x <= span.left + span.width)
                    out.push(beat);
            }
            return out;
        };
        const whole = xs({ left: 0, width });
        expect(whole).toHaveLength(lastBeat + 1);
        // Two adjoining windows together draw every beat
        const split = new Set([
            ...xs({ left: 0, width: 600 }),
            ...xs({ left: 600, width: width - 600 }),
        ]);
        expect([...split].sort((a, b) => a - b)).toEqual(whole);
    });
});
