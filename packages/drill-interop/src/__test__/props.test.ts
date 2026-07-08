import { describe, it, expect } from "vitest";
import { isLikelyPropPosition, isLikelyReferenceMarker } from "../props";

const SAMPLE_FIELD = {
    minX: -50,
    minY: -26.25,
    maxX: 50,
    maxY: 26.25,
};

describe("isLikelyReferenceMarker", () => {
    it("flags sideline and endline ticks", () => {
        expect(isLikelyReferenceMarker({ x: 0, y: 26.25 }, SAMPLE_FIELD)).toBe(
            true,
        );
        expect(
            isLikelyReferenceMarker({ x: -20, y: 26.25 }, SAMPLE_FIELD),
        ).toBe(true);
        expect(isLikelyReferenceMarker({ x: -50, y: 0 }, SAMPLE_FIELD)).toBe(
            true,
        );
    });

    it("flags front hash and back arc reference points", () => {
        expect(
            isLikelyReferenceMarker({ x: -3.75, y: 1.25 }, SAMPLE_FIELD),
        ).toBe(true);
        expect(
            isLikelyReferenceMarker({ x: -5.2, y: 25.01 }, SAMPLE_FIELD),
        ).toBe(true);
    });

    it("does not flag interior prop positions", () => {
        expect(
            isLikelyReferenceMarker({ x: 13.31, y: -6.67 }, SAMPLE_FIELD),
        ).toBe(false);
        expect(isLikelyReferenceMarker({ x: -35, y: 8.75 }, SAMPLE_FIELD)).toBe(
            false,
        );
        expect(isLikelyPropPosition({ x: 13.31, y: -6.67 }, SAMPLE_FIELD)).toBe(
            true,
        );
        expect(isLikelyPropPosition({ x: 5, y: 22.5 }, SAMPLE_FIELD)).toBe(
            false,
        );
    });
});
