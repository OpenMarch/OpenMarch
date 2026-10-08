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
        // The last page ends at its own flag, which can be before the end of the beats
        endBeatIndex:
            ordered[index + 1]?.atBeat ?? ordered[index].endBeat ?? beatCount,
    };
};

/** The selected range, or null for home and nothing. */
export const getSelectionRange = (
    selection: TimelineSelection | undefined,
): TimelineBeatRange | null =>
    selection?.kind === "range" ? selection.range : null;

export const sameRange = (
    a: TimelineBeatRange | null | undefined,
    b: TimelineBeatRange | null | undefined,
) =>
    a != null &&
    b != null &&
    a.startBeatIndex === b.startBeatIndex &&
    a.endBeatIndex === b.endBeatIndex;

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

/** A horizontal span of a layer, in CSS pixels from the layer's left edge */
export interface TimelineSpan {
    readonly left: number;
    readonly width: number;
}

/**
 * Where a canvas window's left edge may sit, in CSS pixels. At any device pixel ratio that is a
 * multiple of 1/8 (1, 1.25, 1.5, 2...), a multiple of 8 is a whole number of device pixels, so the
 * window's pixels line up with the layer's and lines stay crisp.
 */
export const TIMELINE_CANVAS_ALIGN_PX = 8;

/**
 * The part of a show-wide layer that a viewport-sized canvas draws: what the viewport shows of the
 * layer, plus `overscan` on either side so a short scroll needs no redraw, kept inside the layer.
 * A layer no wider than that is drawn whole, from 0.
 *
 * @param layerWidth the layer's full width (the whole show)
 * @param visibleLeft where the viewport's left edge is, from the layer's left edge
 * @param visibleWidth the viewport's width
 */
export const getCanvasWindow = ({
    layerWidth,
    visibleLeft,
    visibleWidth,
    overscan,
    align = TIMELINE_CANVAS_ALIGN_PX,
}: {
    layerWidth: number;
    visibleLeft: number;
    visibleWidth: number;
    overscan: number;
    align?: number;
}): TimelineSpan => {
    if (!(layerWidth > 0)) return { left: 0, width: 0 };
    const wanted = Math.max(0, visibleWidth) + 2 * Math.max(0, overscan);
    if (wanted >= layerWidth) return { left: 0, width: layerWidth };
    const ideal = clamp(visibleLeft - overscan, 0, layerWidth - wanted);
    const left = Math.floor(ideal / align) * align;
    const width = Math.min(
        Math.ceil((ideal - left + wanted) / align) * align,
        layerWidth - left,
    );
    return { left, width };
};

/**
 * Whether a drawn window still holds everything the viewport shows of the layer, and `margin`
 * pixels more either side (within the layer), so a scroll that lands a frame before the redraw
 * (an edge-scroll in an animation frame, a fast scrollbar drag) still finds pixels drawn
 */
export const canvasWindowCovers = (
    drawn: TimelineSpan,
    {
        layerWidth,
        visibleLeft,
        visibleWidth,
    }: { layerWidth: number; visibleLeft: number; visibleWidth: number },
    margin = 0,
) => {
    const from = clamp(visibleLeft - margin, 0, layerWidth);
    const to = clamp(visibleLeft + visibleWidth + margin, 0, layerWidth);
    return from >= drawn.left && to <= drawn.left + drawn.width;
};

/**
 * The whole beats whose lines (at `Math.round(beat * pixelsPerBeat)`, 1px wide) can fall inside
 * `span`, as an inclusive range clamped to `[0, lastBeat]`. Empty when `first > last`.
 */
export const getBeatsInSpan = (
    span: TimelineSpan,
    pixelsPerBeat: number,
    lastBeat: number,
) => ({
    first: Math.max(0, Math.floor((span.left - 1) / pixelsPerBeat)),
    last: Math.min(
        lastBeat,
        Math.ceil((span.left + span.width + 1) / pixelsPerBeat),
    ),
});

export const filterMarkersByMinimumSpacing = <T extends TimelineMarker>(
    markers: readonly T[],
    pixelsPerBeat: number,
    minimumSpacingPx = 32,
): T[] => {
    const ordered = [...markers].sort((a, b) => a.atBeat - b.atBeat);
    let lastVisibleX = Number.NEGATIVE_INFINITY;

    return ordered.filter((marker) => {
        const markerX = marker.atBeat * pixelsPerBeat;
        if (markerX - lastVisibleX < minimumSpacingPx) return false;
        lastVisibleX = markerX;
        return true;
    });
};

/**
 * The beat under a pointer, fractional, from 0 to `beatCount`: the end of the show is a place the
 * playhead rests (UI-11), so a scrub reaches it as the ruler's does.
 */
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
        Math.max(beatCount, 0),
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
 * The measure and its beat under a position, counted from the measure's downbeat (beat 1), or
 * null when the show has no measure there.
 */
