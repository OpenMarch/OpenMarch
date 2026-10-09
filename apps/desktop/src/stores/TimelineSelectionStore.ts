import { create } from "zustand";

/**
 * The timeline-mode edit window and paused playhead (docs/timeline/ui.md UI-9, UI-10, C-12;
 * P8.11, P8.17).
 *
 * In timeline mode there is no selected page. What the designer edits is the **edit window**, from
 * the **start flag** S to the paused **playhead** P (UI-10): movers leave S and arrive at P. The
 * window is stored as `selection`, derived from S, P and the page boxes on every change:
 *
 * - **home**: P at beat 0. No timeline is selected; nothing is dimmed and moves edit homes.
 * - **range**: `[S, P)` when P is after S; otherwise (P on or before S, as just after C pins S on P) the
 *   page box ending at or holding P, as if S followed P. A range resolves to the stored timeline
 *   with exactly that range when there is one (at most one per range, C-12). Read it with
 *   `selectedStoredTimeline` or `useSelectedStoredTimeline`.
 * - **none**: nothing selected (`selectNothing`).
 *
 * The start flag follows navigation unless pinned (UI-10, _lead default_): `seek` and
 * `selectRange` put S on the start of the page box holding P. `selectRange` pins S when it isn't
 * there (a dragged range, the start handle). A pinned S stays until it is unpinned (UI-12). During
 * a gesture (a scrub, arrow keys held on the playhead) S stays put and follows once the gesture
 * ends (`beginScrub`, `endScrub`; UI-12 review), so it doesn't chase the playhead page by page.
 * Stopping a play-on run moves P, and an unpinned S follows it; a stopped preview leaves both.
 *
 * Every beat here is a spec beat position (`beats` index, spec §7). The zero-length beat 0 and
 * beat 1 are both show time 0; the playhead writes that time as 0 (`normalizePlayheadBeat`).
 *
 * `storedTimelines` is a read model of every stored timeline and who is in it, kept current by
 * `useTimelineSelectionHost` (mounted by `TimelineResolverHost`) after each timeline write, undo
 * and redo. It is `null` until first loaded and outside timeline mode. `pageBoxes` is kept by
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
 *
 * Page mode doesn't read this store.
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
        readonly startPinned: boolean;
        readonly playheadBeat: number;
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
          /** Plays once and stops instead of looping (UI-17: Shift+Space plays the page once) */
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
    /** Whether S was placed by hand; an unpinned S follows navigation */
    readonly startPinned: boolean;
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
     * The end of the show (`beats.length`), the furthest the playhead goes; `null` while unknown.
     * Kept by `useTimelinePlaybackDriver`.
     */
    readonly showEndBeat: number | null;
    /** The isolated timeline, or `null` (see the module comment) */
    readonly isolation: TimelineIsolation | null;
    /**
     * The playback cursor when it isn't the playhead (UI-11): where playback started or a loop
     * went back to, or the beat a scrub over playback shows. `null` when it is the playhead.
     */
    readonly cursorBeat: number | null;
    /** What is playing, or `null` while paused (UI-11) */
    readonly playback: TimelinePlaybackRun | null;
    /**
     * The loop (UI-17): its own region, apart from the edit window, as Logic's cycle region. While
     * set, Play loops it wherever the playhead is and stopping returns to the playhead. Moving the
     * playhead (a scrub, a click on a count, arrow keys) leaves it; going to a page (E, Q, a page
     * box) moves it to that page. `null` when looping is off.
     */
    readonly loop: TimelineLoop | null;
    /** A gesture is moving the playhead: an unpinned S waits for it to end (UI-12 review) */
    readonly scrubbing: boolean;

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
    /** Moves the playhead to beat 0 (home); S goes there too and is unpinned. */
    readonly selectHome: () => void;
    /**
     * Sets the window to `[start, end)`: the playhead to `end` and S to `start`, pinned unless
     * `start` is where S would follow to (a page box). Page boxes, page navigation, **+**, a dragged
     * range and the range handles call this.
     */
    readonly selectRange: (start: number, end: number) => void;
    /** Clears the selection; the playhead and S stay. */
    readonly selectNothing: () => void;
    /**
     * Unpins S (UI-12, the pin mark): it goes back to following the playhead, to the start of the
     * page box holding P. Does nothing in isolation, whose S is the isolated timeline's start.
     */
    readonly unpinStart: () => void;
    /**
     * Navigation: moves the playhead (`normalizePlayheadBeat`, at most `showEndBeat`). An unpinned
     * S follows it, except during a gesture (`beginScrub`); a pinned S stays (UI-12). A non-finite
     * beat is ignored.
     */
    readonly seek: (beat: number) => void;
    /** Moves the playhead and leaves S where it is. */
    readonly seekKeepingStart: (beat: number) => void;
    /**
     * A gesture that moves the playhead began (a scrub, a page-box drag, arrow keys): `seek` leaves
     * an unpinned S where it is until `endScrub`.
     */
    readonly beginScrub: () => void;
    /** The gesture ended: an unpinned S follows the playhead, once. */
    readonly endScrub: () => void;
    /**
     * A stored timeline moved from `from` by `delta` beats (a clip move): a selection of exactly
     * `from` moves with it, and so does the loaded stored timeline at `from` until the host
     * reloads, so the selection keeps resolving to it. The window's end is the playhead, so the
     * playhead moves too (while paused; it doesn't bump `playheadRevision`, as nothing is playing).
     */
    readonly followTimelineShift: (
        from: { readonly start: number; readonly end: number },
        delta: number,
    ) => void;
    /**
     * A page flag moved from beat `from` to `to` (docs/timeline/research/move-page-flag case 14):
     * a playhead or start flag on it goes with it, so the selected page stays selected. The page
     * boxes and the loaded stored timelines with an edge on it follow too, until the pages and the
     * host reload. A pinned S stays pinned unless it is now where it would follow to. Nothing
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
    /** Sets the loop, or turns looping off with `null` (UI-17) */
    readonly setLoop: (loop: TimelineLoop | null) => void;
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

