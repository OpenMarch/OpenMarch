import { create } from "zustand";
import { isPlaywrightSession } from "@/utilities/playwrightSession";
import { isPageTimeline, oldestOver } from "@/timeline/timelineViewModel";

/**
 * The timeline-mode edit window and paused playhead (docs/timeline/ui.md UI-9, UI-10, C-12;
 * P8.11, P8.17).
 *
 * In timeline mode there is no selected page. What the designer edits is the **edit window**, from
 * the **start flag** S to the paused **playhead** P (UI-10): movers leave S and arrive at P. The
 * window is stored as `selection`, derived from S, P and the page boxes on every change:
 *
 * - **home**: P at beat 0. No timeline is selected; nothing is dimmed and moves edit homes.
 * - **range**: `[S, P)` when P is after S; otherwise (P on or before S, as during a Basic scrub) the
 *   page box ending at or holding P, as if S followed P. A range resolves to the stored timeline
 *   with exactly that range when there is one (at most one per range, C-12). Read it with
 *   `selectedStoredTimeline` or `useSelectedStoredTimeline`.
 * - **none**: nothing selected (`selectNothing`).
 *
 * Where the start flag goes depends on the mode (`startStays`):
 *
 * - **Expert** (UI-26, `startStays`): S stays where it is. Only going to a page (`selectRange`),
 *   home, its own drag and isolation move it. A seek behind S (a click, a scrub, a pause) makes
 *   that beat S and the old S the playhead; a click on S's beat makes a one-beat window after it.
 *   There is no pin. While looping, the loop is the window (`loop` is kept equal to it).
 * - **Basic** (UI-10, UI-19): S follows the playhead, to the start of the page box holding P. During
 *   a gesture (a scrub, arrow keys held on the playhead) S stays put and follows once the gesture
 *   ends (`beginScrub`, `endScrub`; UI-12 review), so it doesn't chase the playhead page by page.
 *
 * Every beat here is a spec beat position (`beats` index, spec §7). The zero-length beat 0 and
 * beat 1 are both show time 0; the playhead writes that time as 0 (`normalizePlayheadBeat`).
 *
 * `storedTimelines` is a read model of every stored timeline and who is in it, kept current by
 * `useTimelineSelectionHost` (mounted by `TimelineResolverHost`) after each timeline write, undo
 * and redo. It is `null` until first loaded. `pageBoxes` is kept by
 * `TimelineModePanel`.
 *
 * **Isolation** (docs/timeline/research/ownership/09-isolation.md, _prototype_): double-clicking a
 * stored timeline's clip or page box isolates it. The window becomes its range, the playhead stays
 * inside it, marchers outside it are dimmed and locked (`isMarcherDimmed`), and play loops it.
 * Esc, a page box or home, a dragged range, or the timeline going away ends isolation and puts S
 * and P back where they were.
 *
 * **Playback** (UI-11, UI-17): with a loop set (`loop`), **Play** loops it (a preview); with none it
 * plays on from the playhead. Playing never writes the playhead. Audio plays from, and the
 * paused canvas shows, the **cursor** (`cursorBeat`) when there is one, and the playhead
 * otherwise. Play sets the cursor where playback starts and `playback` to what is running: a
 * preview of the window, or playing on. A preview that loops moves the cursor back to its start;
 * a preview that stops clears the cursor, so the canvas is back at P. Every write of the window
 * (navigation, seeking, a range) clears the cursor, so the canvas is back at P before anything
 * edits there.
 */

/** Home, a range or nothing (UI-9, "What the selection holds"; UI-10 edit window). */
export type TimelineEditSelection =
    | { readonly kind: "home" }
    | {
          readonly kind: "range";
          /** First beat, inclusive (spec beats): the start flag */
          readonly start: number;
          /** End beat, exclusive: the playhead, where movers arrive */
          readonly end: number;
      }
    | { readonly kind: "none" };

/** A stored timeline and the marchers with an assignment in any of its transitions. */
export interface StoredTimelineMembership {
    readonly id: number;
    readonly start: number;
    readonly end: number;
    readonly marcherIds: ReadonlySet<number>;
    /** The timeline's name (UI-14 Rename), `null` or absent when it has none */
    readonly name?: string | null;
}

/** An isolated stored timeline (see the module comment) and the window to restore after it. */
export interface TimelineIsolation {
    readonly timelineId: number;
    /** The timeline's range, kept current when it moves */
    readonly start: number;
    readonly end: number;
    readonly restore: {
        readonly startBeat: number;
        readonly playheadBeat: number;
        /** UI-25: the move the window stood for, when several shared its range */
        readonly windowTimelineId?: number | null;
    };
}

/**
 * What is playing (UI-11): a **preview** of the window, from `from` (the start flag) to `to` (the
 * playhead), or playing **on** from where it started to the end of the show. Taken
 * when playback starts, so edits made while playing don't move its bounds.
 */
export type TimelinePlaybackRun =
    | {
          readonly kind: "preview";
          readonly from: number;
          readonly to: number;
          /** Plays once and stops instead of looping (UI-17: Shift+Space plays the loop once) */
          readonly once?: boolean;
      }
    | { readonly kind: "on" };

/** The loop's region (UI-17), spec beats: `[start, end)` */
export interface TimelineLoop {
    readonly start: number;
    readonly end: number;
}

/** A page's box: the previous flag to its own flag (`pageFlags`), in spec beats. */
export interface PageBox {
    readonly start: number;
    readonly end: number;
    /** The page's name, for messages ("Page 2"); absent where only the range matters */
    readonly name?: string;
}

