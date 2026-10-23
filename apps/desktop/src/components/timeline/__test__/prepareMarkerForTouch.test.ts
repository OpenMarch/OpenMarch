import { describe, expect, it } from "vitest";
import { prepareMarkerForTouch } from "../audio/EditableTimingMarkersPlugin";
import { MARKER_HIT_WIDTH_TOUCH } from "../audio/markerHitWidth";

describe("prepareMarkerForTouch", () => {
    it("claims touches so dragging a beat doesn't scroll the timeline", () => {
        const marker = document.createElement("div");
        prepareMarkerForTouch(marker, false);
        expect(marker.style.touchAction).toBe("none");
        // Mouse layout keeps the bare line
        expect(marker.children).toHaveLength(0);
    });

    it("adds a finger-wide invisible strip in touch mode", () => {
        const marker = document.createElement("div");
        prepareMarkerForTouch(marker, true);
        const hit = marker.querySelector<HTMLElement>(
            '[part="marker-touch-hit"]',
        );
        expect(hit).not.toBeNull();
        expect(hit!.style.width).toBe(`${MARKER_HIT_WIDTH_TOUCH}px`);
        expect(hit!.style.left).toBe(`${-MARKER_HIT_WIDTH_TOUCH / 2}px`);
        expect(hit!.style.touchAction).toBe("none");
    });

    it("ignores a region without an element", () => {
        expect(() => prepareMarkerForTouch(undefined, true)).not.toThrow();
    });
});
