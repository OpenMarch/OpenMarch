import { describe, expect, it } from "vitest";
import {
    getLightingEffectProgress,
    getLightingEffectProgressAtShowTime,
    getLightingEffectProgressFromBeatWindow,
    resolveLightingEffectWindowMs,
    type LightingBeatTiming,
} from "../timing";

const beats: LightingBeatTiming[] = [
    { position: 0, duration: 0.5 },
    { position: 1, duration: 1.0 },
    { position: 2, duration: 0.5 },
    { position: 3, duration: 1.0 },
];

describe("getLightingEffectProgress", () => {
    const window = { startMs: 1000, durationMs: 2000 };

    it("returns 0 before start", () => {
        expect(getLightingEffectProgress(500, window)).toBe(0);
    });

    it("returns 0 at start", () => {
        expect(getLightingEffectProgress(1000, window)).toBe(0);
    });

    it("returns fractional progress mid-effect", () => {
        expect(getLightingEffectProgress(1500, window)).toBe(0.25);
    });

    it("returns 1 at end", () => {
        expect(getLightingEffectProgress(3000, window)).toBe(1);
    });

    it("returns 1 after end", () => {
        expect(getLightingEffectProgress(5000, window)).toBe(1);
    });

    it("returns 1 for zero-duration effect at or after start", () => {
        expect(
            getLightingEffectProgress(1000, { startMs: 1000, durationMs: 0 }),
        ).toBe(1);
        expect(
            getLightingEffectProgress(2000, { startMs: 1000, durationMs: 0 }),
        ).toBe(1);
    });

    it("returns 0 for zero-duration effect before start", () => {
        expect(
            getLightingEffectProgress(500, { startMs: 1000, durationMs: 0 }),
        ).toBe(0);
    });

    it("clamps negative startMs to 0", () => {
        expect(
            getLightingEffectProgress(500, { startMs: -100, durationMs: 1000 }),
        ).toBe(0.5);
    });
});

describe("resolveLightingEffectWindowMs", () => {
    it("returns zero window when scene beat is not found", () => {
        expect(
            resolveLightingEffectWindowMs(beats, 99, {
                startOffsetBeats: 0,
                durationBeats: 2,
            }),
        ).toEqual({ startMs: 0, durationMs: 0 });
    });

    it("starts at scene beat with zero offset", () => {
        expect(
            resolveLightingEffectWindowMs(beats, 0, {
                startOffsetBeats: 0,
                durationBeats: 2,
            }),
        ).toEqual({ startMs: 0, durationMs: 1500 });
    });

    it("offsets start by beat count", () => {
        expect(
            resolveLightingEffectWindowMs(beats, 0, {
                startOffsetBeats: 1,
                durationBeats: 2,
            }),
        ).toEqual({ startMs: 500, durationMs: 1500 });
    });

    it("clamps negative duration to zero", () => {
        expect(
            resolveLightingEffectWindowMs(beats, 0, {
                startOffsetBeats: 0,
                durationBeats: -1,
            }),
        ).toEqual({ startMs: 0, durationMs: 0 });
    });

    it("sums variable beat durations", () => {
        expect(
            resolveLightingEffectWindowMs(beats, 1, {
                startOffsetBeats: 0,
                durationBeats: 1,
            }),
        ).toEqual({ startMs: 0, durationMs: 1000 });
    });

    it("finds scene by next beat position when exact match missing", () => {
        expect(
            resolveLightingEffectWindowMs(beats, 1, {
                startOffsetBeats: 0,
                durationBeats: 1,
            }),
        ).toEqual({ startMs: 0, durationMs: 1000 });
    });
});

describe("getLightingEffectProgressFromBeatWindow", () => {
    it("combines beat resolution and progress", () => {
        const progress = getLightingEffectProgressFromBeatWindow(
            750,
            beats,
            0,
            { startOffsetBeats: 1, durationBeats: 2 },
        );
        expect(progress).toBe(1 / 6);
    });
});

describe("getLightingEffectProgressAtShowTime", () => {
    it("matches scene-local progress after subtracting scene start", () => {
        const window = { startOffsetBeats: 0, durationBeats: 2 };
        const sceneLocal = getLightingEffectProgressFromBeatWindow(
            750,
            beats,
            0,
            window,
        );
        const showTime = getLightingEffectProgressAtShowTime(
            5750,
            5000,
            beats,
            0,
            window,
        );
        expect(showTime).toBe(sceneLocal);
    });
});