export interface TimelineSelectionState {
    /** The edit window, derived from the start flag, the playhead and the page boxes */
    readonly selection: TimelineEditSelection;
    /** The start flag S (UI-10): where movers leave from */
    readonly startBeat: number;
    /**
     * Expert (UI-26): S stays put and a seek behind it swaps; Basic (false): S follows the
     * playhead's page. Kept by `TimelineResolverHost`.
     */
    readonly startStays: boolean;
    /** The paused playhead: a whole spec beat in `[0, beats.length]`. Not updated while playing. */
    readonly playheadBeat: number;
    /**
     * Increments on every playhead write, including one to the beat it is already on, so playback
     * can restart from it.
     */
    readonly playheadRevision: number;
    /** Every page's box after home, in show order; empty until the pages load */
    readonly pageBoxes: readonly PageBox[];
    /** Every stored timeline, by start then id; `null` until loaded */
    readonly storedTimelines: readonly StoredTimelineMembership[] | null;
    /**
     * Where playing on stops (docs/timeline/endless-counts.md rule 6): the latest of the show's end,
     * the music's end and the last move's end; `null` while unknown. The playhead isn't held to
     * it: the counts never end, so it goes anywhere. Kept by `useTimelinePlaybackDriver`.
     */
    readonly showEndBeat: number | null;
    /** The isolated timeline, or `null` (see the module comment) */
    readonly isolation: TimelineIsolation | null;
    /**
     * UI-25: the stored timeline the window stands for when several share its range (a move split
     * off a page's timeline): the one whose clip was clicked. `null` means the oldest over the
     * range, the page's. Cleared whenever the window leaves that timeline's range.
     */
    readonly windowTimelineId: number | null;
    /**
     * UI-25: a second move selected beside the window's (Shift+click on its clip), so **Merge
     * moves** has two. Cleared whenever the window changes.
     */
    readonly pairedTimelineId: number | null;
    /** Selects `timelineId` beside the window's move (`pairedTimelineId`), or clears it with `null` */
    readonly pairTimeline: (timelineId: number | null) => void;
    /**
     * The playback cursor when it isn't the playhead (UI-11): where playback started or a loop
     * went back to, or the beat a scrub over playback shows. `null` when it is the playhead.
     */
    readonly cursorBeat: number | null;
    /** What is playing, or `null` while paused (UI-11) */
    readonly playback: TimelinePlaybackRun | null;
    /**
     * The loop (UI-17), `null` when looping is off. In Expert it is the edit window (UI-26): every
     * window write moves it there, and setting it sets the window. While set, Play loops it and
     * stopping returns to the playhead.
     */
    readonly loop: TimelineLoop | null;
    /**
     * A gesture is moving the playhead: in Basic S waits for it to end (UI-12 review); in Expert
     * it is a playhead line drag (`lineDrag`), so passing S swaps them live (UI-26)
     */
    readonly scrubbing: boolean;
    /**
     * The start flag's beat, shown on the field for a moment after an arrow key moved it (UI-26);
     * `null` otherwise. Read the field's beat with `fieldBeat`.
     */
    readonly startPeek: number | null;
    /** The start flag or the playhead being dragged by its line (UI-21), from where it began */
    readonly lineDrag: TimelineLineDrag | null;

    /**
     * Isolates the stored timeline `timelineId`: the window becomes its range with the playhead at
     * its end. `restore` is where leaving goes back to (default: the window now; a double-click
     * passes the window from before its first click). Does nothing for a timeline that isn't
     * loaded, or while it is already isolated.
     */
    readonly isolate: (
        timelineId: number,
        restore?: TimelineIsolation["restore"],
    ) => void;
    /** Ends isolation and restores the start flag and playhead it saved. */
    readonly exitIsolation: () => void;
    /** Moves the playhead to beat 0 (home); S goes there too. */
    readonly selectHome: () => void;
    /**
     * Sets the window to `[start, end)`: the playhead to `end` and S to `start`. Page boxes, page
     * navigation, **+**, a dragged range and the range handles call this.
     */
    readonly selectRange: (
        start: number,
        end: number,
        /** UI-25: the stored timeline over the range that was picked (a clip), when several share it */
        timelineId?: number,
    ) => void;
    /** Clears the selection; the playhead and S stay. */
    readonly selectNothing: () => void;
    /**
     * Navigation: moves the playhead (`normalizePlayheadBeat`; the counts never end). In Basic S
     * follows it, except during a gesture (`beginScrub`). In Expert S stays, and a beat behind it
     * swaps them (UI-26): that beat becomes S and the old S the playhead; S's own beat makes the
     * window the beat after it; beat 0 is home. A non-finite beat is ignored.
     */
    readonly seek: (beat: number) => void;
    /** Moves the playhead and leaves S where it is. */
    readonly seekKeepingStart: (beat: number) => void;
    /**
     * A gesture that moves the playhead began (a scrub, a page-box drag, arrow keys): in Basic
     * `seek` leaves S where it is until `endScrub`; in Expert the gesture is a playhead line drag.
     */
    readonly beginScrub: () => void;
    /** The gesture ended: in Basic S follows the playhead, once; in Expert the line drag lands. */
    readonly endScrub: () => void;
    /**
     * A drag of the start flag or the playhead by its line began (UI-21), paused and not isolated.
     * Until it ends, `dragLine` puts the dragged line at a beat.
     */
    readonly beginLineDrag: (line: TimelineLine) => void;
    /**
     * The dragged line is at `beat`. The left line is the start flag and the right one the
     * playhead (`lineDragPositions`), so a line dragged past the other swaps with it.
     */
    readonly dragLine: (beat: number) => void;
    /**
     * The line drag ended where it is. In Basic, a playhead that never crossed the start flag ends
     * as a scrub does: S follows it, once. Released on the other line, the dragged line pushes it
     * a beat on: P a beat later, or S a beat earlier (a scrub's playhead pushes P later, UI-26).
     */
    readonly endLineDrag: () => void;
    /** The line drag was cancelled (Escape): S and P go back to where it began. */
    readonly cancelLineDrag: () => void;
    /**
     * A stored timeline moved from `from` by `delta` beats (a clip move): a selection of exactly
     * `from` moves with it, and so does the loaded stored timeline at `from` until the host
     * reloads, so the selection keeps resolving to it. The window's end is the playhead, so the
     * playhead moves too (while paused; it doesn't bump `playheadRevision`, as nothing is playing).
     */
    readonly followTimelineShift: (
        from: { readonly start: number; readonly end: number },
        delta: number,
        /** UI-25: the timeline that moved, so a move sharing `from` with it stays put */
        timelineId?: number,
    ) => void;
    /**
     * A page flag moved from beat `from` to `to` (docs/timeline/research/move-page-flag case 14):
     * a playhead or start flag on it goes with it, so the selected page stays selected. The page
     * boxes and the loaded stored timelines with an edge on it follow too, until the pages and the
     * host reload. Nothing
     * happens in isolation, where flags don't move.
     */
    readonly followPageFlagMove: (from: number, to: number) => void;
    /**
     * A stored timeline's range changed from `from` to `to` (a clip resize, resize-move): as
     * `followTimelineShift`, a selection of exactly `from` becomes `to`, with the playhead on its
     * end. An isolated timeline keeps the playhead where it was, clamped into `to`, unless it was
     * on the old end, which it follows.
     */
    readonly followTimelineRange: (
        from: { readonly start: number; readonly end: number },
        to: { readonly start: number; readonly end: number },
        /** UI-25: the timeline that changed, so a move sharing `from` with it stays put */
        timelineId?: number,
    ) => void;
    /** Used by `TimelineModePanel` only. */
    readonly setPageBoxes: (boxes: readonly PageBox[]) => void;
    /** Used by `useTimelineSelectionHost` only. */
    readonly setStoredTimelines: (
        timelines: readonly StoredTimelineMembership[] | null,
    ) => void;
    /**
     * Moves the playback cursor to `beat` (clamped to the show) without moving the playhead, and
     * restarts playback there if playing. A non-finite beat is ignored.
     */
    readonly cue: (beat: number) => void;
    /** Puts the cursor back on the playhead: the canvas shows P again. */
    readonly clearCursor: () => void;
    /** Records what is playing (`null` once it stops). Used by the transport and the driver. */
    readonly setPlayback: (playback: TimelinePlaybackRun | null) => void;
    /**
     * Sets the loop, or turns looping off with `null` (UI-17). In Expert, paused and not isolated,
     * the window moves to the loop too, as they are one (UI-26).
     */
    readonly setLoop: (loop: TimelineLoop | null) => void;
    /** Shows the start flag on the field (UI-26 arrow keys), or the playhead again with `false` */
    readonly peekStart: (peek: boolean) => void;
    /** Used by `TimelineResolverHost` only: Expert (`true`) or Basic. */
    readonly setStartStays: (startStays: boolean) => void;
    /** Used by `useTimelinePlaybackDriver` only. */
    readonly setShowEndBeat: (showEndBeat: number | null) => void;
    /** Opening a show: home, playhead at 0, nothing loaded. */
    readonly reset: () => void;
}

