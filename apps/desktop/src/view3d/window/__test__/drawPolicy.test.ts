import { describe, expect, it } from "vitest";
import {
    BATTERY_FPS,
    FRAME_SLACK_MS,
    frameCapped,
    SHADOW_REFRESH_MS,
    createDrawState,
    createShadowState,
    refreshShadows,
    shadowsNeedUpdate,
    nextFrameDelay,
    noteFrame,
    wake,
} from "../drawPolicy";

describe("nextFrameDelay", () => {
    it("draws every frame while something moves", () => {
        const s = createDrawState();
        expect(
            nextFrameDelay(s, 1000, { moving: true, onBattery: false }),
        ).toBe(0);
    });

    it("sleeps once nothing moves and the wake window has passed", () => {
        const s = createDrawState();
        wake(s, 0, 500);
        expect(
            nextFrameDelay(s, 400, { moving: false, onBattery: false }),
        ).toBe(0);
        expect(
            nextFrameDelay(s, 600, { moving: false, onBattery: false }),
        ).toBeNull();
    });

    it("caps the frame rate on battery by waiting out the rest of the frame", () => {
        const s = createDrawState();
        noteFrame(s, 1000);
        const d = nextFrameDelay(s, 1010, {
            moving: true,
            onBattery: true,
        })!;
        expect(d).toBeCloseTo(1000 / BATTERY_FPS - 10 - FRAME_SLACK_MS, 6);
        expect(nextFrameDelay(s, 1050, { moving: true, onBattery: true })).toBe(
            0,
        );
    });

    it("names the cap as on only on battery", () => {
        expect(frameCapped(true)).toBe(true);
        expect(frameCapped(false)).toBe(false);
    });

    it("keeps the longest wake window", () => {
        const s = createDrawState();
        wake(s, 0, 3000);
        wake(s, 100, 200);
        expect(
            nextFrameDelay(s, 2000, { moving: false, onBattery: false }),
        ).toBe(0);
    });
});

describe("shadow refresh", () => {
    it("redraws shadows only inside the window after a change", () => {
        const s = createShadowState();
        expect(shadowsNeedUpdate(s, 0)).toBe(false);
        refreshShadows(s, 1000, SHADOW_REFRESH_MS);
        expect(shadowsNeedUpdate(s, 1001)).toBe(true);
        expect(shadowsNeedUpdate(s, 1000 + SHADOW_REFRESH_MS + 1)).toBe(false);
    });
});
