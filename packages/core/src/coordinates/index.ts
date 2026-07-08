import { Path } from "../path-utility";
import type { IPath } from "../path-utility";

export type SampleMarcherCoordinatesBeat = {
    id: number;
    /** Duration from this beat to the next in seconds. */
    duration: number;
    /** Beat order in the show. */
    position: number;
};

export type SampleMarcherCoordinatesPage = {
    id: number;
    start_beat: number;
};

export type SampleMarcherCoordinatesMarcher = {
    id: number;
    drill_prefix: string;
    drill_order: number;
};

export type SampleMarcherCoordinatesMarcherPage = {
    marcher_id: number;
    page_id: number;
    x: number;
    y: number;
    path_data_id?: number | null;
    path_start_position?: number | null;
    path_end_position?: number | null;
};

export type SampleMarcherCoordinatesPathway = {
    id: number;
    path_data: string;
};

export type SampleMarcherCoordinatesArgs = {
    beats: readonly SampleMarcherCoordinatesBeat[];
    pages: readonly SampleMarcherCoordinatesPage[];
    marchers: readonly SampleMarcherCoordinatesMarcher[];
    marcherPages: readonly SampleMarcherCoordinatesMarcherPage[];
    pathways?: readonly SampleMarcherCoordinatesPathway[];
    fps?: number;
};

export type SampledMarcherCoordinates = {
    fps: number;
    frameCount: number;
    durationSeconds: number;
    /** Flat x/y pairs by frame: [x0, y0, x1, y1, ...]. */
    coordinatesByMarcher: Record<string, Float32Array>;
};

type CoordinateDefinition = {
    x: number;
    y: number;
    path?: IPath;
    pathStartPosition?: number;
    nextPathPosition?: number;
};

type MarcherTimeline = {
    pathMap: Map<number, CoordinateDefinition>;
    sortedTimestamps: number[];
};

const DEFAULT_FPS = 30;
const EPSILON_MS = 1e-6;

const pathLengthCache = new WeakMap<IPath, number>();

export function sampleMarcherCoordinates({
    beats,
    pages,
    marchers,
    marcherPages,
    pathways = [],
    fps = DEFAULT_FPS,
}: SampleMarcherCoordinatesArgs): SampledMarcherCoordinates {
    if (fps <= 0)
        throw new Error(`fps must be greater than 0. Received ${fps}`);

    const sortedPages = sortPagesByBeatPosition(pages, beats);
    const pageTimestamps = getPageTimestampsMilliseconds(sortedPages, beats);
    const durationMilliseconds =
        sortedPages.length > 0
            ? pageTimestamps.get(sortedPages.at(-1)!.id)!
            : 0;
    const sampleTimes = getSampleTimesMilliseconds(durationMilliseconds, fps);
    const timelines = getMarcherTimelines({
        marchers,
        marcherPages,
        pageTimestamps,
        pathways,
    });

    const coordinatesByMarcher: Record<string, Float32Array> = {};
    for (const marcher of marchers) {
        const timeline = timelines.get(marcher.id);
        const coordinates = new Float32Array(sampleTimes.length * 2);
        if (timeline) {
            for (
                let frameIndex = 0;
                frameIndex < sampleTimes.length;
                frameIndex++
            ) {
                const coordinate = getCoordinatesAtTime(
                    sampleTimes[frameIndex]!,
                    timeline,
                );
                coordinates[frameIndex * 2] = coordinate.x;
                coordinates[frameIndex * 2 + 1] = coordinate.y;
            }
        }
        coordinatesByMarcher[marcher.id.toString()] = coordinates;
    }

    return {
        fps,
        frameCount: sampleTimes.length,
        durationSeconds: durationMilliseconds / 1000,
        coordinatesByMarcher,
    };
}

