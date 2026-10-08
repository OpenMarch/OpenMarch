import type {
    TimelineNavigation,
    TimelineSeekGesture,
} from "@/components/timeline/TimelineViewModel";
import {
    displayedBeat,
    useTimelineSelectionStore,
    type TimelinePlaybackRun,
} from "@/stores/TimelineSelectionStore";
import {
    canPlayOn,
    navigationTarget,
    previewBounds,
    type FlagPage,
} from "./timelinePlayhead";
import { timeAtBeat, type BeatTiming } from "./timeMap";
import { restartLivePlaybackAt } from "@/components/timeline/audio/AudioPlayer";

/**
 * The timeline-mode transport (docs/timeline/ui.md UI-9; P8.11), shared by the timeline's
 * transport buttons and the registered actions (shortcuts, menus). These drive
 * `useTimelineSelectionStore`; page mode keeps its own page-based transport.
 */

/** Set by `stopTimelinePlayback` while playing, so the pause that follows returns to the playhead. */
let stopRequested = false;
/** Set by `suspendTimelinePlayback`, so the pause that follows leaves the cursor and playhead alone. */
let suspendRequested = false;

/**
 * The scrub in progress (UI-12 review): the last whole beat it sent, so a move within the same
 * beat sends nothing, and whether it is over playback, with the run it suspended once it moved.
 */
let scrub: {
    beat: number | null;
    playing: boolean;
    suspended: TimelinePlaybackRun | null;
} | null = null;

/**
 * Page navigation (UI-9 Page-relative tools): moves the playhead to the target flag and selects
 * that page's timeline, or home for the first page. Returns false when there is nowhere to go.
 * Callers don't navigate while playing.
 */
export function navigateTimelinePages(
    pages: readonly FlagPage[],
    direction: TimelineNavigation,
): boolean {
    const state = useTimelineSelectionStore.getState();
    // From the beat the timeline shows: a held preview frame, or the playhead (UI-11)
    const target = navigationTarget(pages, displayedBeat(state), direction);
    if (!target) return false;
    if (target.range) state.selectRange(target.range.start, target.range.end);
    else state.selectHome();
    return true;
}

/**
 * A click, scrub or page navigation while playing (UI-12): playback jumps to `beat` and goes on,
 * as in a DAW, and the playhead stays put. A preview jumped outside its window plays on from
 * there; isolation keeps the jump inside the isolated range. Returns false when not playing.
 */
export function jumpTimelinePlayback(
    beats: readonly BeatTiming[],
    beat: number,
): boolean {
    const state = useTimelineSelectionStore.getState();
    if (!state.playback || !Number.isFinite(beat)) return false;
    const target = playbackTarget(beats, beat);
    const run = runAfterJump(state.playback, target);
    if (run !== state.playback) state.setPlayback(run);
    restartLivePlaybackAt(timeAtBeat(beats, target));
    state.cue(target);
    return true;
}

/** Where playback jumped to `beat` goes: inside an isolated range, else inside the show. */
const playbackTarget = (beats: readonly BeatTiming[], beat: number) => {
    const { isolation } = useTimelineSelectionStore.getState();
    return isolation
        ? Math.min(Math.max(beat, isolation.start), isolation.end - 1)
        : Math.min(Math.max(beat, 0), beats.length);
};

/** A preview jumped outside its window plays on from there; isolation keeps its run. */
const runAfterJump = (
    run: TimelinePlaybackRun,
    target: number,
): TimelinePlaybackRun =>
    run.kind === "preview" &&
    !useTimelineSelectionStore.getState().isolation &&
    (target < run.from || target >= run.to)
        ? { kind: "on" }
        : run;

/**
 * A scrub over playback has moved (UI-12 review): playback pauses without writing the playhead or
 * the cursor, so the scrub can show each beat it passes (`cue`) with the audio silent. Returns the
 * run to resume, or `null` when nothing is playing.
 */
export function suspendTimelinePlayback(
    setIsPlaying: (isPlaying: boolean) => void,
): TimelinePlaybackRun | null {
    const run = useTimelineSelectionStore.getState().playback;
    if (!run) return null;
    suspendRequested = true;
    setIsPlaying(false);
    return run;
}

/**
 * The scrub that suspended `run` ended at `beat`: playback starts once from there, as the same
 * run, or playing on when a preview's window doesn't hold it (as `jumpTimelinePlayback` does).
 */
export function resumeTimelinePlayback(
    beats: readonly BeatTiming[],
    beat: number,
    run: TimelinePlaybackRun,
    setIsPlaying: (isPlaying: boolean) => void,
): void {
    const state = useTimelineSelectionStore.getState();
    const target = playbackTarget(beats, beat);
    // A suspension whose pause never landed mustn't turn the next ordinary pause into one
    suspendRequested = false;
    stopRequested = false;
    state.cue(target);
    state.setPlayback(runAfterJump(run, target));
    setIsPlaying(true);
}

/** Whether the pause in progress is a scrub's suspension; clears the request. */
export function consumeSuspendRequest(): boolean {
    const requested = suspendRequested;
    suspendRequested = false;
    return requested;
}

/**
 * A seek from the timeline (UI-12 and its review). `gesture` is where it sits in a scrub
 * (`TimelineSeekGesture`); without one it is a single action.
 *
 * - Paused, it moves the playhead (`seek`). A scrub sends one seek per whole beat it passes, and
 *   an unpinned start flag stays put until it ends, then follows once (`beginScrub`, `endScrub`).
 * - Playing, a click (a press that ends without moving off its beat), or a seek without a gesture,
 *   jumps playback there and plays on (`jumpTimelinePlayback`). A drag suspends playback
 *   (`suspendTimelinePlayback`) and the canvas follows the pointer; when it ends, playback resumes
 *   once, from there (`resumeTimelinePlayback`). The playhead stays put throughout.
 *
 * During a scrub (`press`, `drag`) it returns the beat the timeline shows once the seek has landed
 * (`displayedBeat`): the beat sent, or another when the playhead can't follow it (isolation keeps
 * it inside the isolated range). `null` when the seek moved nothing the timeline shows (a press
 * over playback, which only marks where a click would jump), and for any other seek.
 */
