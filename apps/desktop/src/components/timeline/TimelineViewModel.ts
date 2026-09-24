export type TimelineTrackId = string | number;

/**
 * An x-position in the timeline measured in beats. Integer positions are beat
 * boundaries; fractional positions are used by the playback and hover cursors.
 */
export type BeatPosition = number;

/** All timeline ranges use an inclusive start and an exclusive end. */
export interface TimelineBeatRange {
    readonly startBeatIndex: number;
    readonly endBeatIndex: number;
}

export interface TimelineMarker {
    readonly id: string | number;
    readonly label: string;
    readonly atBeat: BeatPosition;
}

export interface TimelinePageMarker extends TimelineMarker {
    /** The zero-count setup page that precedes the beat-scaled timeline. */
    readonly isInitial: boolean;
}

export interface TimelineMeasureMarker extends TimelineMarker {
    readonly rehearsalMark?: string | null;
}

export interface TimelineLeg {
    readonly id: string | number;
    readonly startBeat: BeatPosition;
    readonly endBeat: BeatPosition;
    /** Retained for the movement engine; the timeline no longer encodes it visually. */
    readonly texture: "move" | "hold";
}

export interface TimelineActivitySpan {
    readonly startBeatIndex: number;
    readonly endBeatIndex: number;
    readonly active: boolean;
}

export interface TimelineTarget {
    readonly id: string | number;
    readonly type: "marcher" | "shape";
}

export interface TimelineTrack {
    readonly id: TimelineTrackId;
    readonly targetId: string;
    readonly targetType: TimelineTarget["type"];
    readonly label: string;
    readonly color: string;
    readonly legs: readonly TimelineLeg[];
    /** A gap-free, non-overlapping partition of the track's complete range. */
    readonly activitySpans: readonly TimelineActivitySpan[];
}

export interface TimelineWaveform {
    /** Normalized peak magnitudes (0..1), grouped by beat. */
    readonly peaksByBeat: readonly (readonly number[])[];
}

export interface TimelineViewModel {
    readonly beatCount: number;
    readonly pages: readonly TimelinePageMarker[];
    readonly measures: readonly TimelineMeasureMarker[];
    readonly tracks: readonly TimelineTrack[];
    readonly waveform: TimelineWaveform;
}

export type TimelineSelection =
    | { readonly kind: "page"; readonly pageId: string | number }
    | { readonly kind: "track"; readonly trackId: TimelineTrackId }
    | { readonly kind: "range"; readonly range: TimelineBeatRange }
    | null;

export type TimelineNavigation =
    | "first-page"
    | "previous-page"
    | "next-page"
    | "last-page";

export interface TimelineInteractionProps {
    readonly positionBeat: BeatPosition;
    readonly isPlaying: boolean;
    readonly selection?: TimelineSelection;
    readonly selectedTarget?: TimelineTarget | null;
    readonly onSeek?: (beat: BeatPosition) => void;
    readonly onPlayingChange?: (isPlaying: boolean) => void;
    readonly onNavigate?: (direction: TimelineNavigation) => void;
    readonly onSelectionChange?: (selection: TimelineSelection) => void;
    readonly onCreateTrack?: (request: TimelineCreateTrackRequest) => void;
}

export interface TimelineScaleProps {
    readonly pixelsPerBeat: number;
    readonly onPixelsPerBeatChange?: (pixelsPerBeat: number) => void;
}

export interface TimelineCommonProps
    extends TimelineInteractionProps, TimelineScaleProps {
    readonly model: TimelineViewModel;
    readonly showTransport?: boolean;
    readonly className?: string;
    readonly onTimelineRangeCommit?: (change: TimelineRangeChange) => void;
}

export interface TimelineRangeChange extends TimelineBeatRange {
    readonly timelineId: TimelineTrackId;
}

export interface TimelineCreateTrackRequest {
    readonly target: TimelineTarget;
    readonly range: TimelineBeatRange;
}
