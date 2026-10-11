/**
 * The automatic quality fallback (P5.1, design.md §9): after 3 seconds below
 * 30 fps the window switches to `low` quality once, logs it, and never
 * switches back on its own.
 *
 * {@link stepQualityFallback} is the pure part. It averages the frame rate
 * over short windows, so one slow frame doesn't count, and treats a frame
 * longer than {@link MAX_COUNTED_FRAME_S} as a pause (a hidden window, a kit
 * build) rather than as slowness. It mutates the state it is given instead of
 * returning a new one, so calling it every frame allocates nothing.
 */

/** Below this average frame rate, a sample window counts as slow. */
export const FALLBACK_MIN_FPS = 30;
/** Seconds of consecutive slow windows before switching to `low`. */
export const FALLBACK_AFTER_S = 3;
/** The frame rate is averaged over windows this long, in seconds. */
export const FALLBACK_SAMPLE_S = 0.5;
/**
 * A frame longer than this, in seconds, is a pause or a one-off stall, not a
 * sign of a slow GPU. It restarts the measurement.
 */
export const MAX_COUNTED_FRAME_S = 1;

export interface QualityFallbackState {
    /** Seconds in the current sample window. */
    sampleSeconds: number;
    /** Frames in the current sample window. */
    sampleFrames: number;
    /** Seconds of consecutive slow sample windows. */
    slowSeconds: number;
    /** True once the fallback has fired; it never fires again. */
    fired: boolean;
}

export function createQualityFallbackState(): QualityFallbackState {
    return { sampleSeconds: 0, sampleFrames: 0, slowSeconds: 0, fired: false };
}

/** Starts measuring again, for example after the scene was rebuilt. */
export function resetQualityFallback(state: QualityFallbackState): void {
    state.sampleSeconds = 0;
    state.sampleFrames = 0;
    state.slowSeconds = 0;
}

/**
 * Feeds one frame's duration into the fallback.
 *
 * @param state - from {@link createQualityFallbackState}; updated in place
 * @param dtSeconds - the time since the previous frame
 * @returns true exactly once: on the frame that completes 3 seconds below
 * 30 fps. The caller then switches to `low`.
 */
export function stepQualityFallback(
    state: QualityFallbackState,
    dtSeconds: number,
): boolean {
    if (state.fired) return false;
    if (!(dtSeconds > 0)) return false;
    if (dtSeconds > MAX_COUNTED_FRAME_S) {
        resetQualityFallback(state);
        return false;
    }
    state.sampleSeconds += dtSeconds;
    state.sampleFrames += 1;
    if (state.sampleSeconds < FALLBACK_SAMPLE_S) return false;

    const fps = state.sampleFrames / state.sampleSeconds;
    if (fps < FALLBACK_MIN_FPS) state.slowSeconds += state.sampleSeconds;
    else state.slowSeconds = 0;
    state.sampleSeconds = 0;
    state.sampleFrames = 0;

    // The epsilon absorbs rounding in the sum of sample windows.
    if (state.slowSeconds < FALLBACK_AFTER_S - 1e-9) return false;
    state.fired = true;
    return true;
}

/** The message logged (once) when the window switches to `low`. */
export const FALLBACK_LOG_MESSAGE = `3D View: below ${FALLBACK_MIN_FPS} fps for ${FALLBACK_AFTER_S} s; switched to low quality (no shadows, half crowd).`;
