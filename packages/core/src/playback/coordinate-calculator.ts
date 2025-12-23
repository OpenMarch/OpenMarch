import type { IPath } from "@/path-utility";
import type { ObjectCoordinateTimeline } from "./coordinate-manager";

const PathLengthCache = new WeakMap<IPath, number>();

/**
 * Get the coordinates at a given time for a marcher.
 *
 * @param timestampMilliseconds The time in milliseconds.
 * @param objectTimeline The timeline of coordinates for the marcher.
 * @returns The coordinates at the given time.
 */
export const getCoordinatesAtTime = (
    timestampMilliseconds: number,
    objectTimeline: ObjectCoordinateTimeline,
): { x: number; y: number } | null => {
    if (timestampMilliseconds < 0)
        throw new Error(
            `Cannot use negative timestamp: ${timestampMilliseconds}`,
        );

    const { current: currentTimestamp, next: nextTimestamp } =
        findSurroundingTimestamps({
            sortedTimestamps: objectTimeline.sortedTimestamps,
            targetTimestamp: timestampMilliseconds,
        });

    if (currentTimestamp === null)
        throw new Error("No timestamp found! This shouldn't happen");
    // Likely the end, return false
    if (!nextTimestamp) return null;

    const previousCoordinate =
        objectTimeline.coordinateMap.get(currentTimestamp);
    const nextCoordinate = objectTimeline.coordinateMap.get(nextTimestamp);

    if (previousCoordinate === undefined || nextCoordinate === undefined)
        throw new Error("No coordinate found! This shouldn't happen");

    const keyframeProgress =
        nextTimestamp !== null
            ? (timestampMilliseconds - currentTimestamp) /
              (nextTimestamp - currentTimestamp)
            : 0;

    if (keyframeProgress < 0 || keyframeProgress > 1)
        throw new Error(
            "Keyframe progress is out of bounds! This shouldn't happen",
        );

    let interpolatedCoordinate: { x: number; y: number };
    if (nextCoordinate.path_data != null) {
        const nextPath = nextCoordinate.path_data;
        const destinationPathPosition =
            nextCoordinate.path_arrival_position ?? 1;
        const previousPathPosition = nextCoordinate.path_start_position ?? 0;

        let pathLength = PathLengthCache.get(nextPath);
        if (pathLength == null) {
            pathLength = nextPath.getTotalLength();
            PathLengthCache.set(nextPath, pathLength);
        }

        const currentPathPosition =
            (destinationPathPosition - previousPathPosition) *
                keyframeProgress +
            previousPathPosition;

        if (pathLength === undefined)
            throw new Error("Could not calculate path length");

        const interpolatedSvgLength = pathLength * currentPathPosition;
        const point = nextPath.getPointAtLength(interpolatedSvgLength);
        interpolatedCoordinate = point;
    } else {
        interpolatedCoordinate = {
            x:
                previousCoordinate.x +
                keyframeProgress * (nextCoordinate.x - previousCoordinate.x),
            y:
                previousCoordinate.y +
                keyframeProgress * (nextCoordinate.y - previousCoordinate.y),
        };
    }

    return interpolatedCoordinate;
};

/**
 * Binary search algorithm to find the timestamps surrounding a target.
 *
 * @param params.timestamps - Sorted array of timestamps
 * @param params.targetTimestamp - The target timestamp to search for
 * @returns An object with the timestamp at or before the target (`current`)
 *          and the timestamp immediately after the target (`next`).
 *          Returns null for either if not found.
 */
export function findSurroundingTimestamps({
    sortedTimestamps,
    targetTimestamp,
}: {
    sortedTimestamps: number[];
    targetTimestamp: number;
}): { current: number | null; next: number | null } {
    let low = 0;
    let high = sortedTimestamps.length - 1;

    if (sortedTimestamps.length === 0 || sortedTimestamps[0] == null) {
        return { current: null, next: null };
    }

    // If target is before the first element
    if (targetTimestamp < sortedTimestamps[0]) {
        return { current: null, next: sortedTimestamps[0] };
    }

    // If target is after or at the last element
    const lastTimestamp = sortedTimestamps[high];
    if (lastTimestamp == null)
        throw new Error("lastTimestamp is null! This shouldn't happen");
    if (targetTimestamp >= lastTimestamp) {
        return { current: lastTimestamp, next: null };
    }

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const midT = sortedTimestamps[mid];

        if (midT == null)
            throw new Error("midT is null! This shouldn't happen");
        if (midT === targetTimestamp) {
            return { current: midT, next: sortedTimestamps[mid + 1] ?? null };
        }

        if (midT < targetTimestamp) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    // At this point, high < low.
    // timestamps[high] is the value before the target.
    // timestamps[low] is the value after the target.
    const outputHigh = sortedTimestamps[high];
    if (outputHigh == null)
        throw new Error("outputHigh is null! This shouldn't happen");
    const outputLow = sortedTimestamps[low];
    if (outputLow == null)
        throw new Error("outputLow is null! This shouldn't happen");
    return { current: outputHigh, next: outputLow };
}
