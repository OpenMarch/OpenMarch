import type {
    BeatPosition,
    TimelineMarker,
    TimelineTrack,
    TimelineViewModel,
} from "./TimelineViewModel";

export interface TimelineRange {
    readonly startBeat: BeatPosition;
    readonly endBeat: BeatPosition;
}

export const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

export const getTrackRange = (track: TimelineTrack): TimelineRange | null => {
    if (track.legs.length === 0) return null;
    return {
        startBeat: Math.min(...track.legs.map((leg) => leg.startBeat)),
        endBeat: Math.max(...track.legs.map((leg) => leg.endBeat)),
    };
};

const rangesOverlap = (a: TimelineRange, b: TimelineRange) =>
    a.startBeat < b.endBeat && b.startBeat < a.endBeat;

/**
 * Stable interval packing. Touching tracks can share a row; overlapping tracks
 * cannot. Sorting by start time makes the result deterministic for adapters and
 * stories that return tracks in different orders.
 */
export const packTimelineTracks = (
    tracks: readonly TimelineTrack[],
): TimelineTrack[][] => {
    const sorted = tracks
        .map((track, index) => ({ track, index, range: getTrackRange(track) }))
        .filter(
            (
                item,
            ): item is {
                track: TimelineTrack;
                index: number;
                range: TimelineRange;
            } => item.range !== null,
        )
        .sort(
            (a, b) =>
                a.range.startBeat - b.range.startBeat || a.index - b.index,
        );

    const rows: TimelineTrack[][] = [];
    for (const item of sorted) {
        const availableRow = rows.find((row) =>
            row.every((track) => {
                const range = getTrackRange(track);
                return range === null || !rangesOverlap(range, item.range);
            }),
        );
        if (availableRow) availableRow.push(item.track);
        else rows.push([item.track]);
    }
    return rows;
};

export const beatToX = (
    beat: BeatPosition,
    pixelsPerBeat: number,
    startBeat = 0,
) => (beat - startBeat) * pixelsPerBeat;

export const clientXToNearestBeat = ({
    clientX,
    surfaceLeft,
    pixelsPerBeat,
    startBeat,
    beatCount,
}: {
    clientX: number;
    surfaceLeft: number;
    pixelsPerBeat: number;
    startBeat: number;
    beatCount: number;
}) =>
    clamp(
        Math.round(startBeat + (clientX - surfaceLeft) / pixelsPerBeat),
        0,
        Math.max(beatCount - 1, 0),
    );

export const getInspectorRange = (
    track: TimelineTrack | undefined,
    beatCount: number,
): TimelineRange => {
    const range = track ? getTrackRange(track) : null;
    if (!range) return { startBeat: 0, endBeat: Math.max(beatCount, 1) };
    return {
        startBeat: Math.max(0, Math.floor(range.startBeat) - 1),
        endBeat: Math.min(beatCount, Math.ceil(range.endBeat) + 1),
    };
};

const latestMarkerAt = (
    markers: readonly TimelineMarker[],
    beat: BeatPosition,
) =>
    markers
        .filter((marker) => marker.atBeat <= beat)
        .sort((a, b) => b.atBeat - a.atBeat)[0];

export const getPlayheadLabel = (
    model: Pick<TimelineViewModel, "pages" | "measures" | "beatCount">,
    positionBeat: BeatPosition,
) => {
    const beat = clamp(
        Math.floor(positionBeat),
        0,
        Math.max(model.beatCount - 1, 0),
    );
    const page = latestMarkerAt(model.pages, beat);
    const measure = latestMarkerAt(model.measures, beat);
    const count = measure ? beat - measure.atBeat + 1 : beat + 1;
    return `Pg ${page?.label ?? "—"} · ${measure?.label ?? "—"} · ct ${count}`;
};

export const validateTimelineViewModel = (
    model: TimelineViewModel,
): string[] => {
    const errors: string[] = [];
    const pageBoundaries = new Set(model.pages.map((page) => page.atBeat));

    if (!Number.isInteger(model.beatCount) || model.beatCount <= 0) {
        errors.push("beatCount must be a positive integer");
    }
    if (model.waveform.peaksByBeat.length !== model.beatCount) {
        errors.push("waveform.peaksByBeat must contain one bucket per beat");
    }

    for (const track of model.tracks) {
        const legs = [...track.legs].sort((a, b) => a.startBeat - b.startBeat);
        if (legs.length === 0) continue;
        if (!pageBoundaries.has(legs[0].startBeat)) {
            errors.push(`${track.id} must start on a page boundary`);
        }
        if (!pageBoundaries.has(legs[legs.length - 1].endBeat)) {
            errors.push(`${track.id} must end on a page boundary`);
        }
        for (let index = 0; index < legs.length; index++) {
            const leg = legs[index];
            if (leg.startBeat < 0 || leg.endBeat > model.beatCount) {
                errors.push(`${leg.id} is outside the timeline`);
            }
            if (leg.endBeat <= leg.startBeat) {
                errors.push(`${leg.id} must have a positive span`);
            }
            if (index > 0 && legs[index - 1].endBeat !== leg.startBeat) {
                errors.push(`${track.id} legs must be contiguous`);
            }
        }
    }
    return errors;
};
