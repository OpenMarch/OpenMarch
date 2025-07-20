type Coordinate = { x: number; y: number };
type CoordinateDefinition = { x: number; y: number; svg?: string };

type MarcherTimeline = {
    pathMap: Map<number, CoordinateDefinition>;
    sortedTimestamps: number[];
};

const SvgLengthCache = new Map<string, number>();
const SvgElementCache = new Map<string, SVGPathElement>();

export const getCoordinatesAtTime = (
    timestampMilliseconds: number,
    marcherTimeline: MarcherTimeline,
) => {
    if (timestampMilliseconds < 0)
        throw new Error(
            `Cannot use negative timestamp: ${timestampMilliseconds}`,
        );

    const { current: currentTimestamp, next: nextTimestamp } =
        findSurroundingTimestamps({
            timestamps: marcherTimeline.sortedTimestamps,
            targetTimestamp: timestampMilliseconds,
        });

    if (currentTimestamp === null || nextTimestamp === null)
        throw new Error("No timestamp found! This shouldn't happen");

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
    if (previousCoordinate.svg) {
        const previousSvg = previousCoordinate.svg;

        let pathElement = SvgElementCache.get(previousSvg);
        if (!pathElement) {
            const pathElement = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "path",
            );
            pathElement.setAttribute("d", previousSvg); // assumes `previousSvg` is just the `d` string
            SvgElementCache.set(previousSvg, pathElement);
        }
        if (!pathElement)
            throw new Error("No path element found! This shouldn't happen");

        let previousSvgLength = SvgLengthCache.get(previousSvg);
        if (!previousSvgLength) {
            previousSvgLength = pathElement.getTotalLength();
            SvgLengthCache.set(previousSvg, previousSvgLength);
        }

        const interpolatedSvgLength = previousSvgLength * keyframeProgress;
        const point = pathElement.getPointAtLength(interpolatedSvgLength);
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
function findSurroundingTimestamps({
    timestamps,
    targetTimestamp,
}: {
    timestamps: number[];
    targetTimestamp: number;
}): { current: number | null; next: number | null } {
    let low = 0;
    let high = timestamps.length - 1;

    if (timestamps.length === 0) {
        return { current: null, next: null };
    }

    // If target is before the first element
    if (targetTimestamp < timestamps[0]) {
        return { current: null, next: timestamps[0] };
    }

    // If target is after or at the last element
    if (targetTimestamp >= timestamps[high]) {
        return { current: timestamps[high], next: null };
    }

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const midT = timestamps[mid];

        if (midT === targetTimestamp) {
            return { current: midT, next: timestamps[mid + 1] ?? null };
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
    return { current: timestamps[high], next: timestamps[low] };
}
