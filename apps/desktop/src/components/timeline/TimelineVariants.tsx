import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TimelineGridCanvas, TimelineWaveformCanvas } from "./TimelineCanvas";
import {
    clamp,
    getSelectionRange,
    packTimelineTracks,
} from "./TimelineGeometry";
import {
    TIMELINE_MAX_PX_PER_BEAT,
    TIMELINE_INITIAL_PAGE_WIDTH,
    TIMELINE_MIN_PX_PER_BEAT,
    TimelinePageLines,
    TimelinePlayhead,
    TimelinePlayheadDetail,
    TimelineRehearsalMarkers,
    TimelineRuler,
    TimelineSelectionRange,
    type TimelineSelectionInteraction,
    TimelineShell,
    TimelineTrackClip,
    TimelineTransport,
    useTimelinePointer,
} from "./TimelinePrimitives";
import type {
    TimelineCommonProps,
    TimelineNavigation,
    TimelineSelection,
} from "./TimelineViewModel";

type TimelineDensity = "expanded" | "collapsed";

const useTimelineZoom = ({
    viewportRef,
    pixelsPerBeat,
    beatCount,
    leadingInset,
    onPixelsPerBeatChange,
}: {
    viewportRef: React.RefObject<HTMLDivElement | null>;
    pixelsPerBeat: number;
    beatCount: number;
    leadingInset: number;
    onPixelsPerBeatChange?: (pixelsPerBeat: number) => void;
}) => {
    const updateZoom = useCallback(
        (nextPixelsPerBeat: number) => {
            const viewport = viewportRef.current;
            const next = clamp(
                nextPixelsPerBeat,
                TIMELINE_MIN_PX_PER_BEAT,
                TIMELINE_MAX_PX_PER_BEAT,
            );
            if (!viewport || !onPixelsPerBeatChange) return;
            const centerBeat =
                (viewport.scrollLeft +
                    viewport.clientWidth / 2 -
                    leadingInset) /
                pixelsPerBeat;
            onPixelsPerBeatChange(next);
            requestAnimationFrame(() => {
                viewport.scrollLeft = Math.max(
                    0,
                    leadingInset + centerBeat * next - viewport.clientWidth / 2,
                );
            });
        },
        [leadingInset, onPixelsPerBeatChange, pixelsPerBeat, viewportRef],
    );

    const fit = useCallback(() => {
        const viewport = viewportRef.current;
        if (!viewport || !onPixelsPerBeatChange || beatCount <= 0) return;
        onPixelsPerBeatChange(
            clamp(
                Math.max(0, viewport.clientWidth - leadingInset) / beatCount,
                TIMELINE_MIN_PX_PER_BEAT,
                TIMELINE_MAX_PX_PER_BEAT,
            ),
        );
        requestAnimationFrame(() => {
            viewport.scrollLeft = 0;
        });
    }, [beatCount, leadingInset, onPixelsPerBeatChange, viewportRef]);

    return {
        zoomOut: () => updateZoom(pixelsPerBeat / 1.25),
        zoomIn: () => updateZoom(pixelsPerBeat * 1.25),
        fit,
    };
};

const navigateToPage = ({
    direction,
    currentBeat,
    pages,
}: {
    direction: TimelineNavigation;
    currentBeat: number;
    pages: TimelineCommonProps["model"]["pages"];
}) => {
    if (pages.length === 0) return 0;
    const timedPages = pages.filter((page) => !page.isInitial);
    const ordered = [...(timedPages.length > 0 ? timedPages : pages)].sort(
        (a, b) => a.atBeat - b.atBeat,
    );
    if (direction === "first-page") return ordered[0].atBeat;
    if (direction === "last-page") return ordered[ordered.length - 1].atBeat;
    if (direction === "previous-page") {
        return (
            [...ordered].reverse().find((page) => page.atBeat < currentBeat)
                ?.atBeat ?? ordered[0].atBeat
        );
    }
    return (
        ordered.find((page) => page.atBeat > currentBeat)?.atBeat ??
        ordered[ordered.length - 1].atBeat
    );
};

const transportNavigation = (props: TimelineCommonProps) =>
    props.onNavigate ??
    (props.onSeek
        ? (direction: TimelineNavigation) =>
              props.onSeek?.(
                  navigateToPage({
                      direction,
                      currentBeat: props.positionBeat,
                      pages: props.model.pages,
                  }),
              )
        : undefined);

