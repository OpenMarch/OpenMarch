import { IPath } from "@openmarch/core";

type Coordinate = { x: number; y: number };
export type CoordinateDefinition = {
    x: number;
    y: number;
    path?: IPath;
    previousPathPosition?: number;
    nextPathPosition?: number;
};

/**
 * A timeline of coordinates for a marcher.
 *
 * @param pathMap A map of timestamps to coordinates.
 * @param sortedTimestamps A sorted array of timestamps. This is used to speed up the search for the surrounding timestamps.
 */
export type MarcherTimeline = {
    pathMap: Map<number, CoordinateDefinition>;
    sortedTimestamps: number[];
};

const PathLengthCache = new WeakMap<IPath, number>();

/**
 * Get the coordinates at a given time for a marcher.
 *
 * @param timestampMilliseconds The time in milliseconds.
 * @param marcherTimeline The timeline of coordinates for the marcher.
 * @returns The coordinates at the given time.
 */
export const getCoordinatesAtTime = (
    timestampMilliseconds: number,
    marcherTimeline: MarcherTimeline,
): Coordinate | null => {
    if (timestampMilliseconds < 0)
        throw new Error(
            `Cannot use negative timestamp: ${timestampMilliseconds}`,
        );

    const { current: currentTimestamp, next: nextTimestamp } =
        findSurroundingTimestamps({
            sortedTimestamps: marcherTimeline.sortedTimestamps,
            targetTimestamp: timestampMilliseconds,
        });

    if (currentTimestamp === null)
        throw new Error("No timestamp found! This shouldn't happen");
    // Likely the end, return false
    if (!nextTimestamp) return null;

    const previousCoordinate = marcherTimeline.pathMap.get(currentTimestamp);
    const nextCoordinate = marcherTimeline.pathMap.get(nextTimestamp);

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

    let interpolatedCoordinate: Coordinate;
    if (nextCoordinate.path) {
        const nextPath = nextCoordinate.path;
        const destinationPathPosition = nextCoordinate.nextPathPosition;
        const previousPathPosition = previousCoordinate.previousPathPosition;

        let pathLength = PathLengthCache.get(nextPath);
        if (pathLength === undefined) {
            pathLength = nextPath.getTotalLength();
            PathLengthCache.set(nextPath, pathLength);
        }

        const previousPathPositionToUse = previousPathPosition ?? 0;
        const destinationPathPositionToUse = destinationPathPosition ?? 1;
        const currentPathPosition =
            (destinationPathPositionToUse - previousPathPositionToUse) *
                keyframeProgress +
            previousPathPositionToUse;

        if (pathLength === undefined) {
            throw new Error("Could not calculate path length");
        }

        const interpolatedSvgLength = pathLength * currentPathPosition;
        const point = nextPath.getPointAtLength(interpolatedSvgLength);
        interpolatedCoordinate = { x: point.x, y: point.y };
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

    if (sortedTimestamps.length === 0) {
        return { current: null, next: null };
    }

    // If target is before the first element
    if (targetTimestamp < sortedTimestamps[0]) {
        return { current: null, next: sortedTimestamps[0] };
    }

    // If target is after or at the last element
    if (targetTimestamp >= sortedTimestamps[high]) {
        return { current: sortedTimestamps[high], next: null };
    }

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const midT = sortedTimestamps[mid];

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
    return { current: sortedTimestamps[high], next: sortedTimestamps[low] };
}
