import { getCoordinateAtTime, MarcherTimeline } from "@openmarch/core";
/**
 *
 * @param marcherTimelines list of all `MarcherTimelines` in the show.
 * @param timeMs timestamp in milliseconds to get coordinates for.
 * @returns The coordinates for each marcher at the given `timeMs` in a flat `Float32Array`. Coordinates are in the same order as the marcherTimeline array
 */
export const getAllCoordinatesAtTime = (
    marcherTimelines: MarcherTimeline[],
    timeMs: number,
): Float32Array => {
    const outputCoordinates = new Float32Array(marcherTimelines.length * 2);

    for (const [index, marcherTimeline] of marcherTimelines.entries()) {
        const coordinateIndex = index * 2;
        const coordinate = getCoordinateAtTime(marcherTimeline, timeMs);

        outputCoordinates[coordinateIndex] = coordinate[0];
        outputCoordinates[coordinateIndex + 1] = coordinate[1];
    }

    return outputCoordinates;
};