/** The playhead's beat for show time 0 is 0, though beat 1 (after the zero-length beat 0) is too. */
export function normalizePlayheadBeat(
    beat: number,
    zeroLengthFirstBeat = true,
): number {
    const whole = Math.max(0, Math.round(beat));
    return zeroLengthFirstBeat && whole <= 1 ? 0 : whole;
}

/** A line on the timeline that can be dragged by itself (UI-21) */
export type TimelineLine = "start" | "playhead";

/**
 * A line drag (UI-21): the dragged line, S and P from when it began, and where the dragged line
 * is now (`beat`, which the field shows, UI-26). `scrub` when it is an Expert scrub (UI-26)
 */
export type TimelineLineDrag = {
    readonly line: TimelineLine;
    readonly startBeat: number;
    readonly playheadBeat: number;
    readonly beat: number;
    readonly scrub?: boolean;
};

/**
 * Where S and P are with `drag`'s line at `beat` (UI-21, project owner 2026-10-14): the line not
 * dragged stays, the left one is the start flag and the right one the playhead, as Logic's
 * locators. `swapped` when the dragged line has passed the other and become it. On the same beat
 * both are there, as after Stop.
 */
export function lineDragPositions(
    drag: TimelineLineDrag,
    beat: number,
): { startBeat: number; playheadBeat: number; swapped: boolean } {
    const other = drag.line === "start" ? drag.playheadBeat : drag.startBeat;
    return {
        startBeat: Math.min(beat, other),
        playheadBeat: Math.max(beat, other),
        swapped: drag.line === "start" ? beat > other : beat < other,
    };
}

/**
 * Where Basic's start flag sits for a playhead at `playheadBeat` (UI-10): the start of the
 * page box holding it or ending at it; past the last flag, the last flag; with no page boxes, 0.
 */
export function followingStart(
    playheadBeat: number,
    boxes: readonly PageBox[],
): number {
    // Beat 1 is show time 0, the same moment as beat 0 (`normalizePlayheadBeat`)
    if (normalizePlayheadBeat(playheadBeat) === 0) return 0;
    const box = boxes.find(
        (b) => b.start < playheadBeat && playheadBeat <= b.end,
    );
    if (box) return box.start;
    const last = boxes[boxes.length - 1];
    return last && playheadBeat > last.end ? last.end : 0;
}

/**
 * The edit window for start flag `startBeat` and playhead `playheadBeat` (UI-10): home at beat 0;
 * `[S, P)` when P is after S; otherwise the window S would follow to.
 */
export function editWindow(
    startBeat: number,
    playheadBeat: number,
    boxes: readonly PageBox[],
): Exclude<TimelineEditSelection, { kind: "none" }> {
    if (normalizePlayheadBeat(playheadBeat) === 0) return { kind: "home" };
    const start =
        playheadBeat > startBeat
            ? startBeat
            : followingStart(playheadBeat, boxes);
    return { kind: "range", start, end: playheadBeat };
}

/** The range a selection covers, or `null` for home and nothing. */
export function selectionRange(
    selection: TimelineEditSelection,
): { readonly start: number; readonly end: number } | null {
    return selection.kind === "range"
        ? { start: selection.start, end: selection.end }
        : null;
}

/** Whether a selection is exactly the range `[start, end)`. */
export function selectionIsRange(
    selection: TimelineEditSelection,
    start: number,
    end: number,
): boolean {
    return (
        selection.kind === "range" &&
        selection.start === start &&
        selection.end === end
    );
}

/**
 * The stored timeline a selection resolves to: the one with exactly the selected range. When
 * several share it (UI-25), `windowTimelineId` when it is one of them, else the oldest (the page's
 * timeline). `null` for home, nothing, a range with no stored timeline yet, or before the
 * timelines are loaded.
 */
