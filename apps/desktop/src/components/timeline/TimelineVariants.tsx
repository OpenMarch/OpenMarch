import { PlusIcon } from "@phosphor-icons/react";
import {
    type ReactNode,
    type RefObject,
    useCallback,
    useMemo,
    useRef,
} from "react";
import { TimelineGridCanvas, TimelineWaveformCanvas } from "./TimelineCanvas";
import {
    clamp,
    getInspectorRange,
    packTimelineTracks,
} from "./TimelineGeometry";
import {
    TIMELINE_MAX_PX_PER_BEAT,
    TIMELINE_MIN_PX_PER_BEAT,
    TimelinePlayhead,
    TimelinePageLines,
    TimelineRuler,
    TimelineShell,
    TimelineTrackClip,
    TimelineTransport,
    TimelineWorkspaceFlags,
    useElementWidth,
    useTimelineScrubbing,
} from "./TimelinePrimitives";
import type {
    TimelineCommonProps,
    TimelineNavigation,
    TimelineTrackId,
} from "./TimelineViewModel";

const PANEL_PADDING = 16;

const TimelineLabels = ({
    items,
}: {
    items: readonly { label: ReactNode; top: number }[];
}) => (
    <>
        {items.map(({ label, top }, index) => (
            <span
                key={`${top}-${index}`}
                className="text-sub text-text-subtitle absolute left-0 leading-none"
                style={{ top }}
            >
                {label}
            </span>
        ))}
    </>
);

const useTimelineZoom = ({
    viewportRef,
    pixelsPerBeat,
    beatCount,
    onPixelsPerBeatChange,
}: {
    viewportRef: RefObject<HTMLDivElement | null>;
    pixelsPerBeat: number;
    beatCount: number;
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
                (viewport.scrollLeft + viewport.clientWidth / 2) /
                pixelsPerBeat;
            onPixelsPerBeatChange(next);
            requestAnimationFrame(() => {
                viewport.scrollLeft = Math.max(
                    0,
                    centerBeat * next - viewport.clientWidth / 2,
                );
            });
        },
        [onPixelsPerBeatChange, pixelsPerBeat, viewportRef],
    );

    const fit = useCallback(() => {
        const viewport = viewportRef.current;
        if (!viewport || !onPixelsPerBeatChange || beatCount <= 0) return;
        onPixelsPerBeatChange(
            clamp(
                viewport.clientWidth / beatCount,
                TIMELINE_MIN_PX_PER_BEAT,
                TIMELINE_MAX_PX_PER_BEAT,
            ),
        );
        requestAnimationFrame(() => {
            viewport.scrollLeft = 0;
        });
    }, [beatCount, onPixelsPerBeatChange, viewportRef]);

    return {
        zoomOut: () => updateZoom(pixelsPerBeat / 1.25),
        zoomIn: () => updateZoom(pixelsPerBeat * 1.25),
        fit,
    };
};

