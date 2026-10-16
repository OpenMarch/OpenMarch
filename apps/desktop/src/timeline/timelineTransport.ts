import type {
    TimelineNavigation,
    TimelineSeekGesture,
} from "@/components/timeline/TimelineViewModel";
import {
    displayedBeat,
    useTimelineSelectionStore,
    type TimelineLine,
    type TimelinePlaybackRun,
} from "@/stores/TimelineSelectionStore";
import {
    canPlayOn,
    navigationTarget,
    previewBounds,
    type FlagPage,
} from "./timelinePlayhead";
import { beatAtTime, timeAtBeat, type BeatTiming } from "./timeMap";
import {
    getLivePlaybackPosition,
    playbackStartInfoRef,
    restartLivePlaybackAt,
} from "@/components/timeline/audio/AudioPlayer";

/**
 * The transport (docs/timeline/ui.md UI-9; P8.11), shared by the timeline's transport buttons and
 * the registered actions (shortcuts, menus). These drive `useTimelineSelectionStore`.
 */

/** Set by `suspendTimelinePlayback`, so the pause that follows leaves the cursor and playhead alone. */
let suspendRequested = false;

/**
 * How the pause that follows ends playback (UI-24): **Stop** (`stopTimelinePlayback`) goes back to
 * where Play was pressed, and **Pause** (`pauseTimelinePlayback`) stays where it is. `null` for a
 * pause asked for elsewhere, which keeps the run's own rule (`useTimelinePlaybackDriver`).
 */
let endRequest: TimelinePlaybackEnd | null = null;

/** How playback ends (UI-24) */
export type TimelinePlaybackEnd = "stop" | "pause";

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
 * Navigation (UI-9 Page-relative tools): moves the playhead to the target flag and selects that
 * page's timeline, or home for the first page; a loop moves to that page (UI-17). A beat step
 * moves the playhead one beat, as a click there does. Returns false when there is nowhere to go.
 * Callers don't navigate while playing (`navigateTimeline` jumps playback instead).
 */
export function navigateTimelinePages(
    pages: readonly FlagPage[],
    direction: TimelineNavigation,
): boolean {
    const state = useTimelineSelectionStore.getState();
    // From the beat the timeline shows: a held preview frame, or the playhead (UI-11)
    const from = displayedBeat(state);
    if (direction === "previous-beat" || direction === "next-beat") {
        state.seek(beatStep(Math.round(from), direction));
        return displayedBeat(useTimelineSelectionStore.getState()) !== from;
    }
    const target = navigationTarget(pages, from, direction);
    if (!target) return false;
    if (target.range) {
        state.selectRange(target.range.start, target.range.end);
        // UI-17: going to a page takes the loop there
        if (state.loop && !state.isolation)
            state.setLoop({ start: target.range.start, end: target.range.end });
    } else state.selectHome();
    return true;
}

/**
 * A beat on or back from `beat`. Beats 0 and 1 are both show time 0, written as 0
 * (`normalizePlayheadBeat`), so a step on from the start goes to beat 2.
 */
const beatStep = (beat: number, direction: "previous-beat" | "next-beat") =>
    direction === "next-beat" ? Math.max(beat, 1) + 1 : beat - 1;

/**
 * Previous and Next, from the transport buttons and the shortcuts alike (Q and E; Shift for a
 * beat, Alt for the start and end). Paused, it moves the playhead (`navigateTimelinePages`); playing,
 * playback jumps there from the beat playing now and goes on (`jumpTimelinePages`).
 */
export function navigateTimeline(
    beats: readonly BeatTiming[],
    pages: readonly FlagPage[],
    isPlaying: boolean,
    direction: TimelineNavigation,
): boolean {
    if (!isPlaying) return navigateTimelinePages(pages, direction);
    const live = playbackStartInfoRef.current
        ? beatAtTime(beats, getLivePlaybackPosition())
        : displayedBeat(useTimelineSelectionStore.getState());
    return jumpTimelinePages(beats, pages, Math.floor(live), direction);
}

