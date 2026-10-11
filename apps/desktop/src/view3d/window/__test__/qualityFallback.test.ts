import { describe, expect, it } from "vitest";
import {
    FALLBACK_AFTER_S,
    MAX_COUNTED_FRAME_S,
    createQualityFallbackState,
    stepQualityFallback,
    type QualityFallbackState,
} from "../qualityFallback";

/**
 * Feeds `seconds` worth of frames at `fps`.
 *
 * @returns the elapsed time (s) of each frame that fired
 */
function run(
    state: QualityFallbackState,
    fps: number,
    seconds: number,
    startAt = 0,
): number[] {
    const fired: number[] = [];
    const dt = 1 / fps;
    const frames = Math.round(seconds * fps);
    for (let i = 1; i <= frames; i++) {
        if (stepQualityFallback(state, dt)) fired.push(startAt + i * dt);
    }
    return fired;
}

describe("stepQualityFallback", () => {
    it("never fires at 60 fps", () => {
        const state = createQualityFallbackState();
        expect(run(state, 60, 60)).toEqual([]);
        expect(state.fired).toBe(false);
    });

    it("never fires at exactly 30 fps", () => {
        const state = createQualityFallbackState();
        expect(run(state, 30, 60)).toEqual([]);
    });

    it("fires once, 3 seconds into a run below 30 fps", () => {
        const state = createQualityFallbackState();
        const fired = run(state, 20, 30);
        expect(fired).toHaveLength(1);
        expect(fired[0]).toBeGreaterThanOrEqual(FALLBACK_AFTER_S - 1e-6);
        expect(fired[0]).toBeLessThan(FALLBACK_AFTER_S + 0.6);
        expect(state.fired).toBe(true);
    });

    it("does not fire before 3 seconds", () => {
        const state = createQualityFallbackState();
        expect(run(state, 10, 2.4)).toEqual([]);
    });

    it("needs the 3 seconds to be consecutive", () => {
        const state = createQualityFallbackState();
        // 2 s slow, 1 s fast, 2 s slow: never 3 s in a row.
        expect(run(state, 15, 2)).toEqual([]);
        expect(run(state, 60, 1)).toEqual([]);
        expect(run(state, 15, 2)).toEqual([]);
        // Another slow second makes three in a row.
        expect(run(state, 15, 1.5)).toHaveLength(1);
    });

    it("ignores a single slow frame among fast ones", () => {
        const state = createQualityFallbackState();
        for (let s = 0; s < 20; s++) {
            stepQualityFallback(state, 0.2);
            expect(run(state, 60, 1)).toEqual([]);
        }
        expect(state.fired).toBe(false);
    });

    it("treats a long gap as a pause, not as slowness", () => {
        const state = createQualityFallbackState();
        expect(run(state, 10, 2)).toEqual([]);
        expect(stepQualityFallback(state, MAX_COUNTED_FRAME_S + 4)).toBe(false);
        // The slow time before the pause no longer counts.
        expect(run(state, 10, 2)).toEqual([]);
        expect(state.fired).toBe(false);
    });

    it("ignores zero, negative and NaN frame times", () => {
        const state = createQualityFallbackState();
        for (const dt of [0, -1, Number.NaN]) {
            expect(stepQualityFallback(state, dt)).toBe(false);
        }
        expect(state.sampleFrames).toBe(0);
    });

    it("never fires again, even if the frame rate stays low", () => {
        const state = createQualityFallbackState();
        expect(run(state, 5, 4)).toHaveLength(1);
        expect(run(state, 5, 60)).toEqual([]);
    });
});
