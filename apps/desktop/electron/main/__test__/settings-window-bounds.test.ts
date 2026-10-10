import { describe, expect, it } from "vitest";
import { defaultSettingsSize, fitBounds } from "../settings-window-bounds";

const display = { x: 0, y: 0, width: 1440, height: 900 };
const fallback = { x: 340, y: 170, width: 760, height: 560 };

describe("fitBounds", () => {
    it("uses saved bounds that are on a connected display", () => {
        const saved = { x: 100, y: 100, width: 800, height: 600 };
        expect(fitBounds(saved, [display], fallback)).toEqual(saved);
    });

    it("falls back when saved bounds are on a display that's gone", () => {
        const saved = { x: 2000, y: 100, width: 800, height: 600 };
        expect(fitBounds(saved, [display], fallback)).toEqual(fallback);
    });

    it("falls back when nothing was saved", () => {
        expect(fitBounds(undefined, [display], fallback)).toEqual(fallback);
    });

    it("never returns less than the minimum size", () => {
        const saved = { x: 0, y: 0, width: 200, height: 100 };
        expect(fitBounds(saved, [display], fallback)).toMatchObject({
            width: 640,
            height: 420,
        });
    });
});

describe("defaultSettingsSize", () => {
    it("scales with a large screen but stays within a readable maximum", () => {
        expect(
            defaultSettingsSize({ x: 0, y: 0, width: 3008, height: 1692 }),
        ).toEqual({ width: 1200, height: 900 });
    });

    it("uses a share of a laptop screen", () => {
        expect(
            defaultSettingsSize({ x: 0, y: 0, width: 1512, height: 944 }),
        ).toEqual({ width: 907, height: 661 });
    });

    it("never goes below the default on a small screen", () => {
        expect(
            defaultSettingsSize({ x: 0, y: 0, width: 1024, height: 700 }),
        ).toEqual({ width: 760, height: 560 });
    });

    it("never exceeds the screen", () => {
        expect(
            defaultSettingsSize({ x: 0, y: 0, width: 700, height: 500 }),
        ).toEqual({ width: 700, height: 500 });
    });
});