export const getMeasureAt = (
    model: Pick<TimelineViewModel, "measures" | "beatCount">,
    positionBeat: BeatPosition,
): { readonly measure: string; readonly beat: number } | null => {
    const beat = clamp(
        Math.floor(positionBeat),
        0,
        Math.max(model.beatCount - 1, 0),
    );
    const measure = latestMarkerAt(model.measures, beat);
    if (!measure) return null;
    return {
        measure: measure.label.replace(/^m/i, ""),
        beat: beat - measure.atBeat + 1,
    };
};

/**
 * The page and count at a playhead, counted as designers count them (UI-12): a page's counts run
 * from 1 on the beat after the previous flag to N on its own flag, so the playhead on page 3's
 * flag is "Pg 3, count 8". Home (before the first timed page) is the initial page, count 0.
 */
export const getPageCountAt = (
    model: Pick<TimelineViewModel, "pages">,
    positionBeat: BeatPosition,
): {
    readonly pageLabel: string;
    readonly count: number;
    /** The page's counts, when it has a flag (UI-13) */
    readonly total?: number;
    /** The beat before the page's count 1, when it has a flag (UI-13) */
    readonly startBeat?: number;
    /** Past the last flag: `count` is how far past it */
    readonly after?: boolean;
    /** At home, before the first timed page (UI-13) */
    readonly home?: boolean;
} => {
    const beat = Math.round(positionBeat);
    const timed = model.pages
        .filter((page) => !page.isInitial)
        .sort((a, b) => a.atBeat - b.atBeat);
    // A page's flag is its end beat, or else the next page's first beat
    const endOf = (index: number) =>
        timed[index].endBeat ??
        timed[index + 1]?.atBeat ??
        Number.POSITIVE_INFINITY;
    const index = timed.findIndex(
        (p, i) => p.atBeat < beat && beat <= endOf(i),
    );
    if (index >= 0) {
        const page = timed[index];
        const end = endOf(index);
        return {
            pageLabel: page.label,
            count: beat - page.atBeat,
            startBeat: page.atBeat,
            ...(Number.isFinite(end) ? { total: end - page.atBeat } : {}),
        };
    }
    const initial = model.pages.find((p) => p.isInitial);
    const last = timed[timed.length - 1];
    if (last && beat > endOf(timed.length - 1))
        return {
            pageLabel: last.label,
            count: beat - endOf(timed.length - 1),
            after: true,
        };
    return {
        pageLabel: initial?.label ?? timed[0]?.label ?? "—",
        count: 0,
        home: true,
    };
};

/**
 * The playhead's page, count and measure, as the transport shows them (UI-13): "Pg 2 · ct 7/16"
 * and "m4 beat 4", or "Home", or "After pg 4 · +4". `spoken` spells them out for screen readers.
 * `measure` is null when the show has no measure there.
 */
export const getPlayheadReadout = (
    model: Pick<TimelineViewModel, "pages" | "measures" | "beatCount">,
    positionBeat: BeatPosition,
) => {
    const at = getPageCountAt(model, positionBeat);
    const measureAt = at.home ? null : getMeasureAt(model, positionBeat);
    const page = at.home
        ? "Home"
        : at.after
          ? `After pg ${at.pageLabel} · +${at.count}`
          : `Pg ${at.pageLabel} · ct ${at.count}${at.total != null ? `/${at.total}` : ""}`;
    const measure = measureAt
        ? `m${measureAt.measure} beat ${measureAt.beat}`
        : null;
    const spokenPage = at.home
        ? `Home, page ${at.pageLabel}`
        : at.after
          ? `${at.count} counts after page ${at.pageLabel}`
          : `Page ${at.pageLabel}, count ${at.count}${at.total != null ? ` of ${at.total}` : ""}`;
    const spoken = measureAt
        ? `${spokenPage}, measure ${measureAt.measure} beat ${measureAt.beat}`
        : spokenPage;
    return { page, measure, spoken };
};

/** The playhead's position in one line, as the transport's readout shows it (UI-13) */
export const getPlayheadLabel = (
    model: Pick<TimelineViewModel, "pages" | "measures" | "beatCount">,
    positionBeat: BeatPosition,
) => {
    const readout = getPlayheadReadout(model, positionBeat);
    return readout.measure
        ? `${readout.page} · ${readout.measure}`
        : readout.page;
};

/**
 * The window's count badge (UI-13), in the field line's words: "counts 3–6" inside one page box,
 * counted to that page's flag, or "12 counts" when it passes a flag.
 */