function sortPagesByBeatPosition(
    pages: readonly SampleMarcherCoordinatesPage[],
    beats: readonly SampleMarcherCoordinatesBeat[],
) {
    const beatPositionById = new Map(
        beats.map((beat) => [beat.id, beat.position]),
    );
    return [...pages].sort((a, b) => {
        const aPosition = beatPositionById.get(a.start_beat);
        const bPosition = beatPositionById.get(b.start_beat);
        if (aPosition == null)
            throw new Error(
                `Page ${a.id} references missing beat ${a.start_beat}`,
            );
        if (bPosition == null)
            throw new Error(
                `Page ${b.id} references missing beat ${b.start_beat}`,
            );
        return aPosition - bPosition;
    });
}

function getBeatTimestampsMilliseconds(
    beats: readonly SampleMarcherCoordinatesBeat[],
) {
    const sortedBeats = [...beats].sort((a, b) => a.position - b.position);
    const timestamps = new Map<number, number>();
    let currentTimestamp = 0;
    for (const beat of sortedBeats) {
        timestamps.set(beat.id, currentTimestamp * 1000);
        currentTimestamp += beat.duration;
    }
    return timestamps;
}

function getPageTimestampsMilliseconds(
    pages: readonly SampleMarcherCoordinatesPage[],
    beats: readonly SampleMarcherCoordinatesBeat[],
) {
    const beatTimestamps = getBeatTimestampsMilliseconds(beats);
    const pageTimestamps = new Map<number, number>();
    for (const page of pages) {
        const timestamp = beatTimestamps.get(page.start_beat);
        if (timestamp == null)
            throw new Error(
                `Page ${page.id} references missing beat ${page.start_beat}`,
            );
        pageTimestamps.set(page.id, timestamp);
    }
    return pageTimestamps;
}

function getSampleTimesMilliseconds(durationMilliseconds: number, fps: number) {
    const intervalMilliseconds = 1000 / fps;
    const sampleTimes: number[] = [];
    for (
        let time = 0;
        time <= durationMilliseconds + EPSILON_MS;
        time += intervalMilliseconds
    ) {
        sampleTimes.push(Math.min(time, durationMilliseconds));
    }

    const lastSampleTime = sampleTimes.at(-1);
    if (
        lastSampleTime == null ||
        Math.abs(lastSampleTime - durationMilliseconds) > EPSILON_MS
    ) {
        sampleTimes.push(durationMilliseconds);
    }
    return sampleTimes;
}

function getMarcherTimelines({
    marchers,
    marcherPages,
    pageTimestamps,
    pathways,
}: {
    marchers: readonly SampleMarcherCoordinatesMarcher[];
    marcherPages: readonly SampleMarcherCoordinatesMarcherPage[];
    pageTimestamps: Map<number, number>;
    pathways: readonly SampleMarcherCoordinatesPathway[];
}) {
    const pathwaysById = new Map(
        pathways.map((pathway) => [
            pathway.id,
            Path.fromJson(pathway.path_data, undefined, undefined, pathway.id),
        ]),
    );
    const marcherPagesByMarcherId = new Map<
        number,
        SampleMarcherCoordinatesMarcherPage[]
    >();
    for (const marcherPage of marcherPages) {
        const current =
            marcherPagesByMarcherId.get(marcherPage.marcher_id) ?? [];
        current.push(marcherPage);
        marcherPagesByMarcherId.set(marcherPage.marcher_id, current);
    }

    const timelines = new Map<number, MarcherTimeline>();
    for (const marcher of marchers) {
        const coordinateMap = new Map<number, CoordinateDefinition>();
        for (const marcherPage of marcherPagesByMarcherId.get(marcher.id) ??
            []) {
            const timestamp = pageTimestamps.get(marcherPage.page_id);
            if (timestamp == null)
                throw new Error(
                    `Marcher page references missing page ${marcherPage.page_id}`,
                );
            const path =
                marcherPage.path_data_id != null
                    ? pathwaysById.get(marcherPage.path_data_id)
                    : undefined;
            if (marcherPage.path_data_id != null && !path)
                throw new Error(
                    `Marcher page references missing pathway ${marcherPage.path_data_id}`,
                );
            coordinateMap.set(timestamp, {
                x: marcherPage.x,
                y: marcherPage.y,
                path,
                pathStartPosition: marcherPage.path_start_position ?? 0,
                nextPathPosition: marcherPage.path_end_position ?? 1,
            });
        }

        if (coordinateMap.size > 0) {
            timelines.set(marcher.id, {
                pathMap: coordinateMap,
                sortedTimestamps: [...coordinateMap.keys()].sort(
                    (a, b) => a - b,
                ),
            });
        }
    }
    return timelines;
}