function TimelineSurface({
    density,
    ...props
}: TimelineCommonProps & { density: TimelineDensity }) {
    const {
        model,
        pixelsPerBeat,
        positionBeat,
        selection,
        selectedTarget,
        showTransport = true,
        className,
    } = props;
    const expanded = density === "expanded";
    const viewportRef = useRef<HTMLDivElement>(null);
    const playheadRef = useRef<HTMLButtonElement>(null);
    const [playheadHovered, setPlayheadHovered] = useState(false);
    const [playheadFocused, setPlayheadFocused] = useState(false);
    const rows = useMemo(
        () => packTimelineTracks(model.tracks),
        [model.tracks],
    );
    const width = model.beatCount * pixelsPerBeat;
    const initialPageWidth = model.pages.some((page) => page.isInitial)
        ? TIMELINE_INITIAL_PAGE_WIDTH
        : 0;
    const surfaceWidth = width + initialPageWidth;
    const trackTop = 54;
    const rowPitch = expanded ? 22 : 5;
    const trackHeight = expanded ? 14 : 3;
    const trackBandHeight = Math.max(rows.length, 1) * rowPitch;
    const waveformHeight = expanded ? 32 : 22;
    const audioTop = trackTop + trackBandHeight + (expanded ? 4 : 2);
    const timelineHeight = audioTop + waveformHeight + 4;
    const selectionRange = getSelectionRange(selection, model);
    const [selectionInteraction, setSelectionInteraction] =
        useState<TimelineSelectionInteraction | null>(null);
    const selectionIdentity =
        selection?.kind === "page"
            ? `page:${String(selection.pageId)}`
            : selection?.kind === "track"
              ? `track:${String(selection.trackId)}`
              : (selection?.kind ?? "none");
    useEffect(() => {
        setSelectionInteraction(null);
    }, [
        selectionIdentity,
        selectionRange?.endBeatIndex,
        selectionRange?.startBeatIndex,
    ]);
    const displayedSelectionRange = selectionRange
        ? (selectionInteraction?.range ?? selectionRange)
        : null;
    const selectionDragging = selectionInteraction?.dragging ?? false;
    const countFollowsStart =
        selectionDragging && selectionInteraction?.activeHandle === "start";
    const countRendersToLeft = displayedSelectionRange
        ? countFollowsStart
            ? displayedSelectionRange.startBeatIndex > 0
            : displayedSelectionRange.endBeatIndex >= model.beatCount
        : false;
    const zoom = useTimelineZoom({
        viewportRef,
        pixelsPerBeat,
        beatCount: model.beatCount,
        leadingInset: initialPageWidth,
        onPixelsPerBeatChange: props.onPixelsPerBeatChange,
    });
    const pointer = useTimelinePointer({
        onSeek: props.onSeek,
        pixelsPerBeat,
        beatCount: model.beatCount,
    });
    const onSelectionChange = (next: TimelineSelection) => {
        if (next?.kind === "page") {
            const page = model.pages.find((item) => item.id === next.pageId);
            if (page) props.onSeek?.(page.atBeat);
        }
        props.onSelectionChange?.(next);
    };
    const showCreateTrack =
        selection?.kind === "range" &&
        selectedTarget != null &&
        selectionRange != null &&
        props.onCreateTrack != null &&
        !selectionDragging;
    const showPlayheadDetail =
        playheadHovered || playheadFocused || pointer.isDragging;
    const transportProps = {
        ...props,
        onNavigate: transportNavigation(props),
    };

    return (
        <TimelineShell
            viewportRef={viewportRef}
            className={className}
            transport={
                showTransport ? (
                    <TimelineTransport
                        model={model}
                        positionBeat={positionBeat}
                        isPlaying={transportProps.isPlaying}
                        onPlayingChange={transportProps.onPlayingChange}
                        onNavigate={transportProps.onNavigate}
                        onZoomOut={
                            expanded && props.onPixelsPerBeatChange
                                ? zoom.zoomOut
                                : undefined
                        }
                        onZoomIn={
                            expanded && props.onPixelsPerBeatChange
                                ? zoom.zoomIn
                                : undefined
                        }
                        onFit={
                            expanded && props.onPixelsPerBeatChange
                                ? zoom.fit
                                : undefined
                        }
                        showZoom={expanded}
                    />
                ) : undefined
            }
        >
            <div
                className="relative"
                style={{ width: surfaceWidth, height: timelineHeight }}
            >
                <div
                    {...pointer.pointerHandlers}
                    data-testid="timeline-pointer-surface"
                    className="absolute top-0 touch-none"
                    style={{
                        left: initialPageWidth,
                        width,
                        height: timelineHeight,
                    }}
                >
                    <TimelineGridCanvas
                        width={width}
                        height={timelineHeight}
                        pixelsPerBeat={pixelsPerBeat}
                        measures={model.measures}
                        lineTop={28}
                        topTickY={34}
                        bottomTickY={timelineHeight - 1}
                    />
                    <TimelinePageLines
                        pages={model.pages}
                        pixelsPerBeat={pixelsPerBeat}
                        height={timelineHeight}
                    />
                    <TimelineRuler
                        pages={model.pages}
                        measures={model.measures}
                        beatCount={model.beatCount}
                        pixelsPerBeat={pixelsPerBeat}
                        selection={selection}
                        onSelectionChange={onSelectionChange}
                        initialPageWidth={initialPageWidth}
                    />
                    {rows.flatMap((row, rowIndex) =>
                        row.map((track) => (
                            <TimelineTrackClip
                                key={track.id}
                                track={track}
                                pixelsPerBeat={pixelsPerBeat}
                                top={trackTop + rowIndex * rowPitch}
                                height={trackHeight}
                                selected={
                                    selection?.kind === "track" &&
                                    selection.trackId === track.id
                                }
                                onSelect={(trackId) =>
                                    onSelectionChange({
                                        kind: "track",
                                        trackId,
                                    })
                                }
                                onRangeCommit={props.onTimelineRangeCommit}
                                beatCount={model.beatCount}
                                micro={!expanded}
                            />
                        )),
                    )}
                    <div
                        className="bg-bg-1/40 rounded-4 absolute left-0 overflow-hidden"
                        style={{
                            top: audioTop,
                            width,
                            height: waveformHeight,
                        }}
                    >
                        <TimelineWaveformCanvas
                            waveform={model.waveform}
                            width={width}
                            height={waveformHeight}
                            pixelsPerBeat={pixelsPerBeat}
                            positionBeat={positionBeat}
                        />
                    </div>
                    <TimelineRehearsalMarkers
                        model={model}
                        pixelsPerBeat={pixelsPerBeat}
                        top={audioTop + (waveformHeight - 22) / 2}
                        onSeek={props.onSeek}
                    />
                    <TimelinePlayhead
                        model={model}
                        positionBeat={positionBeat}
                        pixelsPerBeat={pixelsPerBeat}
                        height={timelineHeight}
                        beatCount={model.beatCount}
                        anchorRef={playheadRef}
                        onHoverChange={setPlayheadHovered}
                        onFocusChange={setPlayheadFocused}
                        onSeek={props.onSeek}
                    />
                    <TimelinePlayheadDetail
                        model={model}
                        positionBeat={positionBeat}
                        pixelsPerBeat={pixelsPerBeat}
                        height={timelineHeight}
                        anchorRef={playheadRef}
                        visible={showPlayheadDetail}
                    />
                    {selectionRange && (
                        <TimelineSelectionRange
                            range={selectionRange}
                            beatCount={model.beatCount}
                            pixelsPerBeat={pixelsPerBeat}
                            height={timelineHeight}
                            onCommit={
                                props.onSelectionChange
                                    ? (range) =>
                                          props.onSelectionChange?.({
                                              kind: "range",
                                              range,
                                          })
                                    : undefined
                            }
                            onInteractionChange={setSelectionInteraction}
                        />
                    )}
                    {displayedSelectionRange && (
                        <div
                            data-testid="timeline-selection-actions"
                            className="absolute z-40 flex flex-col gap-4"
                            style={{
                                left:
                                    (countFollowsStart
                                        ? displayedSelectionRange.startBeatIndex
                                        : displayedSelectionRange.endBeatIndex) *
                                        pixelsPerBeat +
                                    (countRendersToLeft ? -6 : 6),
                                top: 31,
                                alignItems: countRendersToLeft
                                    ? "flex-end"
                                    : "flex-start",
                                transform: countRendersToLeft
                                    ? "translateX(-100%)"
                                    : undefined,
                            }}
                        >
                            <span
                                data-testid="timeline-selection-count"
                                className="border-stroke bg-bg-1 text-text rounded-6 border px-8 py-4 font-mono text-[10px] whitespace-nowrap"
                            >
                                {displayedSelectionRange.endBeatIndex -
                                    displayedSelectionRange.startBeatIndex}{" "}
                                counts
                            </span>
                            {showCreateTrack && selectedTarget && (
                                <button
                                    type="button"
                                    data-timeline-interactive="true"
                                    onClick={() =>
                                        props.onCreateTrack?.({
                                            target: selectedTarget,
                                            range: displayedSelectionRange,
                                        })
                                    }
                                    className="bg-accent text-text-invert rounded-full px-8 py-3 text-[11px] leading-none whitespace-nowrap"
                                >
                                    Create Track
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </TimelineShell>
    );
}

export function ExpandedTimeline(props: TimelineCommonProps) {
    return <TimelineSurface {...props} density="expanded" />;
}

export function CollapsedTimeline(props: TimelineCommonProps) {
    return <TimelineSurface {...props} density="collapsed" />;
}
