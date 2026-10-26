import { describe, expect, it } from "vitest";
import {
    markerHitWidthCss,
    prepareMarkerForTouch,
    PX_PER_SEC_CSS_VAR,
} from "../audio/EditableTimingMarkersPlugin";
import { MARKER_HIT_WIDTH_TOUCH } from "../audio/markerHitWidth";

describe("prepareMarkerForTouch", () => {
    it("claims touches so dragging a beat doesn't scroll the timeline", () => {
        const marker = document.createElement("div");
        prepareMarkerForTouch(marker, false);
        expect(marker.style.touchAction).toBe("none");
        // Mouse layout keeps the bare line
        expect(marker.children).toHaveLength(0);
    });

    it("adds an invisible strip centered on the line in touch mode", () => {
        const marker = document.createElement("div");
        prepareMarkerForTouch(marker, true, { before: 0.5, after: 0.25 });
        const hit = marker.querySelector<HTMLElement>(
            '[part="marker-touch-hit"]',
        );
        expect(hit).not.toBeNull();
        expect(hit!.style.transform).toBe("translateX(-50%)");
        expect(hit!.style.touchAction).toBe("none");
    });

    it("ignores a region without an element", () => {
        expect(() => prepareMarkerForTouch(undefined, true)).not.toThrow();
    });
});

describe("markerHitWidthCss", () => {
    it("sizes the strip from the smaller of the gaps to both neighbors", () => {
        const css = markerHitWidthCss({ before: 0.5, after: 0.25 });
        expect(css).toContain(`var(${PX_PER_SEC_CSS_VAR}`);
        expect(css).toContain("* 0.25 *");
        expect(css).toContain(`${MARKER_HIT_WIDTH_TOUCH}px)`);
        expect(markerHitWidthCss({ before: 0.1, after: 0.5 })).toContain(
            "* 0.1 *",
        );
    });

    it("is the full width without neighbors", () => {
        expect(markerHitWidthCss({ before: Infinity, after: 0 })).toBe(
            `${MARKER_HIT_WIDTH_TOUCH}px`,
        );
    });
});
