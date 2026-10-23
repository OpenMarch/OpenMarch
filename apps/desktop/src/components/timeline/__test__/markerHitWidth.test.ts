import { describe, expect, it } from "vitest";
import {
    MARKER_HIT_WIDTH_POINTER,
    MARKER_HIT_WIDTH_TOUCH,
    markerHitWidth,
} from "../audio/markerHitWidth";

describe("markerHitWidth", () => {
    it("is finger-wide in touch mode when beats are far apart", () => {
        expect(markerHitWidth({ gapPx: 200, isTouchMode: true })).toBe(
            MARKER_HIT_WIDTH_TOUCH,
        );
    });

    it("stays modest for the mouse", () => {
        expect(markerHitWidth({ gapPx: 200, isTouchMode: false })).toBe(
            MARKER_HIT_WIDTH_POINTER,
        );
    });

    it("never covers the next line", () => {
        expect(markerHitWidth({ gapPx: 18, isTouchMode: true })).toBe(18);
    });

    it("keeps at least the hover width", () => {
        expect(markerHitWidth({ gapPx: 1, isTouchMode: true })).toBe(4);
    });

    it("falls back to the full width for a missing gap", () => {
        expect(markerHitWidth({ gapPx: 0, isTouchMode: true })).toBe(
            MARKER_HIT_WIDTH_TOUCH,
        );
        expect(markerHitWidth({ gapPx: NaN, isTouchMode: false })).toBe(
            MARKER_HIT_WIDTH_POINTER,
        );
    });
});
