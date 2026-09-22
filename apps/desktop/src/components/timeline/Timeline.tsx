import type Beat from "@/global/classes/Beat";
import type Measure from "@/global/classes/Measure";
import type Page from "@/global/classes/Page";
import {
    useCurrentBeatIndex,
    useFrameClockStore,
    useIsPlaying,
    usePlaybackControls,
} from "@/services/clock/frame-clock";
import {
    createContext,
    type ReactNode,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import { clamp } from "./TimelineGeometry";
import {
    CompactTimeline,
    ExpandedTimeline,
    InspectorTimeline,
    SimpleTimeline,
} from "./TimelineVariants";
import type {
    TimelineRangeChange,
    TimelineTrack,
    TimelineTrackId,
    TimelineViewModel,
    TimelineWaveform,
    TimelineWorkspaceRange,
} from "./TimelineViewModel";

export type TimelineMode = "simple" | "expanded" | "compact" | "inspector";

export interface TimelineLegInput {
    readonly id: string | number;
    readonly startBeatIndex: number;
    readonly endBeatIndex: number;
    readonly texture: "move" | "hold";
}

/**
 * Renderer-ready aggregate assembled from the timeline/transition tables and
 * their target metadata. Database access stays outside the visual component.
 */
export interface TimelineInput {
    readonly id: TimelineTrackId;
    readonly targetId: string | number;
    readonly targetType: "marcher" | "shape";
    readonly label: string;
    readonly color: string;
    readonly startBeatIndex: number;
    readonly endBeatIndex: number;
    readonly legs: readonly TimelineLegInput[];
}

interface TimelineBaseProps {
    readonly beats: readonly Beat[];
    readonly pages: readonly Page[];
    readonly measures: readonly Measure[];
    readonly timelines: readonly TimelineInput[];
    readonly className?: string;
    readonly onTimelineRangeCommit?: (change: TimelineRangeChange) => void;
}

interface TimelineWorkspaceProps extends TimelineBaseProps {
    readonly startFlagBeatIndex: number;
    readonly endFlagBeatIndex: number;
    readonly onWorkspaceRangeCommit?: (range: TimelineWorkspaceRange) => void;
}

export type TimelineProps =
    | (TimelineWorkspaceProps & {
          readonly mode: "simple" | "expanded";
      })
    | (TimelineBaseProps & {
          readonly mode: "compact";
          readonly startFlagBeatIndex?: never;
          readonly endFlagBeatIndex?: never;
          readonly onWorkspaceRangeCommit?: never;
      })
    | (TimelineWorkspaceProps & {
          readonly mode: "inspector";
          readonly focusedTimelineId: TimelineTrackId;
      });

const TimelineWaveformContext = createContext<TimelineWaveform | null>(null);

/** Internal injection point used by Storybook until the audio adapter lands. */
export function TimelineWaveformProvider({
    waveform,
    children,
}: {
    waveform: TimelineWaveform;
    children: ReactNode;
}) {
    return (
        <TimelineWaveformContext.Provider value={waveform}>
            {children}
        </TimelineWaveformContext.Provider>
    );
}

const useTimelineWaveform = (beatCount: number): TimelineWaveform => {
    const injected = useContext(TimelineWaveformContext);
    return useMemo(() => {
        if (injected?.peaksByBeat.length === beatCount) return injected;
        return {
            peaksByBeat: Array.from({ length: beatCount }, () => []),
        };
    }, [beatCount, injected]);
};

const toTrack = (timeline: TimelineInput): TimelineTrack => ({
    id: timeline.id,
    targetId: String(timeline.targetId),
    targetType: timeline.targetType,
    label: timeline.label,
    color: timeline.color,
    legs: timeline.legs.map((leg) => ({
        id: leg.id,
        startBeat: leg.startBeatIndex,
        endBeat: leg.endBeatIndex,
        texture: leg.texture,
    })),
});

export const createTimelineViewModel = ({
    beats,
    pages,
    measures,
    timelines,
    waveform,
}: Pick<TimelineBaseProps, "beats" | "pages" | "measures" | "timelines"> & {
    waveform: TimelineWaveform;
}): TimelineViewModel => ({
    beatCount: beats.length,
    pages: pages.flatMap((page) => {
        const atBeat = page.beats[0]?.index;
        return atBeat == null
            ? []
            : [{ id: page.id, label: page.name, atBeat }];
    }),
    measures: measures.map((measure) => ({
        id: measure.id,
        label: `M${measure.number}`,
        atBeat: measure.startBeat.index,
    })),
    tracks: timelines.map(toTrack),
    waveform,
});

export function Timeline(props: TimelineProps) {
    const waveform = useTimelineWaveform(props.beats.length);
    const model = useMemo(
        () =>
            createTimelineViewModel({
                beats: props.beats,
                pages: props.pages,
                measures: props.measures,
                timelines: props.timelines,
                waveform,
            }),
        [props.beats, props.measures, props.pages, props.timelines, waveform],
    );
    const clockBeatIndex = useCurrentBeatIndex();
    const clockIsPlaying = useIsPlaying();
    const playback = usePlaybackControls();
    const [pixelsPerBeat, setPixelsPerBeat] = useState(16);
    const [selectedTrackId, setSelectedTrackId] =
        useState<TimelineTrackId | null>(null);
    const [selectedPageId, setSelectedPageId] = useState<
        string | number | null
    >(null);
    const [displayIsPlaying, setDisplayIsPlaying] = useState(clockIsPlaying);

    useEffect(() => setDisplayIsPlaying(clockIsPlaying), [clockIsPlaying]);

    const positionBeat = clamp(
        clockBeatIndex,
        0,
        Math.max(model.beatCount - 1, 0),
    );
    const seekToBeat = (beatIndex: number) => {
        const nextIndex = clamp(
            Math.round(beatIndex),
            0,
            Math.max(props.beats.length - 1, 0),
        );
        const beat = props.beats[nextIndex];
        if (!beat) return;
        useFrameClockStore.getState().setCurrentBeatIndex(nextIndex);
        playback.seek(beat.timestamp * 1000);
    };
    const setPlaying = (isPlaying: boolean) => {
        setDisplayIsPlaying(isPlaying);
        if (isPlaying) playback.play();
        else playback.pause();
    };
    const workspaceRange =
        props.mode === "compact"
            ? undefined
            : {
                  startFlagBeatIndex: props.startFlagBeatIndex,
                  endFlagBeatIndex: props.endFlagBeatIndex,
              };
    const commonProps = {
        model,
        positionBeat,
        isPlaying: displayIsPlaying,
        pixelsPerBeat,
        selectedTrackId,
        className: props.className,
        workspaceRange,
        onSeek: seekToBeat,
        onPlayingChange: setPlaying,
        onPixelsPerBeatChange: setPixelsPerBeat,
        onTrackSelect: setSelectedTrackId,
        onTimelineRangeCommit: props.onTimelineRangeCommit,
        onWorkspaceRangeCommit:
            props.mode === "compact" ? undefined : props.onWorkspaceRangeCommit,
    };

    if (props.mode === "simple") {
        return (
            <SimpleTimeline
                {...commonProps}
                showTransport
                selectedPageId={selectedPageId}
                onPageSelect={(pageId) => {
                    const page = props.pages.find(
                        (candidate) => candidate.id === pageId,
                    );
                    setSelectedPageId(page?.id ?? null);
                    const beatIndex = page?.beats[0]?.index;
                    if (beatIndex != null) seekToBeat(beatIndex);
                }}
            />
        );
    }
    if (props.mode === "expanded") {
        return <ExpandedTimeline {...commonProps} showTransport />;
    }
    if (props.mode === "compact") {
        return <CompactTimeline {...commonProps} showTransport={false} />;
    }
    if (!("focusedTimelineId" in props)) return null;
    return (
        <InspectorTimeline
            {...commonProps}
            showTransport={false}
            focusedTrackId={props.focusedTimelineId}
        />
    );
}