export const getWindowCountLabel = (
    model: Pick<TimelineViewModel, "pages">,
    range: { readonly startBeatIndex: number; readonly endBeatIndex: number },
) => {
    const length = range.endBeatIndex - range.startBeatIndex;
    const at = getPageCountAt(model, range.endBeatIndex);
    if (
        length > 0 &&
        !at.home &&
        !at.after &&
        at.startBeat != null &&
        range.startBeatIndex >= at.startBeat
    ) {
        const first = range.startBeatIndex - at.startBeat + 1;
        return first === at.count
            ? `count ${first}`
            : `counts ${first}–${at.count}`;
    }
    return length === 1 ? "1 count" : `${length} counts`;
};

/**
 * The page counts to number along a page box at a zoom (UI-13): every `step`th count from the
 * page's start, with `step` doubling until the numbers fit, and always the flag's count. A number
 * too close to the flag's gives way to it.
 */
export const getVisiblePageCounts = (
    total: number,
    pixelsPerBeat: number,
): number[] => {
    if (total <= 0 || pixelsPerBeat <= 0) return [];
    // A number takes about 6px a digit at 10px mono, plus room either side
    const minimumPx = String(total).length * 6 + 6;
    if (total * pixelsPerBeat < minimumPx) return [];
    let step = 1;
    while (step * pixelsPerBeat < minimumPx) step *= 2;
    const counts: number[] = [];
    for (let count = step; count < total; count += step)
        if ((total - count) * pixelsPerBeat >= minimumPx) counts.push(count);
    counts.push(total);
    return counts;
};

/**
 * How close, in pixels, a dragged boundary must come to a page line to snap to it (ui.md UI-2).
 * Farther away, the boundary rounds to the nearest whole beat.
 */
export const TIMELINE_PAGE_SNAP_PX = 24;

/**
 * The beat boundaries that drags snap to: the start and flag (`endBeat`) of every timed page and
 * the end of the show, ascending and without duplicates.
 */
export const getPageSnapBeats = (
    model: Pick<TimelineViewModel, "pages" | "beatCount">,
): number[] =>
    [
        ...new Set([
            ...model.pages
                .filter((page) => !page.isInitial)
                .flatMap((page) =>
                    page.endBeat === undefined
                        ? [page.atBeat]
                        : [page.atBeat, page.endBeat],
                ),
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

/** Where the transport's go-to box sends the playhead (UI-12) */
export type TimelineGoTo =
    | { readonly kind: "page"; readonly pageId: TimelinePageMarker["id"] }
    | { readonly kind: "beat"; readonly beat: BeatPosition };

/**
 * Reads what a designer types in the transport's go-to box (UI-12), on the view axis:
 * - "m23" or "m23.3": measure 23 (count 3 of it, which must be one the measure has);
 * - "p7", "pg 7" or "page 7": page 7;
 * - "C": rehearsal mark C (letters match marks first);
 * - "7" or "2A": the page with that name.
 * Case and spaces don't matter. `null` when nothing matches.
 */
export const parseTimelineGoTo = (
    text: string,
    model: Pick<TimelineViewModel, "beatCount" | "pages" | "measures">,
): TimelineGoTo | null => {
    const typed = text.trim().toLowerCase().replace(/\s+/g, "");
    if (!typed) return null;
    const measureName = (label: string) =>
        label.replace(/^m/i, "").toLowerCase();
    const measure = typed.match(/^m(\d+)(?:[.:](\d+))?$/);
    if (measure) {
        const sorted = [...model.measures].sort((a, b) => a.atBeat - b.atBeat);
        const index = sorted.findIndex(
            (m) => measureName(m.label) === measure[1],
        );
        if (index < 0) return null;
        const start = sorted[index]!.atBeat;
        // The measure runs to the next one, or the last to the show's end
        const length = (sorted[index + 1]?.atBeat ?? model.beatCount) - start;
        const count = measure[2] ? Number(measure[2]) : 1;
        // A count the measure doesn't have is a miss, not a guess (m23.0, m23.9 in 4/4)
        if (count < 1 || count > length) return null;
        return { kind: "beat", beat: start + count - 1 };
    }
    const pageOf = (name: string) =>
        model.pages.find((p) => String(p.label).toLowerCase() === name);
    const prefixed = typed.match(/^(?:page|pg|p)(.+)$/);
    if (prefixed) {
        const page = pageOf(prefixed[1]!);
        if (page) return { kind: "page", pageId: page.id };
    }
    const mark = model.measures.find(
        (m) => m.rehearsalMark?.trim().toLowerCase() === typed,
    );
    if (mark) return { kind: "beat", beat: mark.atBeat };
    const page = pageOf(typed);
    return page ? { kind: "page", pageId: page.id } : null;
};
