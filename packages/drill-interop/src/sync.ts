import { BinaryReader } from "./binaryReader";
import type { DrillAudioSync } from "./types";

/**
 * `SYNC`: `u16 pathLen`, UTF-16BE path (`pathLen` code units), `u16 count`,
 * then `count` big-endian `f64` timestamps in seconds.
 */
export function readAudioSync(payload: Uint8Array): DrillAudioSync | undefined {
    const reader = new BinaryReader(payload);
    if (reader.remaining < 2) return undefined;

    const pathUnits = reader.u16();
    if (pathUnits <= 0 || pathUnits * 2 > reader.remaining) return undefined;

    let path = "";
    for (let i = 0; i < pathUnits; i++) {
        path += String.fromCharCode(reader.u16());
    }

    if (reader.remaining < 2) return undefined;
    const count = reader.u16();
    if (count <= 0 || count * 8 > reader.remaining) return undefined;

    const timestamps: number[] = [];
    for (let i = 0; i < count; i++) {
        const t = reader.f64();
        if (!Number.isFinite(t)) return undefined;
        timestamps.push(t);
    }

    return { path, timestamps };
}

/**
 * Beat durations (seconds) for `totalCounts` beats, derived from SYNC timestamps.
 * Missing trailing stamps reuse the last observed delta (or `fallbackDuration`).
 */
export function beatDurationsFromSyncTimestamps({
    timestamps,
    totalCounts,
    fallbackDuration,
}: {
    timestamps: number[] | undefined;
    totalCounts: number;
    fallbackDuration: number;
}): number[] {
    if (totalCounts <= 0) return [];
    if (!timestamps || timestamps.length < 2) {
        return Array.from({ length: totalCounts }, () => fallbackDuration);
    }

    const durations: number[] = [];
    let lastDelta = fallbackDuration;
    for (let i = 0; i < totalCounts; i++) {
        if (i + 1 < timestamps.length) {
            const delta = timestamps[i + 1]! - timestamps[i]!;
            if (delta > 0 && Number.isFinite(delta)) {
                lastDelta = delta;
                durations.push(delta);
                continue;
            }
        }
        durations.push(lastDelta);
    }
    return durations;
}

/**
 * OpenMarch `audioOffsetSeconds`: negative trims the start of the file so count 0
 * (timeline t=0) lines up with `timestamps[0]` in the source audio.
 *
 * TODO(feature/drill-import-audio-lead-in): Prefer preserving this lead-in with
 * intro timing before page 1 instead of always trimming it away.
 */
export function audioOffsetSecondsFromSync(
    timestamps: number[] | undefined,
): number {
    const leadIn = timestamps?.[0];
    if (leadIn == null || !Number.isFinite(leadIn) || leadIn <= 0) return 0;
    return -leadIn;
}
