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
    loadPowerPrefs,
    nextFrameDelay,
    noteFrame,
    parsePowerPrefs,
    savePowerPrefs,
    wake,
} from "../drawPolicy";

const prefs = { pauseWhenIdle: true, saveOnBattery: true };

describe("nextFrameDelay", () => {
    it("draws every frame while something moves", () => {
        const s = createDrawState();
        expect(
            nextFrameDelay(s, 1000, { moving: true, onBattery: false, prefs }),
        ).toBe(0);
    });

    it("sleeps once nothing moves and the wake window has passed", () => {
        const s = createDrawState();
        wake(s, 0, 500);
        expect(
            nextFrameDelay(s, 400, { moving: false, onBattery: false, prefs }),
        ).toBe(0);
        expect(
            nextFrameDelay(s, 600, { moving: false, onBattery: false, prefs }),
        ).toBeNull();
    });

    it("never sleeps when pausing is turned off", () => {
        const s = createDrawState();
        expect(
            nextFrameDelay(s, 10_000, {
                moving: false,
                onBattery: false,
                prefs: { ...prefs, pauseWhenIdle: false },
            }),
        ).toBe(0);
    });

    it("caps the frame rate on battery by waiting out the rest of the frame", () => {
        const s = createDrawState();
        noteFrame(s, 1000);
        const d = nextFrameDelay(s, 1010, {
            moving: true,
            onBattery: true,
            prefs,
        })!;
        expect(d).toBeCloseTo(1000 / BATTERY_FPS - 10 - FRAME_SLACK_MS, 6);
        expect(
            nextFrameDelay(s, 1050, { moving: true, onBattery: true, prefs }),
        ).toBe(0);
    });

    it("names the cap as on only on battery with saving power on", () => {
        expect(frameCapped(true, prefs)).toBe(true);
        expect(frameCapped(false, prefs)).toBe(false);
        expect(frameCapped(true, { ...prefs, saveOnBattery: false })).toBe(
            false,
        );
    });

    it("doesn't cap on battery when saving power is turned off", () => {
        const s = createDrawState();
        noteFrame(s, 1000);
        expect(
            nextFrameDelay(s, 1010, {
                moving: true,
                onBattery: true,
                prefs: { ...prefs, saveOnBattery: false },
            }),
        ).toBe(0);
    });

    it("keeps the longest wake window", () => {
        const s = createDrawState();
        wake(s, 0, 3000);
        wake(s, 100, 200);
        expect(
            nextFrameDelay(s, 2000, { moving: false, onBattery: false, prefs }),
        ).toBe(0);
    });
});

describe("power preferences", () => {
    it("defaults both on and survives garbage", () => {
        expect(parsePowerPrefs(null)).toEqual(prefs);
        expect(parsePowerPrefs("not json")).toEqual(prefs);
        expect(parsePowerPrefs('{"pauseWhenIdle":false}')).toEqual({
            pauseWhenIdle: false,
            saveOnBattery: true,
        });
    });

    it("round-trips through storage, and falls back when storage throws", () => {
        const store = new Map<string, string>();
        const storage = {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, v),
        } as unknown as Storage;
        savePowerPrefs({ pauseWhenIdle: false, saveOnBattery: false }, storage);
        expect(loadPowerPrefs(storage)).toEqual({
            pauseWhenIdle: false,
            saveOnBattery: false,
        });
        const broken = {
            getItem: () => {
                throw new Error("blocked");
            },
        } as unknown as Storage;
        expect(loadPowerPrefs(broken)).toEqual(prefs);
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