export function resolveStoredTimeline(
    selection: TimelineEditSelection,
    timelines: readonly StoredTimelineMembership[] | null,
    windowTimelineId: number | null = null,
): StoredTimelineMembership | null {
    if (selection.kind !== "range" || !timelines) return null;
    return (
        timelines.find(
            (t) =>
                t.id === windowTimelineId &&
                t.start === selection.start &&
                t.end === selection.end,
        ) ?? oldestOver(timelines, selection)
    );
}

/** `resolveStoredTimeline` for the store's state. */
export const selectedStoredTimeline = (
    state: Pick<TimelineSelectionState, "selection" | "storedTimelines"> &
        Partial<Pick<TimelineSelectionState, "windowTimelineId">>,
): StoredTimelineMembership | null =>
    resolveStoredTimeline(
        state.selection,
        state.storedTimelines,
        state.windowTimelineId ?? null,
    );

/** The isolated stored timeline with its members, or `null` (also before the timelines load). */
export const isolatedTimeline = (
    state: Pick<TimelineSelectionState, "isolation" | "storedTimelines">,
): StoredTimelineMembership | null =>
    state.isolation === null
        ? null
        : (state.storedTimelines?.find(
              (t) => t.id === state.isolation!.timelineId,
          ) ?? null);

/**
 * The move the window is on (UI-14): the isolated timeline (P may be anywhere inside it), else the
 * stored timeline the window resolves to, when it is off the page boxes. A page's own timeline
 * isn't a move (pages are moved with their flags), so it is `null` there, and with no timeline.
 * The Move card, the inspector's beat and **Select marchers**'s cleanup all go by this.
 */
export const windowMove = (
    state: Pick<
        TimelineSelectionState,
        "selection" | "storedTimelines" | "isolation" | "pageBoxes"
    > &
        Partial<Pick<TimelineSelectionState, "windowTimelineId">>,
): StoredTimelineMembership | null => {
    const timeline = isolatedTimeline(state) ?? selectedStoredTimeline(state);
    if (!timeline) return null;
    // UI-25: a move split off a page's timeline keeps the page's range but is a move
    return isPageTimeline(
        timeline,
        state.storedTimelines ?? [],
        state.pageBoxes,
    )
        ? null
        : timeline;
};

/**
 * Whether a marcher is dimmed. Under UI-10 nothing is dimmed: dragging a marcher is what adds it
 * to the window's timeline, so every marcher must stay selectable (_lead default_). Isolating a
 * timeline dims and locks every marcher that isn't in it.
 */
export function isMarcherDimmed(
    state: Pick<
        TimelineSelectionState,
        "selection" | "storedTimelines" | "isolation"
    >,
    marcherId: number,
): boolean {
    const isolated = isolatedTimeline(state);
    return isolated !== null && !isolated.marcherIds.has(marcherId);
}

const HOME: TimelineEditSelection = { kind: "home" };

type WindowFields = Pick<
    TimelineSelectionState,
    "selection" | "startBeat" | "playheadBeat" | "cursorBeat"
>;

/** The window fields for S and P, with `selection` derived from them. */
const windowFields = (
    startBeat: number,
    playheadBeat: number,
    boxes: readonly PageBox[],
): WindowFields => ({
    startBeat,
    playheadBeat,
    selection: editWindow(startBeat, playheadBeat, boxes),
    // Writing the window puts the canvas back at P (UI-11)
    cursorBeat: null,
});

/** Whether two selections are the same window. */
const sameSelection = (
    a: TimelineEditSelection,
    b: TimelineEditSelection,
): boolean =>
    a.kind === b.kind &&
    (a.kind !== "range" ||
        (b.kind === "range" && a.start === b.start && a.end === b.end));

/**
 * UI-25: `windowTimelineId` holds only while the window is that timeline's range (and it exists);
 * any update that moves the window off it, or deletes it, clears it.
 */
const keepWindowTimeline = (
    s: TimelineSelectionState,
    next: Partial<TimelineSelectionState>,
): Partial<TimelineSelectionState> => {
    const id =
        next.windowTimelineId !== undefined
            ? next.windowTimelineId
            : s.windowTimelineId;
    // The paired move goes with any change of the window
    if (
        s.pairedTimelineId !== null &&
        next.pairedTimelineId === undefined &&
        ((next.selection !== undefined && next.selection !== s.selection) ||
            (next.windowTimelineId !== undefined &&
                next.windowTimelineId !== s.windowTimelineId) ||
            next.isolation !== undefined)
    )
        next = { ...next, pairedTimelineId: null };
    if (id === null) return next;
    const selection = next.selection ?? s.selection;
    const timelines =
        next.storedTimelines !== undefined
            ? next.storedTimelines
            : s.storedTimelines;
    if (timelines === null && selection.kind === "range") return next;
    const timeline = timelines?.find((t) => t.id === id);
    return timeline &&
        selection.kind === "range" &&
        timeline.start === selection.start &&
        timeline.end === selection.end
        ? next
        : { ...next, windowTimelineId: null };
};

/**
 * Keeps the current `selection` object when an update writes an equal one, so `s => s.selection`
 * subscribers (the canvas, the timeline, dimming) don't run again for a playhead move inside the
 * same window, or for every scrub beat that rewrites it unchanged.
 */
const keepEqualSelection = (
    s: TimelineSelectionState,
    next: Partial<TimelineSelectionState>,
): Partial<TimelineSelectionState> =>
    next.selection !== undefined &&
    next.selection !== s.selection &&
    sameSelection(next.selection, s.selection)
        ? { ...next, selection: s.selection }
        : next;

/**
 * In Expert the loop is the window (UI-26): a write that moves the window to a range moves the
 * loop there too. Home, nothing and two lines held on one beat leave it. Isolation loops its own
 * move, and playing never moves the window, so neither changes it.
 */
const loopFollowsWindow = (
    s: TimelineSelectionState,
    next: Partial<TimelineSelectionState>,
): Partial<TimelineSelectionState> => {
    const merged = { ...s, ...next };
    const { selection, loop } = merged;
    if (
        !merged.startStays ||
        loop === null ||
        merged.isolation !== null ||
        selection === s.selection ||
        selection.kind !== "range" ||
        selection.end <= selection.start ||
        (loop.start === selection.start && loop.end === selection.end)
    )
        return next;
    return { ...next, loop: { start: selection.start, end: selection.end } };
};

