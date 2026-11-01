// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    limitingGap,
    MARKER_HIT_WIDTH_POINTER,
    MARKER_HIT_WIDTH_TOUCH,
    markerHitWidth,
} from "../audio/markerHitWidth";

describe("markerHitWidth", () => {
    const wide = { gapBeforePx: 200, gapAfterPx: 200 };

    it("is finger-wide in touch mode when beats are far apart", () => {
        expect(markerHitWidth({ ...wide, isTouchMode: true })).toBe(
            MARKER_HIT_WIDTH_TOUCH,
        );
    });

    it("stays modest for the mouse", () => {
        expect(markerHitWidth({ ...wide, isTouchMode: false })).toBe(
            MARKER_HIT_WIDTH_POINTER,
        );
    });

    it("never covers the next line", () => {
        expect(
            markerHitWidth({
                gapBeforePx: 200,
                gapAfterPx: 18,
                isTouchMode: true,
            }),
        ).toBe(18);
    });

    it("never covers the previous line either", () => {
        expect(
            markerHitWidth({
                gapBeforePx: 12,
                gapAfterPx: 200,
                isTouchMode: true,
            }),
        ).toBe(12);
    });

    it("so neighbors' strips never overlap", () => {
        // Lines at 0, 20 and 30 px: each strip is centered on its line
        const lines = [0, 20, 30];
        const strips = lines.map((x, i) => {
            const w = markerHitWidth({
                gapBeforePx: i > 0 ? x - lines[i - 1] : 0,
                gapAfterPx: i < lines.length - 1 ? lines[i + 1] - x : 0,
                isTouchMode: true,
            });
            return [x - w / 2, x + w / 2];
        });
        for (let i = 1; i < strips.length; i++)
            expect(strips[i][0]).toBeGreaterThanOrEqual(strips[i - 1][1]);
    });

    it("keeps at least the hover width", () => {
        expect(
            markerHitWidth({
                gapBeforePx: 1,
                gapAfterPx: 1,
                isTouchMode: true,
            }),
        ).toBe(4);
    });

    it("falls back to the full width for missing gaps (first or last line)", () => {
        expect(
            markerHitWidth({
                gapBeforePx: 0,
                gapAfterPx: 0,
                isTouchMode: true,
            }),
        ).toBe(MARKER_HIT_WIDTH_TOUCH);
        expect(
            markerHitWidth({
                gapBeforePx: NaN,
                gapAfterPx: NaN,
                isTouchMode: false,
            }),
        ).toBe(MARKER_HIT_WIDTH_POINTER);
    });

    it("limitingGap ignores missing gaps", () => {
        expect(limitingGap(0, 25)).toBe(25);
        expect(limitingGap(Infinity, NaN)).toBe(Infinity);
    });
});
