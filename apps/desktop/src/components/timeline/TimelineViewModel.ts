import type { ReactNode } from "react";
import type {
    TimelineAddMarchersMenu,
    TimelineMenuTarget,
} from "./TimelineRangeMenu";

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
    /**
     * Where the page's flag is: the end of its counts (UI-9). The last page's box ends here, not at
     * the end of the beats. Without it, a page ends where the next one starts, or at the end.
     */
    readonly endBeat?: BeatPosition;
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

/** What a track stands for: a marcher or a shape (stories), or a whole stored timeline (UI-9) */
export type TimelineTrackTargetType = TimelineTarget["type"] | "timeline";

/** The diagnostics (spec §8.9) in a track's range, shown as a badge on its clip */
export interface TimelineTrackDiagnostics {
    readonly level: "warning" | "info";
    /** One line per diagnostic, for the badge's tooltip */
    readonly messages: readonly string[];
}

export interface TimelineTrack {
    readonly id: TimelineTrackId;
    /**
     * Tracks with the same link id move together (ui.md: a clip move moves its whole spec
     * timeline), so selecting one highlights the others.
     */
    readonly linkId?: string | number;
    readonly targetId: string;
    readonly targetType: TimelineTrackTargetType;
    readonly label: string;
    readonly color: string;
    readonly legs: readonly TimelineLeg[];
    /** A gap-free, non-overlapping partition of the track's complete range. */
    readonly activitySpans: readonly TimelineActivitySpan[];
    readonly diagnostics?: TimelineTrackDiagnostics;
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

/**
 * The timeline's selection (ui.md UI-9, "What the selection holds"): home (the initial page box),
 * a range (a page box, a dragged range, or a resized one), or nothing. A page box is the range from
 * the previous flag to its own flag, so a page is selected exactly when its range is. In the app it
 * mirrors `useTimelineSelectionStore`.
 */
export type TimelineSelection =
    | { readonly kind: "home" }
    | {
          readonly kind: "range";
          readonly range: TimelineBeatRange;
          /**
           * Where the start flag is drawn (UI-10), when it isn't the range's start: just after
           * **Stop** the playhead sits on the flag and the window falls back to the page box
           */
          readonly startFlagBeatIndex?: number;
          /** **From start** is on (UI-11): the window is drawn as a bar that turns it off */
          readonly fromStart?: boolean;
          /** The range was drawn by dragging on empty timeline space, which turns From start on */
          readonly drawn?: boolean;
          /**
           * The start flag was placed by hand and stays through navigation (UI-10 pinning); UI-12
           * draws it with a pin that unpins it
           */
          readonly startPinned?: boolean;
      }
    | null;

/**
 * Where a seek sits in a pointer or key gesture (UI-12 review). `press` is the pointer going down
 * (a click so far), `drag` is the gesture moving the playhead, and `end` is its release or cancel.
 * A seek without a gesture is one explicit action (a rehearsal tab, the go-to box). While playing,
 * a drag suspends playback, which resumes once from where the gesture ends; a press that ends
 * without a drag jumps playback there. The start flag moves once, when the gesture ends.
 */
export type TimelineSeekGesture = "press" | "drag" | "end";

export interface TimelineSeekOptions {
    readonly gesture?: TimelineSeekGesture;
}

/**
 * A seek to a whole beat. During a scrub (`press` and `drag`) the owner may return the beat the
 * playhead is on once the seek has landed, in the same beats as the seek: the beat sent, or
 * another when the playhead couldn't follow (held inside an isolated range), so the scrub's line
 * stays on it (`scrubLineBeat`). Nothing when it can't tell, or for any other seek.
 */
export type TimelineSeek = (
    beat: BeatPosition,
    options?: TimelineSeekOptions,
) => number | void;

export type TimelineNavigation =
    | "first-page"
    | "previous-page"
    | "next-page"
    | "last-page";

export interface TimelineInteractionProps {
    readonly positionBeat: BeatPosition;
    /**
     * While playing, the live position in view beats, fractional, or `null` when there is none.
     * The playhead line reads it every animation frame so it moves smoothly; everything else
     * follows `positionBeat`, which changes once per beat.
     */
    readonly livePositionBeat?: () => number | null;
    readonly isPlaying: boolean;
    readonly selection?: TimelineSelection;
    readonly selectedTarget?: TimelineTarget | null;
    readonly onSeek?: TimelineSeek;
    readonly onPlayingChange?: (isPlaying: boolean) => void;
    /** **Stop** (UI-10): stops and returns the playhead to the start flag; without it, no Stop button */
    readonly onStop?: () => void;
    readonly onNavigate?: (direction: TimelineNavigation) => void;
    readonly onSelectionChange?: (selection: TimelineSelection) => void;
    readonly onCreateTrack?: (request: TimelineCreateTrackRequest) => void;
    /** The right-click menu's **Add selected marchers** (UI-9, P8.14), in view beats here */
    readonly addSelectedMarchers?: TimelineAddMarchersMenu<TimelineMenuTarget>;
    /**
     * UI-9 **+**: adds a page whose flag is at the paused playhead. Shown just after the playhead
     * while it's given and the timeline isn't playing; the owner passes it only where **+** applies.
     */
    readonly onAddPageFlag?: () => void;
    /** Double-clicking a page box or clip opens (isolates) its range, in view beats here */
    readonly onOpenRange?: (target: TimelineMenuTarget) => void;
}

export interface TimelineScaleProps {
    readonly pixelsPerBeat: number;
    readonly onPixelsPerBeatChange?: (pixelsPerBeat: number) => void;
    /** The zoom was fitted to the show last time (UI-12): the timeline opens fitted */
    readonly zoomFitted?: boolean;
    readonly onZoomFittedChange?: (fitted: boolean) => void;
}

export interface TimelineCommonProps
    extends TimelineInteractionProps, TimelineScaleProps {
    readonly model: TimelineViewModel;
    readonly showTransport?: boolean;
    /** The playback clock shown in the transport. The app passes its audio clock; stories pass none. */
    readonly transportClock?: ReactNode;
    /** Extra transport controls, such as volume, the metronome and fullscreen */
    readonly transportAccessories?: ReactNode;
    readonly className?: string;
    readonly onTimelineRangeCommit?: (change: TimelineRangeChange) => void;
    /** Turns **From start** off (UI-11), from the range bar */
    readonly onPlayFromStartOff?: () => void;
    /** Unpins the start flag (UI-12), from its pin */
    readonly onUnpinStart?: () => void;
    /** Transport controls that fold into "⋯" on a narrow panel, such as Sound (UI-12) */
    readonly transportSecondary?: ReactNode;
    /** View controls at the transport's end, such as Compact (UI-12); they fold too */
    readonly transportViewControls?: ReactNode;
}

export interface TimelineRangeChange extends TimelineBeatRange {
    readonly timelineId: TimelineTrackId;
}

export interface TimelineCreateTrackRequest {
    readonly target: TimelineTarget;
    readonly range: TimelineBeatRange;
}