function getCoordinatesAtTime(
    timestampMilliseconds: number,
    marcherTimeline: MarcherTimeline,
) {
    const { current: currentTimestamp, next: nextTimestamp } =
        findSurroundingTimestamps({
            sortedTimestamps: marcherTimeline.sortedTimestamps,
            targetTimestamp: timestampMilliseconds,
        });

    if (currentTimestamp == null)
        throw new Error(`No coordinate found at ${timestampMilliseconds}ms`);

    const previousCoordinate = marcherTimeline.pathMap.get(currentTimestamp);
    if (!previousCoordinate)
        throw new Error(`No coordinate found at ${currentTimestamp}ms`);

    if (nextTimestamp == null) {
        return { x: previousCoordinate.x, y: previousCoordinate.y };
    }

    const nextCoordinate = marcherTimeline.pathMap.get(nextTimestamp);
    if (!nextCoordinate)
        throw new Error(`No coordinate found at ${nextTimestamp}ms`);

    const keyframeProgress =
        (timestampMilliseconds - currentTimestamp) /
        (nextTimestamp - currentTimestamp);

    if (nextCoordinate.path) {
        const pathLength = getPathLength(nextCoordinate.path);
        const pathStartPosition = nextCoordinate.pathStartPosition ?? 0;
        const nextPathPosition = nextCoordinate.nextPathPosition ?? 1;
        const currentPathPosition =
            (nextPathPosition - pathStartPosition) * keyframeProgress +
            pathStartPosition;
        const point = nextCoordinate.path.getPointAtLength(
            pathLength * currentPathPosition,
        );
        return { x: point.x, y: point.y };
    }

    return {
        x:
            previousCoordinate.x +
            keyframeProgress * (nextCoordinate.x - previousCoordinate.x),
        y:
            previousCoordinate.y +
            keyframeProgress * (nextCoordinate.y - previousCoordinate.y),
    };
}

function getPathLength(path: IPath) {
    const cachedLength = pathLengthCache.get(path);
    if (cachedLength != null) return cachedLength;
    const pathLength = path.getTotalLength();
    pathLengthCache.set(path, pathLength);
    return pathLength;
}

function findSurroundingTimestamps({
    sortedTimestamps,
    targetTimestamp,
}: {
    sortedTimestamps: number[];
    targetTimestamp: number;
}): { current: number | null; next: number | null } {
    let low = 0;
    let high = sortedTimestamps.length - 1;

    if (sortedTimestamps.length === 0) return { current: null, next: null };
    if (targetTimestamp < sortedTimestamps[0]!)
        return { current: null, next: sortedTimestamps[0]! };
    if (targetTimestamp >= sortedTimestamps[high]!)
        return { current: sortedTimestamps[high]!, next: null };

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const midTimestamp = sortedTimestamps[mid]!;

        if (midTimestamp === targetTimestamp) {
            return {
                current: midTimestamp,
                next: sortedTimestamps[mid + 1] ?? null,
            };
        }

        if (midTimestamp < targetTimestamp) low = mid + 1;
        else high = mid - 1;
    }

    return { current: sortedTimestamps[high]!, next: sortedTimestamps[low]! };
}