const Transport = ({
    props: {
        pixelsPerBeat,
        model,
        onPixelsPerBeatChange,
        isPlaying,
        onPlayingChange,
        onNavigate,
    },
    viewportRef,
    showZoom = true,
}: {
    props: TimelineCommonProps;
    viewportRef: RefObject<HTMLDivElement | null>;
    showZoom?: boolean;
}) => {
    const zoom = useTimelineZoom({
        viewportRef,
        pixelsPerBeat,
        beatCount: model.beatCount,
        onPixelsPerBeatChange,
    });
    return (
        <TimelineTransport
            isPlaying={isPlaying}
            onPlayingChange={onPlayingChange}
            onNavigate={onNavigate}
            onZoomOut={onPixelsPerBeatChange ? zoom.zoomOut : undefined}
            onZoomIn={onPixelsPerBeatChange ? zoom.zoomIn : undefined}
            onFit={onPixelsPerBeatChange ? zoom.fit : undefined}
            showZoom={showZoom}
        />
    );
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
    const ordered = [...pages].sort((a, b) => a.atBeat - b.atBeat);
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

export interface SimpleTimelineProps extends TimelineCommonProps {
    readonly selectedPageId?: string | number | null;
    readonly onPageSelect?: (pageId: string | number) => void;
    readonly onPageAdd?: () => void;
}

export function SimpleTimeline(props: SimpleTimelineProps) {
    const {
        model,
        pixelsPerBeat,
        positionBeat,
        showTransport = true,
        selectedPageId,
        onPageSelect,
        onPageAdd,
        className,
    } = props;
    const viewportRef = useRef<HTMLDivElement>(null);
    const contentWidth = model.beatCount * pixelsPerBeat;
    const surfaceWidth = contentWidth + (onPageAdd ? 36 : 0);
    const scrub = useTimelineScrubbing({
        onSeek: props.onSeek,
        pixelsPerBeat,
        startBeat: 0,
        beatCount: model.beatCount,
    });
    const sortedPages = useMemo(
        () => [...model.pages].sort((a, b) => a.atBeat - b.atBeat),
        [model.pages],
    );
    const transportProps = { ...props, onNavigate: transportNavigation(props) };

    return (
        <TimelineShell
            viewportRef={viewportRef}
            className={className}
            transport={
                showTransport ? (
                    <Transport
                        props={transportProps}
                        viewportRef={viewportRef}
                    />
                ) : undefined
            }
            labels={
                <TimelineLabels
                    items={[
                        { label: "Pages", top: 8 },
                        { label: "Audio", top: 53 },
                    ]}
                />
            }
        >
            <div
                {...scrub}
                className="relative h-[88px] touch-none"
                style={{ width: surfaceWidth }}
            >
                <div className="border-stroke rounded-6 absolute top-0 left-0 flex h-28 overflow-hidden border">
                    {sortedPages.map((page, index) => {
                        const next = sortedPages[index + 1]?.atBeat;
                        const width =
                            ((next ?? model.beatCount) - page.atBeat) *
                            pixelsPerBeat;
                        return (
                            <button
                                key={page.id}
                                type="button"
                                data-timeline-interactive="true"
                                aria-pressed={selectedPageId === page.id}
                                onClick={() => onPageSelect?.(page.id)}
                                className="border-stroke bg-fg-2 text-text focus-visible:ring-accent hover:text-accent h-full border-r px-8 font-mono text-[11px] outline-hidden transition-[color,background-color,box-shadow] duration-150 last:border-r-0 focus-visible:ring-2 focus-visible:ring-inset aria-pressed:shadow-[inset_0_0_0_1px_var(--color-accent)]"
                                style={{ width }}
                            >
                                {page.label}
                            </button>
                        );
                    })}
                </div>
                {onPageAdd && (
                    <button
                        type="button"
                        data-timeline-interactive="true"
                        aria-label="Add page"
                        onClick={onPageAdd}
                        className="bg-accent text-text-invert focus-visible:ring-accent absolute top-1 flex size-26 items-center justify-center rounded-full outline-hidden transition-transform duration-150 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent active:translate-y-px"
                        style={{ left: contentWidth + 8 }}
                    >
                        <PlusIcon size={18} />
                    </button>
                )}
                <div
                    className="bg-bg-1/40 rounded-4 absolute top-40 left-0 h-42 overflow-hidden"
                    style={{ width: contentWidth }}
                >
                    <TimelineWaveformCanvas
                        waveform={model.waveform}
                        width={contentWidth}
                        height={42}
                        pixelsPerBeat={pixelsPerBeat}
                        positionBeat={positionBeat}
                    />
                </div>
                {props.workspaceRange && (
                    <TimelineWorkspaceFlags
                        range={props.workspaceRange}
                        beatCount={model.beatCount}
                        pixelsPerBeat={pixelsPerBeat}
                        height={88}
                        onCommit={props.onWorkspaceRangeCommit}
                    />
                )}
            </div>
        </TimelineShell>
    );
}

export function ExpandedTimeline(props: TimelineCommonProps) {
    const {
        model,
        pixelsPerBeat,
        positionBeat,
        selectedTrackId,
        showTransport = true,
        className,
    } = props;
    const viewportRef = useRef<HTMLDivElement>(null);
    const rows = useMemo(
        () => packTimelineTracks(model.tracks),
        [model.tracks],
    );
    const width = model.beatCount * pixelsPerBeat;
    const rowTop = 62;
    const audioTop = rowTop + rows.length * 26;
    const height = audioTop + 42;
    const scrub = useTimelineScrubbing({
        onSeek: props.onSeek,
        pixelsPerBeat,
        startBeat: 0,
        beatCount: model.beatCount,
    });
    const transportProps = { ...props, onNavigate: transportNavigation(props) };

    return (
        <TimelineShell
            viewportRef={viewportRef}
            className={className}
            transport={
                showTransport ? (
                    <Transport
                        props={transportProps}
                        viewportRef={viewportRef}
                    />
                ) : undefined
            }
            labels={
                <TimelineLabels
                    items={[
                        { label: "Tracks", top: rowTop + 8 },
                        { label: "Audio", top: audioTop + 12 },
                    ]}
                />
            }
        >
            <div
                {...scrub}
                className="relative touch-none"
                style={{ width, height }}
            >
                <TimelineGridCanvas
                    width={width}
                    height={height}
                    pixelsPerBeat={pixelsPerBeat}
                    measures={model.measures}
                    lineTop={28}
                    topTickY={56}
                    bottomTickY={height - 1}
                />
                <TimelinePageLines
                    pages={model.pages}
                    pixelsPerBeat={pixelsPerBeat}
                    height={height}
                />
                <TimelineRuler
                    pages={model.pages}
                    measures={model.measures}
                    pixelsPerBeat={pixelsPerBeat}
                    endBeat={model.beatCount}
                />
                {rows.flatMap((row, rowIndex) =>
                    row.map((track) => (
                        <TimelineTrackClip
                            key={track.id}
                            track={track}
                            pixelsPerBeat={pixelsPerBeat}
                            top={rowTop + rowIndex * 26 + 4}
                            height={18}
                            selected={selectedTrackId === track.id}
                            onSelect={props.onTrackSelect}
                            onRangeCommit={props.onTimelineRangeCommit}
                            beatCount={model.beatCount}
                        />
                    )),
                )}
                <div
                    className="bg-bg-1/40 rounded-4 absolute left-0 overflow-hidden"
                    style={{ top: audioTop + 3, width, height: 32 }}
                >
                    <TimelineWaveformCanvas
                        waveform={model.waveform}
                        width={width}
                        height={32}
                        pixelsPerBeat={pixelsPerBeat}
                        positionBeat={positionBeat}
                    />
                </div>
                <TimelinePlayhead
                    model={model}
                    positionBeat={positionBeat}
                    pixelsPerBeat={pixelsPerBeat}
                    height={height}
                />
                {props.workspaceRange && (
                    <TimelineWorkspaceFlags
                        range={props.workspaceRange}
                        beatCount={model.beatCount}
                        pixelsPerBeat={pixelsPerBeat}
                        height={height}
                        onCommit={props.onWorkspaceRangeCommit}
                    />
                )}
            </div>
        </TimelineShell>
    );
}

export function CompactTimeline(props: TimelineCommonProps) {
    const {
        model,
        pixelsPerBeat,
        positionBeat,
        selectedTrackId,
        showTransport = false,
        className,
    } = props;
    const viewportRef = useRef<HTMLDivElement>(null);
    const rows = useMemo(
        () => packTimelineTracks(model.tracks),
        [model.tracks],
    );
    const width = model.beatCount * pixelsPerBeat;
    const trackTop = 50;
    const audioTop = trackTop + rows.length * 6 + 5;
    const height = audioTop + 24;
    const scrub = useTimelineScrubbing({
        onSeek: props.onSeek,
        pixelsPerBeat,
        startBeat: 0,
        beatCount: model.beatCount,
    });
    const transportProps = { ...props, onNavigate: transportNavigation(props) };

    return (
        <TimelineShell
            viewportRef={viewportRef}
            className={className}
            transport={
                showTransport ? (
                    <Transport
                        props={transportProps}
                        viewportRef={viewportRef}
                    />
                ) : undefined
            }
            labels={
                <TimelineLabels
                    items={[
                        { label: "Tracks", top: trackTop - 1 },
                        { label: "Audio", top: audioTop + 6 },
                    ]}
                />
            }
        >
            <div
                {...scrub}
                className="relative touch-none"
                style={{ width, height }}
            >
                <TimelineRuler
                    pages={model.pages}
                    measures={[]}
                    pixelsPerBeat={pixelsPerBeat}
                    endBeat={model.beatCount}
                    compact
                />
                {rows.flatMap((row, rowIndex) =>
                    row.map((track) => (
                        <TimelineTrackClip
                            key={track.id}
                            track={track}
                            pixelsPerBeat={pixelsPerBeat}
                            top={trackTop + rowIndex * 6}
                            height={3}
                            selected={selectedTrackId === track.id}
                            onSelect={props.onTrackSelect}
                            onRangeCommit={props.onTimelineRangeCommit}
                            beatCount={model.beatCount}
                            micro
                        />
                    )),
                )}
                <div
                    className="bg-bg-1/40 rounded-4 absolute left-0 overflow-hidden"
                    style={{ top: audioTop, width, height: 22 }}
                >
                    <TimelineWaveformCanvas
                        waveform={model.waveform}
                        width={width}
                        height={22}
                        pixelsPerBeat={pixelsPerBeat}
                        positionBeat={positionBeat}
                    />
                </div>
                <TimelinePlayhead
                    model={model}
                    positionBeat={positionBeat}
                    pixelsPerBeat={pixelsPerBeat}
                    height={height}
                />
            </div>
        </TimelineShell>
    );
}

export interface InspectorTimelineProps extends TimelineCommonProps {
    readonly focusedTrackId: TimelineTrackId;
}

export function InspectorTimeline(props: InspectorTimelineProps) {
    const {
        model,
        focusedTrackId,
        positionBeat,
        selectedTrackId,
        showTransport = false,
        className,
    } = props;
    const viewportRef = useRef<HTMLDivElement>(null);
    const viewportWidth = useElementWidth(viewportRef);
    const track = model.tracks.find((item) => item.id === focusedTrackId);
    const range = getInspectorRange(track, model.beatCount);
    const span = Math.max(range.endBeat - range.startBeat, 1);
    const width = Math.max(
        viewportWidth - PANEL_PADDING,
        span * props.pixelsPerBeat,
    );
    const pixelsPerBeat = width / span;
    const trackTop = 58;
    const audioTop = 84;
    const height = 110;
    const scrub = useTimelineScrubbing({
        onSeek: props.onSeek,
        pixelsPerBeat,
        startBeat: range.startBeat,
        beatCount: model.beatCount,
    });
    const transportProps = { ...props, onNavigate: transportNavigation(props) };
    const playheadVisible =
        positionBeat >= range.startBeat && positionBeat <= range.endBeat;

    return (
        <TimelineShell
            viewportRef={viewportRef}
            className={className}
            allowScroll={false}
            transport={
                showTransport ? (
                    <Transport
                        props={transportProps}
                        viewportRef={viewportRef}
                        showZoom={false}
                    />
                ) : undefined
            }
            labels={
                <TimelineLabels
                    items={[
                        { label: track?.label ?? "Track", top: trackTop + 7 },
                        { label: "Audio", top: audioTop + 6 },
                    ]}
                />
            }
        >
            <div
                {...scrub}
                className="relative touch-none"
                style={{ width, height }}
            >
                <TimelineRuler
                    pages={model.pages}
                    measures={model.measures}
                    pixelsPerBeat={pixelsPerBeat}
                    startBeat={range.startBeat}
                    endBeat={range.endBeat}
                    compact
                />
                {track && (
                    <TimelineTrackClip
                        track={track}
                        pixelsPerBeat={pixelsPerBeat}
                        startBeat={range.startBeat}
                        top={trackTop}
                        height={22}
                        selected={selectedTrackId === track.id}
                        onSelect={props.onTrackSelect}
                        onRangeCommit={props.onTimelineRangeCommit}
                        beatCount={model.beatCount}
                    />
                )}
                <div
                    className="bg-bg-1/40 rounded-4 absolute left-0 overflow-hidden"
                    style={{ top: audioTop, width, height: 22 }}
                >
                    <TimelineWaveformCanvas
                        waveform={model.waveform}
                        width={width}
                        height={22}
                        pixelsPerBeat={pixelsPerBeat}
                        positionBeat={positionBeat}
                        startBeat={range.startBeat}
                    />
                </div>
                {playheadVisible && (
                    <TimelinePlayhead
                        model={model}
                        positionBeat={positionBeat}
                        pixelsPerBeat={pixelsPerBeat}
                        startBeat={range.startBeat}
                        height={height}
                    />
                )}
                {props.workspaceRange && (
                    <TimelineWorkspaceFlags
                        range={props.workspaceRange}
                        beatCount={model.beatCount}
                        pixelsPerBeat={pixelsPerBeat}
                        startBeat={range.startBeat}
                        height={height}
                        onCommit={props.onWorkspaceRangeCommit}
                    />
                )}
            </div>
        </TimelineShell>
    );
}

/** @deprecated Use CompactTimeline. */
export const CollapsedTimeline = CompactTimeline;