export function seekTimeline(
    beats: readonly BeatTiming[],
    beat: number,
    gesture: TimelineSeekGesture | undefined,
    {
        isPlaying,
        setIsPlaying,
    }: {
        isPlaying: boolean;
        setIsPlaying: (isPlaying: boolean) => void;
    },
): number | null {
    if (!Number.isFinite(beat)) return null;
    const state = useTimelineSelectionStore.getState();
    if (gesture === undefined || gesture === "end") {
        const ended = scrub;
        scrub = null;
        if (ended?.suspended)
            resumeTimelinePlayback(beats, beat, ended.suspended, setIsPlaying);
        else if (ended?.playing ?? isPlaying) jumpTimelinePlayback(beats, beat);
        else {
            state.seek(beat);
            state.endScrub();
        }
        return null;
    }
    const whole = Math.round(beat);
    scrub ??= { beat: null, playing: isPlaying, suspended: null };
    if (scrub.beat !== whole) {
        scrub.beat = whole;
        if (!scrub.playing) {
            state.beginScrub();
            state.seek(beat);
        }
        // A press over playback only marks where a click would jump to
        else if (gesture === "drag") {
            scrub.suspended ??= suspendTimelinePlayback(setIsPlaying);
            if (scrub.suspended) state.cue(playbackTarget(beats, beat));
        }
    }
    return !scrub.playing || scrub.suspended
        ? displayedBeat(useTimelineSelectionStore.getState())
        : null;
}

/**
 * Page navigation while playing (UI-12): playback jumps to the target flag, from the beat playing
 * now. Returns false when there is nowhere to go.
 */
export function jumpTimelinePages(
    beats: readonly BeatTiming[],
    pages: readonly FlagPage[],
    liveBeat: number,
    direction: TimelineNavigation,
): boolean {
    const target = navigationTarget(pages, liveBeat, direction);
    return target ? jumpTimelinePlayback(beats, target.flag) : false;
}

/**
 * **Play** (UI-11). With **From start** on, it previews the window from the start flag to the
 * playhead (`previewBounds`), looping when the loop is on; a paused preview
 * holding a frame inside those bounds resumes from it. With From start off, or no window to
 * preview (home), it plays on from where the cursor is (`startTimelinePlayOn`). Returns false,
 * and doesn't start, when there's nothing to play.
 *
 * @param showEndBeat the end of the show, `beats.length`
 */
export function startTimelinePlayback(
    showEndBeat: number,
    setIsPlaying: (isPlaying: boolean) => void,
): boolean {
    const state = useTimelineSelectionStore.getState();
    const bounds = state.playFromStart ? previewBounds(state) : null;
    if (!bounds) return startTimelinePlayOn(showEndBeat, setIsPlaying);
    // A Stop whose pause never landed (pressed with a stale isPlaying) mustn't turn the next
    // ordinary pause into a return
    stopRequested = false;
    const held = state.cursorBeat;
    const resume = held !== null && held >= bounds.from && held < bounds.to;
    state.cue(resume ? held : bounds.from);
    state.setPlayback({ kind: "preview", ...bounds });
    setIsPlaying(true);
    return true;
}

/**
 * Playing on (UI-11, Play with From start off): plays from the playhead, or from the frame a
 * paused preview holds, to the end of the show, as UI-10's Play did. Returns false when there's
 * nothing after it.
 */
export function startTimelinePlayOn(
    showEndBeat: number,
    setIsPlaying: (isPlaying: boolean) => void,
): boolean {
    const state = useTimelineSelectionStore.getState();
    const start = state.cursorBeat ?? state.playheadBeat;
    if (!canPlayOn(start, showEndBeat)) return false;
    stopRequested = false;
    state.cue(start);
    state.setPlayback({ kind: "on" });
    setIsPlaying(true);
    return true;
}

/**
 * Play/pause from the transport or the shortcut (Space): pausing keeps the selection; playing
 * follows From start (`startTimelinePlayback`).
 */
export function toggleTimelinePlayback({
    isPlaying,
    showEndBeat,
    setIsPlaying,
}: {
    isPlaying: boolean;
    showEndBeat: number;
    setIsPlaying: (isPlaying: boolean) => void;
}): void {
    if (isPlaying) setIsPlaying(false);
    else startTimelinePlayback(showEndBeat, setIsPlaying);
}

/** Whether the pause in progress came from **Stop**; clears the request. */
export function consumeStopRequest(): boolean {
    const requested = stopRequested;
    stopRequested = false;
    return requested;
}

/**
 * **Stop** (UI-11): stops playback and puts the cursor back on the playhead, so the edit window is
 * as it was before Play. While playing, the playback driver does this once the pause lands, so its
 * pause handling doesn't overwrite it. Paused with a held frame, it drops the frame. Paused on the
 * playhead, it returns the playhead to the start flag (UI-10).
 */
export function stopTimelinePlayback({
    isPlaying,
    setIsPlaying,
}: {
    isPlaying: boolean;
    setIsPlaying: (isPlaying: boolean) => void;
}): void {
    if (isPlaying) {
        stopRequested = true;
        setIsPlaying(false);
        return;
    }
    const state = useTimelineSelectionStore.getState();
    if (state.cursorBeat !== null) state.clearCursor();
    else state.returnToStart();
}
