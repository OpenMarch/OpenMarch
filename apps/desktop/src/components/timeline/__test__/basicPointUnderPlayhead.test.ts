// @vitest-environment node
import { describe, expect, it } from "vitest";
import { basicPointUnderPlayhead } from "../TimelineBasicLayers";

/**
 * UI-19 Basic: the playhead's button (12 px wide, above the ticks) covers a tick on its count, so
 * its menu offers that tick's Remove this count's position.
 */
describe("basicPointUnderPlayhead", () => {
    const points = [{ beat: 12 }, { beat: 13 }, { beat: 20 }];

    it("finds the tick on the playhead's count", () => {
        expect(basicPointUnderPlayhead(points, 13, 16)).toEqual({ beat: 13 });
    });

    it("finds none when the playhead is a count or more away at a normal zoom", () => {
        expect(basicPointUnderPlayhead(points, 15, 16)).toBeUndefined();
        expect(basicPointUnderPlayhead(undefined, 13, 16)).toBeUndefined();
    });

    it("zoomed far out, takes the nearest tick under the playhead's width", () => {
        // 4 px a beat: beats 12 and 13 are both under a playhead at 13; 13 is nearer
        expect(basicPointUnderPlayhead(points, 13, 4)).toEqual({ beat: 13 });
        expect(basicPointUnderPlayhead(points, 12.4, 4)).toEqual({ beat: 12 });
    });
});