/** The timeline-mode edit window and playhead. See the module comment. */
export const useTimelineSelectionStore = create<TimelineSelectionState>(
    // eslint-disable-next-line max-lines-per-function
    (rawSet) => {
        const set = (
            update:
                | Partial<TimelineSelectionState>
                | ((
                      s: TimelineSelectionState,
                  ) => Partial<TimelineSelectionState>),
        ) =>
            rawSet((s) =>
                keepWindowTimeline(
                    s,
                    keepEqualSelection(
                        s,
                        loopFollowsWindow(
                            s,
                            typeof update === "function" ? update(s) : update,
                        ),
                    ),
                ),
            );
        // The counts never end (endless counts), so only isolation bounds the playhead
        const clamp = (s: TimelineSelectionState, beat: number) => {
            const whole = normalizePlayheadBeat(beat);
            return s.isolation === null
                ? whole
                : isolatedPlayhead(s.isolation, whole);
        };
        // Inside isolation the playhead stays after the start: on the start flag, UI-10's window
        // falls back to the page box ending there, so a drag would edit the previous move
        const isolatedPlayhead = (isolation: TimelineIsolation, beat: number) =>
            Math.min(Math.max(beat, isolation.start + 1), isolation.end);
        // Isolation keeps S on the timeline's start
        const isolatedWindow = (
            s: TimelineSelectionState,
            isolation: TimelineIsolation,
            playheadBeat: number,
        ): WindowFields =>
            windowFields(isolation.start, playheadBeat, s.pageBoxes);
        // Where S goes when a write asks for `start` with the playhead at `playheadBeat`: there in
        // Expert, and in Basic during a gesture; otherwise Basic's S follows (UI-10)
        const startFor = (
            s: TimelineSelectionState,
            start: number,
            playheadBeat: number,
            boxes: readonly PageBox[] = s.pageBoxes,
        ) =>
            s.startStays || s.scrubbing
                ? start
                : followingStart(playheadBeat, boxes);
        // UI-26, Expert: a beat on or behind S swaps them (the beat becomes S, the old S the
        // playhead); on S's own beat, the window is the beat after it (the beat before it at the
        // show's end); beat 0 is home
        const expertSeek = (
            s: TimelineSelectionState,
            beat: number,
        ): { startBeat: number; playheadBeat: number } => {
            const playhead = clamp(s, beat);
            if (playhead === 0) return { startBeat: 0, playheadBeat: 0 };
            if (playhead > s.startBeat)
                return { startBeat: s.startBeat, playheadBeat: playhead };
            if (playhead < s.startBeat)
                return { startBeat: playhead, playheadBeat: s.startBeat };
            const later = clamp(s, playhead + 1);
            return later > playhead
                ? { startBeat: playhead, playheadBeat: later }
                : { startBeat: playhead - 1, playheadBeat: playhead };
        };
        // UI-21 follow-up (owner 2026-10-14): while a line drag holds the two lines on one beat,
        // the window is empty there, so neither the page before nor the page box shows selected.
        // Home stays home
        const lineDragWindow = (
            s: TimelineSelectionState,
            startBeat: number,
            playheadBeat: number,
        ): WindowFields => {
            const fields = windowFields(startBeat, playheadBeat, s.pageBoxes);
            return startBeat === playheadBeat &&
                fields.selection.kind === "range"
                ? {
                      ...fields,
                      selection: {
                          kind: "range",
                          start: playheadBeat,
                          end: playheadBeat,
                      },
                  }
                : fields;
        };
        // Released on the same beat (owner 2026-10-14), the dragged line stays and shoves the
        // other a beat on: a start flag pushes the playhead a beat later, a playhead pushes the
        // start flag a beat earlier. An Expert scrub or click on S's beat pushes the playhead
        // later, as a click there does (UI-26). At the show's end there is no later beat, so the
        // start flag goes back instead
        const landLineDrag = (
            s: TimelineSelectionState,
            drag: TimelineLineDrag,
        ): Partial<TimelineSelectionState> | null => {
            const beat = s.playheadBeat;
            if (s.startBeat !== beat || normalizePlayheadBeat(beat) === 0)
                return null;
            const later = clamp(s, beat + 1);
            const [startBeat, playheadBeat] =
                (drag.line === "start" || drag.scrub) && later > beat
                    ? [beat, later]
                    : [beat - 1, beat];
            return {
                ...windowFields(startBeat, playheadBeat, s.pageBoxes),
                ...(playheadBeat !== beat
                    ? { playheadRevision: s.playheadRevision + 1 }
                    : {}),
            };
        };
        // Reloads (page boxes, stored timelines, a clip move) rewrite the window without the user
        // seeking; while playing, they keep the cursor and the revision, so the audio isn't
        // restarted (UI-11)
        const keepCursorWhilePlaying =
            <T extends object>(
                fn: (s: TimelineSelectionState) => T,
            ): ((s: TimelineSelectionState) => T) =>
            (s) => {
                const next = fn(s);
                if (s.playback === null) return next;
                return {
                    ...next,
                    ...("cursorBeat" in next
                        ? { cursorBeat: s.cursorBeat }
                        : {}),
                    ...("playheadRevision" in next
                        ? { playheadRevision: s.playheadRevision }
                        : {}),
                };
            };
        const restored = (s: TimelineSelectionState) => {
            const r = s.isolation!.restore;
            return {
                ...windowFields(r.startBeat, r.playheadBeat, s.pageBoxes),
                isolation: null,
                windowTimelineId: r.windowTimelineId ?? null,
                playheadRevision: s.playheadRevision + 1,
            };
        };
        return {
            selection: HOME,
            startBeat: 0,
            startStays: true,
            playheadBeat: 0,
            playheadRevision: 0,
            pageBoxes: [],
            storedTimelines: null,
            showEndBeat: null,
            isolation: null,
            windowTimelineId: null,
            pairedTimelineId: null,
            pairTimeline: (timelineId) => set({ pairedTimelineId: timelineId }),
            cursorBeat: null,
            loop: null,
            playback: null,
            scrubbing: false,
            startPeek: null,
            lineDrag: null,
            isolate: (timelineId, restore) =>
                set((s) => {
                    if (s.isolation?.timelineId === timelineId) return {};
                    const timeline = s.storedTimelines?.find(
                        (t) => t.id === timelineId,
                    );
                    if (!timeline) return {};
                    const isolation: TimelineIsolation = {
                        timelineId,
                        start: timeline.start,
                        end: timeline.end,
                        // Isolating another timeline from inside one keeps the first restore point
                        restore: s.isolation?.restore ??
                            restore ?? {
                                startBeat: s.startBeat,
                                playheadBeat: s.playheadBeat,
                                windowTimelineId: s.windowTimelineId,
                            },
                    };
                    return {
                        ...isolatedWindow(s, isolation, timeline.end),
                        isolation,
                        windowTimelineId: timelineId,
                        // Isolated, there is no line drag (UI-21)
                        lineDrag: null,
                        playheadRevision: s.playheadRevision + 1,
                    };
                }),
            exitIsolation: () =>
                set((s) => (s.isolation === null ? {} : restored(s))),
            selectHome: () =>
                set((s) => ({
                    ...windowFields(0, 0, s.pageBoxes),
                    isolation: null,
                    scrubbing: false,
                    lineDrag: s.lineDrag?.scrub ? null : s.lineDrag,
                    playheadRevision: s.playheadRevision + 1,
                })),
            selectRange: (start, end, timelineId) =>
                set((s) => ({
                    isolation: null,
                    windowTimelineId: timelineId ?? null,
                    scrubbing: false,
                    lineDrag: s.lineDrag?.scrub ? null : s.lineDrag,
                    ...windowFields(start, end, s.pageBoxes),
                    playheadRevision: s.playheadRevision + 1,
                })),
            selectNothing: () =>
                set({
                    selection: { kind: "none" },
                    isolation: null,
                    cursorBeat: null,
                }),
            seek: (beat) => {
                if (!Number.isFinite(beat)) return;
                const state = useTimelineSelectionStore.getState();
                // An Expert scrub is a playhead line drag (UI-26)
                if (state.lineDrag?.scrub) {
                    state.dragLine(beat);
                    return;
                }
                set((s) => {
                    const playhead = clamp(s, beat);
                    if (s.isolation)
                        return {
                            ...isolatedWindow(s, s.isolation, playhead),
                            playheadRevision: s.playheadRevision + 1,
                        };
                    if (s.startStays) {
                        const at = expertSeek(s, beat);
                        return {
                            ...windowFields(
                                at.startBeat,
                                at.playheadBeat,
                                s.pageBoxes,
                            ),
                            playheadRevision: s.playheadRevision + 1,
                        };
                    }
                    // Basic: S follows the playhead's page; during a gesture it waits for it to
                    // end (UI-12 review)
                    return {
                        ...windowFields(
                            startFor(s, s.startBeat, playhead),
                            playhead,
                            s.pageBoxes,
                        ),
                        playheadRevision: s.playheadRevision + 1,
                    };
                });
            },
            seekKeepingStart: (beat) =>
                set((s) => {
                    if (!Number.isFinite(beat)) return {};
                    return {
                        ...(s.isolation
                            ? isolatedWindow(s, s.isolation, clamp(s, beat))
                            : windowFields(
                                  s.startBeat,
                                  clamp(s, beat),
                                  s.pageBoxes,
                              )),
                        playheadRevision: s.playheadRevision + 1,
                    };
                }),
            beginScrub: () =>
                set((s) => {
                    if (s.scrubbing) return {};
                    // UI-26: an Expert scrub drags the playhead as its line does, so passing S
                    // swaps them live and the field shows the dragged beat
                    const asLine =
                        s.startStays &&
                        s.isolation === null &&
                        s.playback === null &&
                        s.selection.kind !== "none" &&
                        s.lineDrag === null;
                    return {
                        scrubbing: true,
                        ...(asLine
                            ? {
                                  lineDrag: {
                                      line: "playhead" as const,
                                      startBeat: s.startBeat,
                                      playheadBeat: s.playheadBeat,
                                      beat: s.playheadBeat,
                                      scrub: true,
                                  },
                              }
                            : {}),
                    };
                }),
            endScrub: () => {
                const state = useTimelineSelectionStore.getState();
                if (!state.scrubbing) return;
                if (state.lineDrag?.scrub) state.endLineDrag();
                set((s) => {
                    if (
                        s.isolation ||
                        s.startStays ||
                        s.selection.kind === "none"
                    )
                        return { scrubbing: false };
                    return {
                        scrubbing: false,
                        ...windowFields(
                            followingStart(s.playheadBeat, s.pageBoxes),
                            s.playheadBeat,
                            s.pageBoxes,
                        ),
                    };
                });
            },
            beginLineDrag: (line) =>
                set((s) =>
                    s.isolation !== null ||
                    s.playback !== null ||
                    s.selection.kind === "none"
                        ? {}
                        : {
                              lineDrag: {
                                  line,
                                  startBeat: s.startBeat,
                                  playheadBeat: s.playheadBeat,
                                  beat:
                                      line === "start"
                                          ? s.startBeat
                                          : s.playheadBeat,
                              },
                          },
                ),
            dragLine: (beat) =>
                set((s) => {
                    const drag = s.lineDrag;
                    if (!drag || !Number.isFinite(beat)) return {};
                    const to = clamp(s, beat);
                    const at = lineDragPositions(drag, to);
                    const lineDrag =
                        drag.beat === to ? drag : { ...drag, beat: to };
                    if (
                        at.startBeat === s.startBeat &&
                        at.playheadBeat === s.playheadBeat
                    )
                        return lineDrag === drag ? {} : { lineDrag };
                    return {
                        lineDrag,
                        ...lineDragWindow(s, at.startBeat, at.playheadBeat),
                        ...(at.playheadBeat !== s.playheadBeat
                            ? { playheadRevision: s.playheadRevision + 1 }
                            : {}),
                    };
                }),
            endLineDrag: () =>
                set((s) => {
                    const drag = s.lineDrag;
                    if (!drag) return {};
                    const landed = landLineDrag(s, drag);
                    if (landed) return { lineDrag: null, ...landed };
                    // Not swapped: S is still where it was. In Basic it follows a playhead drag
                    const follows =
                        !s.startStays &&
                        drag.line === "playhead" &&
                        s.startBeat === drag.startBeat;
                    return follows
                        ? {
                              lineDrag: null,
                              ...windowFields(
                                  followingStart(s.playheadBeat, s.pageBoxes),
                                  s.playheadBeat,
                                  s.pageBoxes,
                              ),
                          }
                        : { lineDrag: null };
                }),
            cancelLineDrag: () =>
                set((s) => {
                    const drag = s.lineDrag;
                    if (!drag) return {};
                    return {
                        lineDrag: null,
                        ...windowFields(
                            drag.startBeat,
                            drag.playheadBeat,
                            s.pageBoxes,
                        ),
                        ...(drag.playheadBeat !== s.playheadBeat
                            ? { playheadRevision: s.playheadRevision + 1 }
                            : {}),
                    };
                }),
            // eslint-disable-next-line max-lines-per-function
            followTimelineRange: (from, to, timelineId) =>
                set(
                    // eslint-disable-next-line max-lines-per-function
                    keepCursorWhilePlaying((s) => {
                        // UI-25: with several moves over `from`, only the one that changed
                        const isIt = (t: {
                            id: number;
                            start: number;
                            end: number;
                        }) =>
                            timelineId === undefined
                                ? t.start === from.start && t.end === from.end
                                : t.id === timelineId;
                        const isolation =
                            s.isolation !== null &&
                            isIt({
                                id: s.isolation.timelineId,
                                start: s.isolation.start,
                                end: s.isolation.end,
                            })
                                ? {
                                      ...s.isolation,
                                      start: to.start,
                                      end: to.end,
                                  }
                                : s.isolation;
                        // A shift carries P along; a resize keeps it, unless it was on the end
                        const shift =
                            to.end - to.start === from.end - from.start
                                ? to.start - from.start
                                : null;
                        const playhead =
                            shift !== null
                                ? s.playheadBeat + shift
                                : s.playheadBeat === from.end
                                  ? to.end
                                  : s.playheadBeat;
                        // The isolated clip moved or resized: S and P go with it
                        if (isolation && isolation !== s.isolation)
                            return {
                                isolation,
                                ...isolatedWindow(
                                    s,
                                    isolation,
                                    isolatedPlayhead(isolation, playhead),
                                ),
                                storedTimelines:
                                    s.storedTimelines?.map((t) =>
                                        t.id === isolation.timelineId
                                            ? {
                                                  ...t,
                                                  start: isolation.start,
                                                  end: isolation.end,
                                              }
                                            : t,
                                    ) ?? null,
                                playheadRevision: s.playheadRevision + 1,
                            };
                        if (
                            !selectionIsRange(s.selection, from.start, from.end)
                        )
                            return {};
                        const selected = selectedStoredTimeline(s);
                        if (
                            timelineId !== undefined &&
                            selected !== null &&
                            selected.id !== timelineId
                        )
                            return {};
                        const moved = (t: StoredTimelineMembership) =>
                            isIt(t)
                                ? {
                                      ...t,
                                      start: to.start,
                                      end: to.end,
                                  }
                                : t;
                        const { start, end } = to;
                        return {
                            isolation,
                            ...windowFields(start, end, s.pageBoxes),
                            // Until the host reloads them, move the stored timeline too, so the moved
                            // selection still resolves to it meanwhile
                            storedTimelines:
                                s.storedTimelines?.map(moved) ?? null,
                            windowTimelineId: timelineId ?? s.windowTimelineId,
                        };
                    }),
                ),
            followPageFlagMove: (from, to) =>
                set(
                    keepCursorWhilePlaying((s) => {
                        if (s.isolation || from === to) return {};
                        const follow = (beat: number) =>
                            beat === from ? to : beat;
                        const onFlag = (r: { start: number; end: number }) =>
                            r.start === from || r.end === from;
                        const pageBoxes = s.pageBoxes.map((b) =>
                            onFlag(b)
                                ? {
                                      ...b,
                                      start: follow(b.start),
                                      end: follow(b.end),
                                  }
                                : b,
                        );
                        const startBeat = follow(s.startBeat);
                        const playheadBeat = follow(s.playheadBeat);
                        const fields =
                            startBeat === s.startBeat &&
                            playheadBeat === s.playheadBeat
                                ? {}
                                : s.selection.kind === "none"
                                  ? { startBeat, playheadBeat }
                                  : windowFields(
                                        startBeat,
                                        playheadBeat,
                                        pageBoxes,
                                    );
                        return {
                            pageBoxes,
                            ...fields,
                            storedTimelines:
                                s.storedTimelines?.map((t) =>
                                    onFlag(t)
                                        ? {
                                              ...t,
                                              start: follow(t.start),
                                              end: follow(t.end),
                                          }
                                        : t,
                                ) ?? null,
                        };
                    }),
                ),
            followTimelineShift: (from, delta, timelineId) =>
                useTimelineSelectionStore
                    .getState()
                    .followTimelineRange(
                        from,
                        { start: from.start + delta, end: from.end + delta },
                        timelineId,
                    ),
            setPageBoxes: (pageBoxes) =>
                set(
                    keepCursorWhilePlaying((s) => {
                        const same =
                            pageBoxes.length === s.pageBoxes.length &&
                            pageBoxes.every(
                                (b, i) =>
                                    b.start === s.pageBoxes[i]!.start &&
                                    b.end === s.pageBoxes[i]!.end &&
                                    b.name === s.pageBoxes[i]!.name,
                            );
                        if (same) return {};
                        if (s.isolation)
                            return {
                                pageBoxes,
                                ...isolatedWindow(
                                    { ...s, pageBoxes },
                                    s.isolation,
                                    s.playheadBeat,
                                ),
                            };
                        // Basic's S follows to the new boxes; Expert's stays (UI-26)
                        const startBeat = startFor(
                            s,
                            s.startBeat,
                            s.playheadBeat,
                            pageBoxes,
                        );
                        return {
                            pageBoxes,
                            ...(s.selection.kind === "none"
                                ? { startBeat }
                                : windowFields(
                                      startBeat,
                                      s.playheadBeat,
                                      pageBoxes,
                                  )),
                        };
                    }),
                ),
            setStoredTimelines: (storedTimelines) =>
                set(
                    keepCursorWhilePlaying((s) => {
                        // Stored timelines reload after every timeline edit, undo and redo, so
                        // while paused this drops a held preview frame: whatever edited (the
                        // canvas, the inspector, a shortcut) wrote at P, and the canvas goes back
                        // to show it
                        const dropHeld =
                            s.playback === null && s.cursorBeat !== null;
                        if (dropHeld && s.isolation === null)
                            return { storedTimelines, cursorBeat: null };
                        if (s.isolation === null || storedTimelines === null)
                            return {
                                storedTimelines,
                                ...(storedTimelines === null && s.isolation
                                    ? restored(s)
                                    : {}),
                            };
                        const timeline = storedTimelines.find(
                            (t) => t.id === s.isolation!.timelineId,
                        );
                        // The isolated timeline is gone (deleted, or undone away)
                        if (!timeline)
                            return { storedTimelines, ...restored(s) };
                        if (
                            timeline.start === s.isolation.start &&
                            timeline.end === s.isolation.end
                        )
                            return { storedTimelines };
                        // Its range changed (a clip move, a beat edit): follow it
                        const isolation = {
                            ...s.isolation,
                            start: timeline.start,
                            end: timeline.end,
                        };
                        const playhead = isolatedPlayhead(
                            isolation,
                            s.playheadBeat,
                        );
                        return {
                            storedTimelines,
                            isolation,
                            ...isolatedWindow(s, isolation, playhead),
                            playheadRevision: s.playheadRevision + 1,
                        };
                    }),
                ),
            cue: (beat) =>
                set((s) => {
                    if (!Number.isFinite(beat)) return {};
                    return {
                        cursorBeat: normalizePlayheadBeat(beat),
                        playheadRevision: s.playheadRevision + 1,
                    };
                }),
            clearCursor: () =>
                set((s) => (s.cursorBeat === null ? {} : { cursorBeat: null })),
            // Playing ends a line drag where it is (UI-21): its release seeks while playing,
            // which no longer reaches the store's line drag. Lines on one beat don't push there
            setPlayback: (playback) =>
                set((s) =>
                    playback === null
                        ? { playback }
                        : {
                              playback,
                              lineDrag: null,
                              // Two lines on one beat get UI-10's window back
                              selection: editWindow(
                                  s.startBeat,
                                  s.playheadBeat,
                                  s.pageBoxes,
                              ),
                          },
                ),
            setLoop: (loop) =>
                set((s) => {
                    const next =
                        loop === null || loop.end - loop.start < 1
                            ? null
                            : loop;
                    // UI-26: in Expert the loop is the window, so a loop set (C, a loop end's
                    // drag) sets the window to it, while paused and not isolated
                    const moveWindow =
                        next !== null &&
                        s.startStays &&
                        s.isolation === null &&
                        s.playback === null &&
                        !selectionIsRange(s.selection, next.start, next.end);
                    if (
                        !moveWindow &&
                        (next === s.loop ||
                            (next !== null &&
                                s.loop !== null &&
                                next.start === s.loop.start &&
                                next.end === s.loop.end))
                    )
                        return {};
                    return {
                        loop: next,
                        ...(moveWindow
                            ? {
                                  ...windowFields(
                                      next.start,
                                      next.end,
                                      s.pageBoxes,
                                  ),
                                  playheadRevision: s.playheadRevision + 1,
                              }
                            : {}),
                    };
                }),
            peekStart: (peek) =>
                set((s) => {
                    const startPeek = peek ? s.startBeat : null;
                    return startPeek === s.startPeek ? {} : { startPeek };
                }),
            setStartStays: (startStays) =>
                set((s) => (s.startStays === startStays ? {} : { startStays })),
            setShowEndBeat: (showEndBeat) => set({ showEndBeat }),
            reset: () =>
                set((s) => ({
                    ...windowFields(0, 0, s.pageBoxes),
                    playheadRevision: s.playheadRevision + 1,
                    isolation: null,
                    storedTimelines: null,
                    showEndBeat: null,
                    playback: null,
                    loop: null,
                    scrubbing: false,
                    startPeek: null,
                    lineDrag: null,
                })),
        };
    },
);

