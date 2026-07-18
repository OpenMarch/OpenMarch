import { describe, expect, it } from "vitest";
import { computePropLiveTransform } from "../CanvasProp";

describe("computePropLiveTransform", () => {
    it("computes scale ratios from base to target and passes rotation through", () => {
        const result = computePropLiveTransform(
            { width: 10, height: 10 },
            { width: 20, height: 30, rotation: 45 },
        );
        expect(result).toEqual({ scaleX: 2, scaleY: 3, angle: 45 });
    });

    it("guards against a zero base dimension (no divide-by-zero)", () => {
        const result = computePropLiveTransform(
            { width: 0, height: 0 },
            { width: 20, height: 30, rotation: 0 },
        );
        expect(result).toEqual({ scaleX: 1, scaleY: 1, angle: 0 });
    });
});