/**
 * Where an unpinned start flag sits for a playhead at `playheadBeat` (UI-10): the start of the
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
 * The stored timeline a selection resolves to: the one with exactly the selected range. `null`
 * for home, nothing, a range with no stored timeline yet, or before the timelines are loaded.
 */
export function resolveStoredTimeline(
    selection: TimelineEditSelection,
    timelines: readonly StoredTimelineMembership[] | null,
): StoredTimelineMembership | null {
    if (selection.kind !== "range" || !timelines) return null;
    return (
        timelines.find(
            (t) => t.start === selection.start && t.end === selection.end,
        ) ?? null
    );
}

/** `resolveStoredTimeline` for the store's state. */
export const selectedStoredTimeline = (
    state: Pick<TimelineSelectionState, "selection" | "storedTimelines">,
): StoredTimelineMembership | null =>
    resolveStoredTimeline(state.selection, state.storedTimelines);

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
 * The Move card, the inspector's beat and **Select them**'s cleanup all go by this.
 */
export const windowMove = (
    state: Pick<
        TimelineSelectionState,
        "selection" | "storedTimelines" | "isolation" | "pageBoxes"
    >,
): StoredTimelineMembership | null => {
    const timeline = isolatedTimeline(state) ?? selectedStoredTimeline(state);
    if (!timeline) return null;
    const onPageBox = state.pageBoxes.some(
        (box) => box.start === timeline.start && box.end === timeline.end,
    );
    return onPageBox ? null : timeline;
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
    "selection" | "startBeat" | "startPinned" | "playheadBeat" | "cursorBeat"
>;

/** The window fields for S, its pin and P, with `selection` derived from them. */
const windowFields = (
    startBeat: number,
    startPinned: boolean,
    playheadBeat: number,
    boxes: readonly PageBox[],
): WindowFields => ({
    startBeat,
    startPinned,
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
                keepEqualSelection(
                    s,
                    typeof update === "function" ? update(s) : update,
                ),
            );
        const clamp = (s: TimelineSelectionState, beat: number) => {
            const whole = normalizePlayheadBeat(beat);
            const bounded =
                s.showEndBeat === null ? whole : Math.min(whole, s.showEndBeat);
            return s.isolation === null
                ? bounded
                : isolatedPlayhead(s.isolation, bounded);
        };
        // Inside isolation the playhead stays after the start: on the start flag, UI-10's window
        // falls back to the page box ending there, so a drag would edit the previous move
        const isolatedPlayhead = (isolation: TimelineIsolation, beat: number) =>
            Math.min(Math.max(beat, isolation.start + 1), isolation.end);
        // Isolation keeps S on the timeline's start, pinned unless S would follow there anyway
        const isolatedWindow = (
            s: TimelineSelectionState,
            isolation: TimelineIsolation,
            playheadBeat: number,
        ): WindowFields =>
            windowFields(
                isolation.start,
                isolation.start !== followingStart(playheadBeat, s.pageBoxes),
                playheadBeat,
                s.pageBoxes,
            );
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
                ...windowFields(
                    r.startBeat,
                    r.startPinned,
                    s.showEndBeat === null
                        ? r.playheadBeat
                        : Math.min(r.playheadBeat, s.showEndBeat),
                    s.pageBoxes,
                ),
                isolation: null,
                playheadRevision: s.playheadRevision + 1,
            };
        };
        return {
            selection: HOME,
            startBeat: 0,
            startPinned: false,
            playheadBeat: 0,
            playheadRevision: 0,
            pageBoxes: [],
            storedTimelines: null,
            showEndBeat: null,
            isolation: null,
            cursorBeat: null,
            loop: null,
            playback: null,
            scrubbing: false,
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
                                startPinned: s.startPinned,
                                playheadBeat: s.playheadBeat,
                            },
                    };
                    return {
                        ...isolatedWindow(s, isolation, timeline.end),
                        isolation,
                        playheadRevision: s.playheadRevision + 1,
                    };
                }),
            exitIsolation: () =>
                set((s) => (s.isolation === null ? {} : restored(s))),
            selectHome: () =>
                set((s) => ({
                    ...windowFields(0, false, 0, s.pageBoxes),
                    isolation: null,
                    scrubbing: false,
                    playheadRevision: s.playheadRevision + 1,
                })),
            selectRange: (start, end) =>
                set((s) => ({
                    isolation: null,
                    scrubbing: false,
                    ...windowFields(
                        start,
                        start !== followingStart(end, s.pageBoxes),
                        end,
                        s.pageBoxes,
                    ),
                    playheadRevision: s.playheadRevision + 1,
                })),
            selectNothing: () =>
                set({
                    selection: { kind: "none" },
                    isolation: null,
                    cursorBeat: null,
                }),
            unpinStart: () =>
                set((s) =>
                    s.isolation !== null || !s.startPinned
                        ? {}
                        : windowFields(
                              followingStart(s.playheadBeat, s.pageBoxes),
                              false,
                              s.playheadBeat,
                              s.pageBoxes,
                          ),
                ),
            seek: (beat) =>
                set((s) => {
                    if (!Number.isFinite(beat)) return {};
                    const playhead = clamp(s, beat);
                    if (s.isolation)
                        return {
                            ...isolatedWindow(s, s.isolation, playhead),
                            playheadRevision: s.playheadRevision + 1,
                        };
                    // UI-12: only an explicit action unpins S (the pin, a page box, home), never
                    // moving the playhead, since dragging now scrubs. With P on or before a pinned
                    // S the window falls back to the page box holding P, as after Stop. During a
                    // gesture an unpinned S waits for it to end (UI-12 review)
                    const keep = s.startPinned || s.scrubbing;
                    return {
                        ...windowFields(
                            keep
                                ? s.startBeat
                                : followingStart(playhead, s.pageBoxes),
                            s.startPinned,
                            playhead,
                            s.pageBoxes,
                        ),
                        playheadRevision: s.playheadRevision + 1,
                    };
                }),
            seekKeepingStart: (beat) =>
                set((s) => {
                    if (!Number.isFinite(beat)) return {};
                    return {
                        ...(s.isolation
                            ? isolatedWindow(s, s.isolation, clamp(s, beat))
                            : windowFields(
                                  s.startBeat,
                                  s.startPinned,
                                  clamp(s, beat),
                                  s.pageBoxes,
                              )),
                        playheadRevision: s.playheadRevision + 1,
                    };
                }),
            beginScrub: () =>
                set((s) => (s.scrubbing ? {} : { scrubbing: true })),
            endScrub: () =>
                set((s) => {
                    if (!s.scrubbing) return {};
                    if (
                        s.isolation ||
                        s.startPinned ||
                        s.selection.kind === "none"
                    )
                        return { scrubbing: false };
                    return {
                        scrubbing: false,
                        ...windowFields(
                            followingStart(s.playheadBeat, s.pageBoxes),
                            false,
                            s.playheadBeat,
                            s.pageBoxes,
                        ),
                    };
                }),
            followTimelineRange: (from, to) =>
                set(
                    keepCursorWhilePlaying((s) => {
                        const isolation =
                            s.isolation?.start === from.start &&
                            s.isolation.end === from.end
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
                        const moved = (t: StoredTimelineMembership) =>
                            t.start === from.start && t.end === from.end
                                ? {
                                      ...t,
                                      start: to.start,
                                      end: to.end,
                                  }
                                : t;
                        const { start, end } = to;
                        return {
                            isolation,
                            ...windowFields(
                                start,
                                start !== followingStart(end, s.pageBoxes),
                                end,
                                s.pageBoxes,
                            ),
                            // Until the host reloads them, move the stored timeline too, so the moved
                            // selection still resolves to it meanwhile
                            storedTimelines:
                                s.storedTimelines?.map(moved) ?? null,
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
                                        s.startPinned &&
                                            startBeat !==
                                                followingStart(
                                                    playheadBeat,
                                                    pageBoxes,
                                                ),
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
            followTimelineShift: (from, delta) =>
                useTimelineSelectionStore.getState().followTimelineRange(from, {
                    start: from.start + delta,
                    end: from.end + delta,
                }),
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
                        // A pinned S that is where S would follow to now (set before the boxes
                        // loaded, or a flag moved onto it) is unpinned, so it follows from here on
                        const following = followingStart(
                            s.playheadBeat,
                            pageBoxes,
                        );
                        const pinned =
                            s.startPinned && s.startBeat !== following;
                        return {
                            pageBoxes,
                            ...(s.selection.kind === "none"
                                ? {
                                      startBeat: pinned
                                          ? s.startBeat
                                          : following,
                                      startPinned: pinned,
                                  }
                                : windowFields(
                                      pinned ? s.startBeat : following,
                                      pinned,
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
                    const whole = normalizePlayheadBeat(beat);
                    return {
                        cursorBeat:
                            s.showEndBeat === null
                                ? whole
                                : Math.min(whole, s.showEndBeat),
                        playheadRevision: s.playheadRevision + 1,
                    };
                }),
            clearCursor: () =>
                set((s) => (s.cursorBeat === null ? {} : { cursorBeat: null })),
            setPlayback: (playback) => set({ playback }),
            setLoop: (loop) =>
                set((s) =>
                    loop === s.loop ||
                    (loop !== null &&
                        s.loop !== null &&
                        loop.start === s.loop.start &&
                        loop.end === s.loop.end)
                        ? {}
                        : {
                              loop:
                                  loop === null || loop.end - loop.start < 1
                                      ? null
                                      : loop,
                          },
                ),
            setShowEndBeat: (showEndBeat) => set({ showEndBeat }),
            reset: () =>
                set((s) => ({
                    ...windowFields(0, false, 0, s.pageBoxes),
                    playheadRevision: s.playheadRevision + 1,
                    isolation: null,
                    storedTimelines: null,
                    showEndBeat: null,
                    playback: null,
                    loop: null,
                    scrubbing: false,
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

/** The stored timeline the selection resolves to (see `resolveStoredTimeline`). */
export const useSelectedStoredTimeline = (): StoredTimelineMembership | null =>
    useTimelineSelectionStore(selectedStoredTimeline);