/**
 * A click, scrub or page navigation while playing (UI-12): playback jumps to `beat` and goes on,
 * as in a DAW, and the playhead stays put. A loop jumped outside its window plays on from there;
 * isolation keeps the jump inside the isolated range. Returns false when not playing.
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

/**
 * A loop jumped outside its window plays on from there (UI-11), so its stop stays; inside the
 * window it keeps looping. Isolation keeps its run.
 */
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
 * run, or playing on when a loop's window doesn't hold it (as `jumpTimelinePlayback` does).
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
 * **Stop** (UI-24, Space while playing): playback ends and the timeline goes back to where Play
 * was pressed. Playing never moves the start flag or the playhead (it moves the cursor), so going
 * back is clearing the cursor; the playback driver does that once the pause lands. Does nothing
 * when stopped.
 */
export function stopTimelinePlayback(
    setIsPlaying: (isPlaying: boolean) => void,
): void {
    if (!useTimelineSelectionStore.getState().playback) return;
    endRequest = "stop";
    setIsPlaying(false);
}

/**
 * **Pause** (UI-24, Shift+Space while playing): playback ends where it is, and the edit window
 * moves there, so the next Play and Stop start from here. The playback driver does it.
 */
export function pauseTimelinePlayback(
    setIsPlaying: (isPlaying: boolean) => void,
): void {
    if (!useTimelineSelectionStore.getState().playback) return;
    endRequest = "pause";
    setIsPlaying(false);
}

/** How the pause in progress was asked to end playback, if it was; clears the request. */
export function consumeEndRequest(): TimelinePlaybackEnd | null {
    const requested = endRequest;
    endRequest = null;
    return requested;
}

/**
 * A paused drag of the start flag or the playhead by its line (UI-21): the store's line drag, in
 * which a line dragged past the other swaps with it. Returns the beat the playhead shows, or
 * `undefined` when this isn't a line drag after all, so the seek goes on as a plain one: a press
 * on the playhead that ends without a drag is a click, and moves only the playhead.
 */
