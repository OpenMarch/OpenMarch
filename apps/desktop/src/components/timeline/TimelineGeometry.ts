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

/**
 * The page and measure.count under a beat. `pageLabel`, when given, names the page instead: the
 * app passes the selected page while paused, because the paused cursor sits on that page's end
 * beat, which is also the next page's first beat.
 */
export const getFrameContext = (
    model: Pick<TimelineViewModel, "pages" | "measures" | "beatCount">,
    positionBeat: BeatPosition,
    pageLabel?: string,
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
        pageLabel: pageLabel ?? page?.label ?? "—",
        measureAndCount: `m${measureLabel}.${count}`,
    };
};

export const getPlayheadLabel = (
    model: Pick<TimelineViewModel, "pages" | "measures" | "beatCount">,
    positionBeat: BeatPosition,
    pageLabel?: string,
) => {
    const context = getFrameContext(model, positionBeat, pageLabel);
    return `Pg ${context.pageLabel} · ${context.measureAndCount}`;
};

/**
 * How close, in pixels, a dragged boundary must come to a page line to snap to it (ui.md UI-2).
 * Farther away, the boundary rounds to the nearest whole beat.
 */
export const TIMELINE_PAGE_SNAP_PX = 24;

/**
 * The beat boundaries that drags snap to: the start of every timed page and the end of the show,
 * ascending and without duplicates.
 */
export const getPageSnapBeats = (
    model: Pick<TimelineViewModel, "pages" | "beatCount">,
): number[] =>
    [
        ...new Set([
            ...model.pages
                .filter((page) => !page.isInitial)
                .map((page) => page.atBeat),
            model.beatCount,
        ]),
    ].sort((a, b) => a - b);

/**
 * Whether a pointer event turns page snapping off for this step of a drag. Holding Alt (Option on
 * macOS) places boundaries on any whole beat.
 */
export const isPageSnapDisabled = (event: { readonly altKey: boolean }) =>
    event.altKey;

const nearestSnapBeat = (
    beat: BeatPosition,
    snapBeats: readonly number[],
): number | null => {
    let nearest: number | null = null;
    for (const candidate of snapBeats) {
        if (
            nearest === null ||
            Math.abs(candidate - beat) < Math.abs(nearest - beat)
        )
            nearest = candidate;
    }
    return nearest;
};

/**
 * Turns a dragged boundary at a fractional beat into a whole beat. It lands on the nearest page
 * line when that line is within `thresholdPx`, and otherwise on the nearest beat. Pass no
 * `snapBeats` to turn snapping off.
 */
export const snapBoundary = ({
    beat,
    snapBeats,
    pixelsPerBeat,
    thresholdPx = TIMELINE_PAGE_SNAP_PX,
}: {
    beat: BeatPosition;
    snapBeats: readonly number[];
    pixelsPerBeat: number;
    thresholdPx?: number;
}): number => {
    const line = nearestSnapBeat(beat, snapBeats);
    if (line !== null && Math.abs(line - beat) * pixelsPerBeat <= thresholdPx)
        return line;
    return Math.round(beat);
};

/**
 * Turns a dragged move of a whole range (a clip) by a fractional number of beats into a whole-beat
 * offset. When either edge comes within `thresholdPx` of a page line, the range moves so that the
 * closer edge sits on its line; otherwise the offset rounds to the nearest beat. The caller clamps
 * the result to the show. Pass no `snapBeats` to turn snapping off.
 */
export const snapRangeOffset = ({
    range,
    offset,
    snapBeats,
    pixelsPerBeat,
    thresholdPx = TIMELINE_PAGE_SNAP_PX,
}: {
    range: TimelineBeatRange;
    offset: number;
    snapBeats: readonly number[];
    pixelsPerBeat: number;
    thresholdPx?: number;
}): number => {
    let best: { offset: number; distancePx: number } | null = null;
    for (const edge of [range.startBeatIndex, range.endBeatIndex]) {
        const moved = edge + offset;
        const line = nearestSnapBeat(moved, snapBeats);
        if (line === null) continue;
        const distancePx = Math.abs(line - moved) * pixelsPerBeat;
        if (
            distancePx <= thresholdPx &&
            (best === null || distancePx < best.distancePx)
        )
            best = { offset: line - edge, distancePx };
    }
    return best ? best.offset : Math.round(offset);
};

/**
 * Checks the view model's structural rules. A track may start and end on any beat (ui.md UI-2);
 * page lines are only a snapping aid, so 0.2's page-boundary rule is gone.
 */
export const validateTimelineViewModel = (
    model: TimelineViewModel,
): string[] => {
    const errors: string[] = [];

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
