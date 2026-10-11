import { describe, expect, it } from "vitest";
import {
    classifyWheel,
    damp,
    groundHit,
    wheelPixels,
    MARCHER_PICK_HEIGHT,
    MARCHER_PICK_RADIUS,
    pickMarchers,
    zoomAbout,
    zoomRatioLimits,
} from "../inputMath";

describe("classifyWheel", () => {
    it("reads a ctrl wheel as a pinch (how macOS reports a trackpad pinch)", () => {
        expect(
            classifyWheel({
                deltaX: 0,
                deltaY: -3.2,
                deltaMode: 0,
                ctrlKey: true,
            }),
        ).toBe("pinch");
    });

    it("reads a notched wheel as a mouse", () => {
        // Chromium: a notch is deltaY 100 and wheelDeltaY -120
        expect(
            classifyWheel({
                deltaX: 0,
                deltaY: 100,
                deltaMode: 0,
                ctrlKey: false,
                wheelDeltaY: -120,
            }),
        ).toBe("mouse");
        expect(
            classifyWheel({
                deltaX: 0,
                deltaY: 3,
                deltaMode: 1,
                ctrlKey: false,
            }),
        ).toBe("mouse");
    });

    it("reads fine-grained two-finger scrolls as a trackpad", () => {
        expect(
            classifyWheel({
                deltaX: 0,
                deltaY: 4,
                deltaMode: 0,
                ctrlKey: false,
                wheelDeltaY: -12,
            }),
        ).toBe("trackpad");
        expect(
            classifyWheel({
                deltaX: 6,
                deltaY: 0,
                deltaMode: 0,
                ctrlKey: false,
            }),
        ).toBe("trackpad");
        expect(
            classifyWheel({
                deltaX: 0,
                deltaY: 2.5,
                deltaMode: 0,
                ctrlKey: false,
            }),
        ).toBe("trackpad");
    });
});

describe("wheelPixels", () => {
    it("converts lines and pages to pixels", () => {
        expect(wheelPixels(3, 1)).toBe(48);
        expect(wheelPixels(1, 2)).toBe(400);
        expect(wheelPixels(-7, 0)).toBe(-7);
    });
});

describe("groundHit", () => {
    it("finds where a downward ray meets the ground", () => {
        const hit = groundHit([0, 10, 10], [0, -1, -1]);
        expect(hit).not.toBeNull();
        expect(hit![0]).toBeCloseTo(0, 9);
        expect(hit![1]).toBeCloseTo(0, 9);
        expect(hit![2]).toBeCloseTo(0, 9);
    });

    it("misses a ray at or above the horizon, and one that lands absurdly far", () => {
        expect(groundHit([0, 10, 0], [0, 0.1, -1])).toBeNull();
        expect(groundHit([0, 10, 0], [0, 0, -1])).toBeNull();
        expect(groundHit([0, 10, 0], [0, -0.0001, -1])).toBeNull(); // 100 km away
    });
});

describe("damp", () => {
    it("halves over one half-life whatever the frame rate", () => {
        expect(damp(8, 100, 100)).toBeCloseTo(4, 9);
        let v = 8;
        for (let i = 0; i < 10; i++) v = damp(v, 10, 100);
        expect(v).toBeCloseTo(4, 9);
    });
});

describe("picking marchers under the cursor", () => {
    // two marchers on the field, the second hidden
    const xz = new Float32Array([0, 0, 5, 0]);
    const placed = new Uint8Array([1, 0]);

    it("hits a marcher's body along the ray, nearest first", () => {
        const t = pickMarchers([0, 1, 10], [0, 0, -1], xz, placed, 2);
        expect(t).not.toBeNull();
        expect(t!).toBeCloseTo(10 - MARCHER_PICK_RADIUS, 6);
    });

    it("hits the top of the head from above", () => {
        const t = pickMarchers([0, 10, 0], [0, -1, 0], xz, placed, 2);
        expect(t!).toBeCloseTo(10 - MARCHER_PICK_HEIGHT, 6);
    });

    it("misses rays that pass beside, above, or only hit hidden marchers", () => {
        expect(pickMarchers([1, 1, 10], [0, 0, -1], xz, placed, 2)).toBeNull();
        expect(
            pickMarchers([0, 2.5, 10], [0, 0, -1], xz, placed, 2),
        ).toBeNull();
        expect(pickMarchers([5, 1, 10], [0, 0, -1], xz, placed, 2)).toBeNull();
    });
});

describe("scaling the view about a point", () => {
    it("moves the camera and the target toward the point by the same ratio", () => {
        const { position, target } = zoomAbout(
            [0, 10, 10],
            [0, 0, 0],
            [4, 2, 0],
            0.5,
        );
        expect(position).toEqual([2, 6, 5]);
        expect(target).toEqual([2, 1, 0]);
    });

    it("limits the ratio by the closest distance, the eye height and the farthest radius", () => {
        const limits = { minDistance: 0.3, minEyeY: 0.5, maxRadius: 100 };
        // 10 m from the point: no closer than 0.3 m
        expect(
            zoomRatioLimits([0, 10, 0], [0, 0, 0], [0, 0, 0], limits)[0],
        ).toBeCloseTo(0.05, 6);
        // a low camera over a ground point: the eye stops at 0.5 m
        expect(
            zoomRatioLimits([0, 2, 30], [0, 0, 0], [0, 0, -20], limits)[0],
        ).toBeCloseTo(0.25, 6);
        // 50 m out: at most twice as far
        expect(
            zoomRatioLimits([0, 0, 50], [0, 0, 0], [0, 0, 0], limits)[1],
        ).toBeCloseTo(2, 6);
    });
});
