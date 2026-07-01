/** Minimal beat shape — no desktop Beat class dependency */
export type LightingBeatTiming = {
    position: number;
    /** Seconds until next beat */
    duration: number;
};

export type LightingEffectBeatWindow = {
    startOffsetBeats: number;
    durationBeats: number;
};

const compareBeatPositions = (
    a: LightingBeatTiming,
    b: LightingBeatTiming,
): number => a.position - b.position;

/**
 * Converts a lighting effect's beat window (offsets from scene start) into scene-local milliseconds.
 */
export function resolveLightingEffectWindowMs(
    beatsSortedAscending: readonly LightingBeatTiming[],
    sceneStartBeatPosition: number,
    window: LightingEffectBeatWindow,
): { startMs: number; durationMs: number } {
    const beats = [...beatsSortedAscending].sort(compareBeatPositions);

    let sceneIdx = beats.findIndex(
        (b) => b.position === sceneStartBeatPosition,
    );
    if (sceneIdx < 0) {
        sceneIdx = beats.findIndex((b) => b.position >= sceneStartBeatPosition);
    }
    if (sceneIdx < 0) return { startMs: 0, durationMs: 0 };

    const startIdx = sceneIdx + window.startOffsetBeats;
    const clampedDuration = Math.max(0, window.durationBeats);

    let startMs = 0;
    for (let i = sceneIdx; i < Math.min(startIdx, beats.length); i++) {
        startMs += Math.max(0, beats[i]!.duration) * 1000;
    }

    let durationMs = 0;
    for (
        let i = startIdx;
        i < Math.min(startIdx + clampedDuration, beats.length);
        i++
    ) {
        durationMs += Math.max(0, beats[i]!.duration) * 1000;
    }

    return {
        startMs: Math.round(startMs),
        durationMs: Math.round(durationMs),
    };
}

/**
 * Normalized effect progress at scene-local timestamp.
 * - t < startMs → 0
 * - startMs ≤ t < startMs + durationMs → (t - startMs) / durationMs
 * - t ≥ end → 1
 * - durationMs === 0 && t ≥ startMs → 1 (instant effect)
 */
export function getLightingEffectProgress(
    timestampMs: number,
    effectWindowMs: { startMs: number; durationMs: number },
): number {
    const startMs = Math.max(0, effectWindowMs.startMs);
    const safeDurationMs = Math.max(0, effectWindowMs.durationMs);
    const endMs = startMs + safeDurationMs;

    if (safeDurationMs === 0) {
        return timestampMs >= startMs ? 1 : 0;
    }

    if (timestampMs < startMs) {
        return 0;
    }

    if (timestampMs >= endMs) {
        return 1;
    }

    return Math.min(1, Math.max(0, (timestampMs - startMs) / safeDurationMs));
}

/** Convenience: beats + beat window + scene-local timestamp */
export function getLightingEffectProgressFromBeatWindow(
    timestampMs: number,
    beatsSortedAscending: readonly LightingBeatTiming[],
    sceneStartBeatPosition: number,
    window: LightingEffectBeatWindow,
): number {
    const effectWindowMs = resolveLightingEffectWindowMs(
        beatsSortedAscending,
        sceneStartBeatPosition,
        window,
    );
    return getLightingEffectProgress(timestampMs, effectWindowMs);
}

/** Show-time wrapper: subtracts scene start from global show timestamp */
export function getLightingEffectProgressAtShowTime(
    tShowMs: number,
    sceneStartShowMs: number,
    beatsSortedAscending: readonly LightingBeatTiming[],
    sceneStartBeatPosition: number,
    window: LightingEffectBeatWindow,
): number {
    return getLightingEffectProgressFromBeatWindow(
        tShowMs - sceneStartShowMs,
        beatsSortedAscending,
        sceneStartBeatPosition,
        window,
    );
}