function dragTimelineLine(
    line: TimelineLine,
    beat: number,
    gesture: TimelineSeekGesture | undefined,
): number | null | undefined {
    const state = useTimelineSelectionStore.getState();
    const dragging = state.lineDrag !== null;
    if (!dragging && line === "playhead" && gesture !== "drag")
        return undefined;
    if (gesture === "cancel") {
        if (line === "start") state.cancelLineDrag();
        else state.endLineDrag();
        return null;
    }
    if (!dragging) state.beginLineDrag(line);
    // Isolated, there is no line drag: the playhead scrubs and the start flag stays
    if (useTimelineSelectionStore.getState().lineDrag === null)
        return line === "playhead" ? undefined : null;
    state.dragLine(beat);
    if (gesture === undefined || gesture === "end") {
        state.endLineDrag();
        return null;
    }
    return displayedBeat(useTimelineSelectionStore.getState());
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
        line,
    }: {
        isPlaying: boolean;
        setIsPlaying: (isPlaying: boolean) => void;
        /** The line the gesture drags by itself (`TimelineSeekOptions.line`) */
        line?: TimelineLine;
    },
): number | null {
    if (!Number.isFinite(beat)) return null;
    const state = useTimelineSelectionStore.getState();
    if (line !== undefined && !isPlaying) {
        const shown = dragTimelineLine(line, beat, gesture);
        if (shown !== undefined) return shown;
    } else if (line === "start") return null;
    if (gesture === undefined || gesture === "end" || gesture === "cancel") {
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
 * Navigation while playing (UI-12): playback jumps to the target flag, or a beat on, from the
 * beat playing now. Returns false when there is nowhere to go.
 */
export function jumpTimelinePages(
    beats: readonly BeatTiming[],
    pages: readonly FlagPage[],
    liveBeat: number,
    direction: TimelineNavigation,
): boolean {
    if (direction === "previous-beat" || direction === "next-beat")
        return jumpTimelinePlayback(beats, beatStep(liveBeat, direction));
    const target = navigationTarget(pages, liveBeat, direction);
    return target ? jumpTimelinePlayback(beats, target.flag) : false;
}

/**
 * What **Play** loops (UI-17): an isolated move's range, else the loop (`loop`, its own region,
 * wherever the playhead is); `null` when neither, and Play plays on.
 */
export const loopBounds = (
    state: Pick<
        ReturnType<typeof useTimelineSelectionStore.getState>,
        "isolation" | "selection" | "loop"
    >,
): { readonly from: number; readonly to: number } | null => {
    if (state.isolation) return previewBounds(state);
    return state.loop ? { from: state.loop.start, to: state.loop.end } : null;
};

/**
 * Playing on (UI-17, Play with no loop): plays from `from` (Play: the start flag; Shift+Space: the
 * playhead) to the end of the show. Returns false when there's nothing after it.
 */
export function startTimelinePlayOn(
    showEndBeat: number,
    setIsPlaying: (isPlaying: boolean) => void,
    from?: number,
): boolean {
    const state = useTimelineSelectionStore.getState();
    const start = from ?? state.cursorBeat ?? state.playheadBeat;
    if (!canPlayOn(start, showEndBeat)) return false;
    state.cue(start);
    state.setPlayback({ kind: "on" });
    setIsPlaying(true);
    return true;
}

/**
 * **Play / Stop** (UI-17, Space), the one play action. With looping on (or a move isolated) it
 * loops the loop's region wherever the playhead is, as Logic's cycle does. Otherwise it plays on
 * from the yellow start flag (project owner, 2026-10-13, lab test playback-start: version B won;
 * Shift+Space plays on from the playhead, `playTimelinePage`). Playing, it stops and goes back to
 * where Play was pressed (UI-24, `stopTimelinePlayback`); Shift+Space pauses where it is instead.
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
    if (isPlaying) {
        stopTimelinePlayback(setIsPlaying);
        return;
    }
    const state = useTimelineSelectionStore.getState();
    const bounds = loopBounds(state);
    if (!bounds) {
        startTimelinePlayOn(showEndBeat, setIsPlaying, state.startBeat);
        return;
    }
    state.cue(bounds.from);
    state.setPlayback({ kind: "preview", ...bounds });
    setIsPlaying(true);
}

/**
 * **Play from the playhead** (Shift+Space, or Shift+click on Play): plays on from the
 * playhead, or, with looping on, plays the loop's region once and goes back to the playhead when it
 * ends or is stopped. Playing, it pauses where it is (UI-24, `pauseTimelinePlayback`).
 */
export function playTimelinePage({
    isPlaying,
    showEndBeat,
    setIsPlaying,
}: {
    isPlaying: boolean;
    showEndBeat: number;
    setIsPlaying: (isPlaying: boolean) => void;
}): void {
    if (isPlaying) {
        pauseTimelinePlayback(setIsPlaying);
        return;
    }
    const state = useTimelineSelectionStore.getState();
    const bounds = loopBounds(state);
    if (!bounds) {
        startTimelinePlayOn(showEndBeat, setIsPlaying);
        return;
    }
    state.cue(bounds.from);
    state.setPlayback({ kind: "preview", ...bounds, once: true });
    setIsPlaying(true);
}

/**
 * **C** and the Loop button (UI-17): turns looping on over the edit window (the page being edited,
 * or the pages Shift+click selected), or off, as Logic's C turns Cycle on and off. Does nothing in
 * isolation, which always loops its move.
 */
export function toggleTimelineLoop(): void {
    const state = useTimelineSelectionStore.getState();
    if (state.isolation) return;
    if (state.loop) {
        state.setLoop(null);
        return;
    }
    const { selection } = state;
    if (selection.kind === "range")
        state.setLoop({ start: selection.start, end: selection.end });
}
