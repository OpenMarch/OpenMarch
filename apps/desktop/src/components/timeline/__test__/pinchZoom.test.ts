import { describe, expect, it } from "vitest";
import {
    clampPixelsPerSecond,
    pinchZoomStep,
    pointDistance,
    timeAtPoint,
    TIMELINE_MAX_PX_PER_SEC,
    TIMELINE_MIN_PX_PER_SEC,
} from "../pinchZoom";

describe("timeAtPoint", () => {
    it("reads the time under a point from scroll, origin and zoom", () => {
        // origin at 100px, scrolled 300px, point 50px in => content x 350
        expect(
            timeAtPoint({
                scrollLeft: 300,
                pointX: 50,
                originX: 100,
                pixelsPerSecond: 50,
            }),
        ).toBe(5);
    });

    it("is 0 for a non-positive zoom", () => {
        expect(
            timeAtPoint({
                scrollLeft: 10,
                pointX: 10,
                originX: 0,
                pixelsPerSecond: 0,
            }),
        ).toBe(0);
    });
});

describe("pinchZoomStep", () => {
    const originX = 112;
    const start = { distance: 100, pixelsPerSecond: 40, anchorTime: 10 };

    it("scales the zoom with the finger spread", () => {
        const step = pinchZoomStep({
            start,
            distance: 200,
            pointX: 300,
            originX,
        });
        expect(step.pixelsPerSecond).toBe(80);
    });

    it("keeps the anchored time under the midpoint", () => {
        for (const distance of [60, 100, 150, 220]) {
            const step = pinchZoomStep({
                start,
                distance,
                pointX: 300,
                originX,
            });
            expect(
                timeAtPoint({
                    scrollLeft: step.scrollLeft,
                    pointX: 300,
                    originX,
                    pixelsPerSecond: step.pixelsPerSecond,
                }),
            ).toBeCloseTo(start.anchorTime);
        }
    });

    it("pans when both fingers move together without spreading", () => {
        const still = pinchZoomStep({
            start,
            distance: 100,
            pointX: 300,
            originX,
        });
        const moved = pinchZoomStep({
            start,
            distance: 100,
            pointX: 250,
            originX,
        });
        expect(moved.pixelsPerSecond).toBe(40);
        expect(moved.scrollLeft - still.scrollLeft).toBe(50);
    });

    it("round-trips: a start read from the view leaves the view unchanged", () => {
        const scrollLeft = 640;
        const pointX = 220;
        const anchorTime = timeAtPoint({
            scrollLeft,
            pointX,
            originX,
            pixelsPerSecond: 40,
        });
        const step = pinchZoomStep({
            start: { distance: 90, pixelsPerSecond: 40, anchorTime },
            distance: 90,
            pointX,
            originX,
        });
        expect(step.scrollLeft).toBeCloseTo(scrollLeft);
    });

    it("clamps the zoom to the timeline limits", () => {
        expect(
            pinchZoomStep({ start, distance: 10_000, pointX: 0, originX })
                .pixelsPerSecond,
        ).toBe(TIMELINE_MAX_PX_PER_SEC);
        expect(
            pinchZoomStep({ start, distance: 1, pointX: 0, originX })
                .pixelsPerSecond,
        ).toBe(TIMELINE_MIN_PX_PER_SEC);
    });

    it("never scrolls before the start", () => {
        const step = pinchZoomStep({
            start: { ...start, anchorTime: 0 },
            distance: 50,
            pointX: 500,
            originX,
        });
        expect(step.scrollLeft).toBe(0);
    });

    it("keeps the zoom when the start distance is 0", () => {
        expect(
            pinchZoomStep({
                start: { ...start, distance: 0 },
                distance: 80,
                pointX: 0,
                originX,
            }).pixelsPerSecond,
        ).toBe(40);
    });
});

describe("helpers", () => {
    it("pointDistance", () => {
        expect(pointDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    });
    it("clampPixelsPerSecond", () => {
        expect(clampPixelsPerSecond(5)).toBe(TIMELINE_MIN_PX_PER_SEC);
        expect(clampPixelsPerSecond(500)).toBe(TIMELINE_MAX_PX_PER_SEC);
        expect(clampPixelsPerSecond(55)).toBe(55);
    });
});