/**
 * The beat the timeline and the paused canvas show (UI-11): the cursor while a scrub suspends
 * playback, or
 * the playhead. Where audio starts, too.
 */
export const displayedBeat = (
    state: Pick<TimelineSelectionState, "cursorBeat" | "playheadBeat">,
): number => state.cursorBeat ?? state.playheadBeat;

/**
 * The beat the paused field shows (UI-26): the line being dragged (the start flag while it is
 * dragged, and the playhead's line once it has swapped to become the start flag), the start flag
 * just after an arrow key moved it, or else `displayedBeat`.
 */
export const fieldBeat = (
    state: Pick<
        TimelineSelectionState,
        "cursorBeat" | "playheadBeat" | "lineDrag" | "startPeek"
    >,
): number => state.lineDrag?.beat ?? state.startPeek ?? displayedBeat(state);

/** The stored timeline the selection resolves to (see `resolveStoredTimeline`). */
export const useSelectedStoredTimeline = (): StoredTimelineMembership | null =>
    useTimelineSelectionStore(selectedStoredTimeline);

declare global {
    interface Window {
        /** Scenario setup, in Playwright sessions only; see below. */
        openmarchPreview?: {
            hold(beat: number): void;
        };
    }
}

/**
 * Scenario setup (fork #202): a paused preview holding a frame. A user gets
 * one only mid-scrub over playback, with the button still down on the
 * timeline, so a scenario can't also press the field with Playwright's one
 * mouse. `hold` cues `beat` while paused, as that scrub does.
 */
if (typeof window !== "undefined" && isPlaywrightSession())
    window.openmarchPreview = {
        hold: (beat) => useTimelineSelectionStore.getState().cue(beat),
    };
