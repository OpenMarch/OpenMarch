import type { MarcherTimeline } from "./types";

/**
 * @param timeline Rendering data for a marcher.
 * @param timeMs Current time in milliseconds.
 * @returns The coordinate of the marcher at the given `timeMs` as `[x, y]`.
 */
export const getCoordinateAtTime = (
    timeline: MarcherTimeline,
    timeMs: number,
): [number, number] => {
    const { timestamps, coordinates } = timeline;
    const { index: timestampIndex, progress } = _getTimestampIndexAndProgress(
        timestamps,
        timeMs,
    );

    const coordinateIndex = timestampIndex * 2;
    if (timestampIndex === timestamps.length - 1)
        return [
            coordinates[coordinateIndex]!,
            coordinates[coordinateIndex + 1]!,
        ];

    return _tweenCoordinates(
        coordinates[coordinateIndex]!,
        coordinates[coordinateIndex + 1]!,
        coordinates[coordinateIndex + 2]!,
        coordinates[coordinateIndex + 3]!,
        progress,
    );
};

/**
 * @param timestamps flat list of timestamps.
 * @param timeMs timestamp in milliseconds.
 * @returns Returns the timestamp index and progress for the given `timeMs`. E.g. for  timestamp `[0, 1000, 2000]`, `timeMs` `1500` returns `{ index: 1, progress: 0.5 }`.
 */
export const _getTimestampIndexAndProgress = (
    timestamps: Float32Array,
    timeMs: number,
): { index: number; progress: number } => {
    const timestampIndex = _getTimestampIndex(timestamps, timeMs);
    const currentTimestamp = timestamps[timestampIndex]!;
    const nextTimestamp = timestamps[timestampIndex + 1];

    if (currentTimestamp === nextTimestamp)
        throw new Error(
            "Timestamps must not be equal: " +
                currentTimestamp +
                " at timestamp index " +
                timestampIndex,
        );
    const progress =
        nextTimestamp == null
            ? 0
            : (timeMs - currentTimestamp) / (nextTimestamp - currentTimestamp);
    return { index: timestampIndex, progress };
};

/** Returns the index of the timestamp that is closest to, but not greater than, the given `timeMs`. */

/**
 * @param timestamps Flat list of timestamps.
 * @param timeMs Timestamp in milliseconds.
 * @returns Index of the timestamp that is closest to, but not greater than, `timeMs`.
 */
export const _getTimestampIndex = (
    timestamps: Float32Array,
    timeMs: number,
): number => {
    if (timeMs < 0) throw new Error("timeMs must be non-negative");
    if (timestamps.length === 0)
        throw new Error("timestamps must not be empty");

    let low = 0;
    let high = timestamps.length - 1;
    let result = -1;

    while (low <= high) {
        const mid = (low + high) >>> 1;
        const midTimestamp = timestamps[mid];
        if (midTimestamp === undefined) break;

        if (midTimestamp <= timeMs) {
            result = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    if (result === -1)
        throw new Error(
            "No timestamp found that was less than or equal to timeMs: " +
                timeMs,
        );

    return result;
};

/**
 * Linearly interpolates between two coordinates over a given progress value.
 *
 * @param firstCoordinate The starting coordinate.
 * @param secondCoordinate The ending coordinate.
 * @param progress
 * @returns The interpolated coordinate `[x,y]`
 */
export const _tweenCoordinates = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    progress: number,
): [number, number] => {
    if (progress < 0 || progress > 1)
        throw new Error("progress must be between 0 and 1");

    if (progress === 0) return [x1, y1];
    if (progress === 1) return [x2, y2];

    const x = x1 + (x2 - x1) * progress;
    const y = y1 + (y2 - y1) * progress;
    return [x, y];
};
