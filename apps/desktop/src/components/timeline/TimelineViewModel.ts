export type TimelineTrackId = string | number;

/**
 * An x-position in the timeline measured in beats. Integer positions are beat
 * boundaries; fractional positions allow a playhead to move smoothly between
 * beats without changing the rest of the view model.
 */
export type BeatPosition = number;

export interface TimelineMarker {
    readonly id: string | number;
    readonly label: string;
    readonly atBeat: BeatPosition;
}

export interface TimelineLeg {
    readonly id: string | number;
    readonly startBeat: BeatPosition;
    readonly endBeat: BeatPosition;
    /** Presentation texture derived from whether the source coordinates change. */
    readonly texture: "move" | "hold";
}

export interface TimelineTrack {
    readonly id: TimelineTrackId;
    readonly targetId: string;
    readonly targetType: "marcher" | "shape";
    readonly label: string;
    readonly color: string;
    readonly legs: readonly TimelineLeg[];
}

export interface TimelineWaveform {
    /**
     * Normalized peak magnitudes (0..1), grouped by beat. An eventual audio
     * adapter can bucket time-domain peaks using each beat's real duration.
     */
    readonly peaksByBeat: readonly (readonly number[])[];
}

export interface TimelineViewModel {
    readonly beatCount: number;
    readonly pages: readonly TimelineMarker[];
    readonly measures: readonly TimelineMarker[];
    readonly tracks: readonly TimelineTrack[];
    readonly waveform: TimelineWaveform;
}

export type TimelineNavigation =
    | "first-page"
    | "previous-page"
    | "next-page"
    | "last-page";

export interface TimelineInteractionProps {
    readonly positionBeat: BeatPosition;
    readonly isPlaying: boolean;
    readonly selectedTrackId?: TimelineTrackId | null;
    readonly onSeek?: (beat: BeatPosition) => void;
    readonly onPlayingChange?: (isPlaying: boolean) => void;
    readonly onNavigate?: (direction: TimelineNavigation) => void;
    readonly onTrackSelect?: (trackId: TimelineTrackId) => void;
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
    readonly workspaceRange?: TimelineWorkspaceRange;
    readonly onWorkspaceRangeCommit?: (range: TimelineWorkspaceRange) => void;
    readonly onTimelineRangeCommit?: (change: TimelineRangeChange) => void;
}

export interface TimelineWorkspaceRange {
    readonly startFlagBeatIndex: number;
    readonly endFlagBeatIndex: number;
}

export interface TimelineRangeChange {
    readonly timelineId: TimelineTrackId;
    readonly startBeatIndex: number;
    readonly endBeatIndex: number;
}
