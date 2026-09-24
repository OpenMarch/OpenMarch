import type {
    BeatPosition,
    TimelineBeatRange,
    TimelineMarker,
    TimelinePageMarker,
    TimelineSelection,
    TimelineTrack,
    TimelineViewModel,
} from "./TimelineViewModel";

export const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

export const getTrackRange = (
    track: TimelineTrack,
): TimelineBeatRange | null => {
    if (track.legs.length === 0) return null;
    return {
        startBeatIndex: Math.min(...track.legs.map((leg) => leg.startBeat)),
        endBeatIndex: Math.max(...track.legs.map((leg) => leg.endBeat)),
    };
};

export const getPageRange = ({
    pages,
    pageId,
    beatCount,
}: {
    pages: readonly TimelinePageMarker[];
    pageId: string | number;
    beatCount: number;
}): TimelineBeatRange | null => {
    const requestedPage = pages.find((page) => page.id === pageId);
    if (!requestedPage || requestedPage.isInitial) return null;
    const ordered = pages
        .filter((page) => !page.isInitial)
        .sort((a, b) => a.atBeat - b.atBeat);
    const index = ordered.findIndex((page) => page.id === pageId);
    if (index < 0) return null;
    return {
        startBeatIndex: ordered[index].atBeat,
        endBeatIndex: ordered[index + 1]?.atBeat ?? beatCount,
    };
};

export const getSelectionRange = (
    selection: TimelineSelection | undefined,
    model: Pick<TimelineViewModel, "beatCount" | "pages" | "tracks">,
): TimelineBeatRange | null => {
    if (!selection) return null;
    if (selection.kind === "range") return selection.range;
    if (selection.kind === "page") {
        return getPageRange({
            pages: model.pages,
            pageId: selection.pageId,
            beatCount: model.beatCount,
        });
    }
    const track = model.tracks.find(
        (candidate) => candidate.id === selection.trackId,
    );
    return track ? getTrackRange(track) : null;
};

export const rangesOverlap = (a: TimelineBeatRange, b: TimelineBeatRange) =>
    a.startBeatIndex < b.endBeatIndex && b.startBeatIndex < a.endBeatIndex;

/** Stable interval packing. Touching tracks may share a row. */
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
                range: TimelineBeatRange;
            } => item.range !== null,
        )
        .sort(
            (a, b) =>
                a.range.startBeatIndex - b.range.startBeatIndex ||
                a.index - b.index,
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

export const filterMarkersByMinimumSpacing = (
    markers: readonly TimelineMarker[],
    pixelsPerBeat: number,
    minimumSpacingPx = 32,
) => {
    const ordered = [...markers].sort((a, b) => a.atBeat - b.atBeat);
    let lastVisibleX = Number.NEGATIVE_INFINITY;

    return ordered.filter((marker) => {
        const markerX = marker.atBeat * pixelsPerBeat;
        if (markerX - lastVisibleX < minimumSpacingPx) return false;
        lastVisibleX = markerX;
        return true;
    });
};

export const clientXToBeat = ({
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
        startBeat + (clientX - surfaceLeft) / pixelsPerBeat,
        0,
        Math.max(beatCount - 1, 0),
    );

export const clientXToNearestBeat = (
    args: Parameters<typeof clientXToBeat>[0],
) => Math.round(clientXToBeat(args));

export const clientXToNearestBoundary = ({
    clientX,
    surfaceLeft,
    pixelsPerBeat,
    startBeat,
    beatCount,
}: Parameters<typeof clientXToBeat>[0]) =>
    clamp(
        Math.round(startBeat + (clientX - surfaceLeft) / pixelsPerBeat),
        0,
        beatCount,
    );

const latestMarkerAt = (
    markers: readonly TimelineMarker[],
    beat: BeatPosition,
) =>
    markers
        .filter((marker) => marker.atBeat <= beat)
        .sort((a, b) => b.atBeat - a.atBeat)[0];

export const getFrameContext = (
    model: Pick<TimelineViewModel, "pages" | "measures" | "beatCount">,
    positionBeat: BeatPosition,
) => {
    const beat = clamp(
        Math.floor(positionBeat),
        0,
        Math.max(model.beatCount - 1, 0),
    );
    const timedPages = model.pages.filter((page) => !page.isInitial);
    const page = latestMarkerAt(
        timedPages.length > 0 ? timedPages : model.pages,
        beat,
    );
    const measure = latestMarkerAt(model.measures, beat);
    const count = measure ? beat - measure.atBeat + 1 : beat + 1;
    const measureLabel = measure?.label.replace(/^m/i, "") ?? "—";
    return {
        pageLabel: page?.label ?? "—",
        measureAndCount: `m${measureLabel}.${count}`,
    };
};

export const getPlayheadLabel = (
    model: Pick<TimelineViewModel, "pages" | "measures" | "beatCount">,
    positionBeat: BeatPosition,
) => {
    const context = getFrameContext(model, positionBeat);
    return `Pg ${context.pageLabel} · ${context.measureAndCount}`;
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
        const range = getTrackRange(track);
        if (!range) continue;
        if (!pageBoundaries.has(range.startBeatIndex)) {
            errors.push(`${track.id} must start on a page boundary`);
        }
        if (!pageBoundaries.has(range.endBeatIndex)) {
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

        const activity = [...track.activitySpans].sort(
            (a, b) => a.startBeatIndex - b.startBeatIndex,
        );
        if (
            activity.length === 0 ||
            activity[0].startBeatIndex !== range.startBeatIndex ||
            activity[activity.length - 1].endBeatIndex !== range.endBeatIndex
        ) {
            errors.push(`${track.id} activity must cover its complete range`);
            continue;
        }
        for (let index = 0; index < activity.length; index++) {
            const span = activity[index];
            if (span.endBeatIndex <= span.startBeatIndex) {
                errors.push(`${track.id} activity spans must be positive`);
            }
            if (index > 0) {
                const previous = activity[index - 1];
                if (previous.endBeatIndex !== span.startBeatIndex) {
                    errors.push(
                        `${track.id} activity must not have gaps or overlaps`,
                    );
                }
                if (previous.active === span.active) {
                    errors.push(
                        `${track.id} adjacent activity spans must be normalized`,
                    );
                }
            }
        }
    }
    return errors;
};
