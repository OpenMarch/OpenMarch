import { MarcherTimeline } from "@openmarch/core";

/**
 *
 * @param coordinatesForMarcher coordinates for a marcher at a given page_id
 * @param pagesSorted sorted list of page ids and their timestamp in the show
 * @returns `MarcherTimeline` object
 *
 * @todo Implement curved pathways here
 */
export const dbToMarcherTimeline = (
    coordinatesForMarcher: { page_id: number; x: number; y: number }[],
    pagesSorted: { page_id: number; timestamp: number }[],
): MarcherTimeline => {
    const timestamps = new Float32Array(pagesSorted.map((p) => p.timestamp));

    const coordinatesByPageId = new Map<number, [number, number]>(
        coordinatesForMarcher.map((coordinate) => [
            coordinate.page_id,
            [coordinate.x, coordinate.y],
        ]),
    );

    const coordinates = new Float32Array(timestamps.length * 2);

    for (const [pageIndex, { page_id }] of pagesSorted.entries()) {
        const coordinateIndex = pageIndex * 2;
        const coordinate = coordinatesByPageId.get(page_id);
        if (coordinate == null)
            throw new Error("Coordinate not found for page id: " + page_id);

        coordinates[coordinateIndex] = coordinate[0];
        coordinates[coordinateIndex + 1] = coordinate[1];
    }

    return { timestamps, coordinates };
};
