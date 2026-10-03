import { create } from "zustand";

/**
 * The timeline-mode selection and paused playhead (docs/timeline/ui.md UI-9, C-12; P8.11).
 *
 * In timeline mode there is no selected page. What the designer edits is the **selection**, and
 * where the canvas, playback and the inspector look is the **playhead**. They are independent:
 * seeking moves only the playhead, and selecting moves the playhead to the selection's end (home
 * moves it to beat 0).
 *
 * - **home**: page 0. No timeline is selected; nothing is dimmed and moves edit homes (at beat 0).
 * - **range**: a timeline's range in spec beats, half-open `[start, end)`. A page box selects its
 *   page's range (previous flag to its own flag); a dragged range is selected the same way. The
 *   range resolves to the stored timeline with exactly that range when there is one (at most one
 *   per range, C-12), so the selection survives the first **Add selected marchers** storing the
 *   timeline and an undo deleting it. Read the stored timeline with `selectedStoredTimeline` or
 *   `useSelectedStoredTimeline`.
 * - **none**: nothing selected.
 *
 * Every beat here is a spec beat position (`beats` index, spec §7). The zero-length beat 0 and
 * beat 1 are both show time 0; the playhead writes that time as 0 (`normalizePlayheadBeat`).
 *
 * `storedTimelines` is a read model of every stored timeline and who is in it, kept current by
 * `useTimelineSelectionHost` (mounted by `TimelineResolverHost`) after each timeline write, undo
 * and redo. It is `null` until first loaded and outside timeline mode.
 *
 * Page mode doesn't read this store.
 */

/** Home, a range or nothing (UI-9, "What the selection holds"). */
export type TimelineEditSelection =
    | { readonly kind: "home" }
    | {
          readonly kind: "range";
          /** First beat, inclusive (spec beats) */
          readonly start: number;
          /** End beat, exclusive: the flag the range ends on */
          readonly end: number;
      }
    | { readonly kind: "none" };

/** A stored timeline and the marchers with an assignment in any of its transitions. */
export interface StoredTimelineMembership {
    readonly id: number;
    readonly start: number;
    readonly end: number;
    readonly marcherIds: ReadonlySet<number>;
}

export interface TimelineSelectionState {
    readonly selection: TimelineEditSelection;
    /** The paused playhead: a whole spec beat in `[0, beats.length]`. Not updated while playing. */
    readonly playheadBeat: number;
    /**
     * Increments on every playhead write, including one to the beat it is already on, so playback
     * can restart from it (the loop back to a range's start).
     */
    readonly playheadRevision: number;
    /** Every stored timeline, by start then id; `null` until loaded */
    readonly storedTimelines: readonly StoredTimelineMembership[] | null;
    /**
     * The end of the show (`beats.length`), the furthest the playhead goes; `null` while unknown.
     * Kept by `useTimelinePlaybackDriver`.
     */
    readonly showEndBeat: number | null;

    /** Selects home and moves the playhead to beat 0. */
    readonly selectHome: () => void;
    /** Selects `[start, end)` and moves the playhead to `end`. */
    readonly selectRange: (start: number, end: number) => void;
    /** Clears the selection; the playhead stays. */
    readonly selectNothing: () => void;
    /**
     * Moves the playhead only (`normalizePlayheadBeat`, at most `showEndBeat`); the selection
     * stays. A non-finite beat is ignored.
     */
    readonly seek: (beat: number) => void;
    /**
     * A stored timeline moved from `from` by `delta` beats (a clip move): a selection of exactly
     * `from` moves with it, and so does the loaded stored timeline at `from` until the host
     * reloads, so the selection keeps resolving to it. The playhead stays.
     */
    readonly followTimelineShift: (
        from: { readonly start: number; readonly end: number },
        delta: number,
    ) => void;
    /** Used by `useTimelineSelectionHost` only. */
    readonly setStoredTimelines: (
        timelines: readonly StoredTimelineMembership[] | null,
    ) => void;
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

/**
 * Whether a marcher is dimmed (UI-9 Selection): the selected range resolves to a stored timeline
 * and the marcher has no transition in it. Dimmed marchers can't be selected, hit or moved.
 * Nothing is dimmed at home, with nothing selected, before the stored timelines load, or for a
 * range with no stored timeline yet (a new page's box, a dragged range): that range is where a
 * timeline is created, so marchers stay selectable for **Add selected marchers** (project owner,
 * 2026-10-02). A stored timeline with nobody in it still dims everyone.
 */
export function isMarcherDimmed(
    state: Pick<TimelineSelectionState, "selection" | "storedTimelines">,
    marcherId: number,
): boolean {
    const timeline = selectedStoredTimeline(state);
    return timeline !== null && !timeline.marcherIds.has(marcherId);
}

const HOME: TimelineEditSelection = { kind: "home" };

/** The timeline-mode selection and playhead. See the module comment. */
export const useTimelineSelectionStore = create<TimelineSelectionState>(
    (set) => ({
        selection: HOME,
        playheadBeat: 0,
        playheadRevision: 0,
        storedTimelines: null,
        showEndBeat: null,
        selectHome: () =>
            set((s) => ({
                selection: HOME,
                playheadBeat: 0,
                playheadRevision: s.playheadRevision + 1,
            })),
        selectRange: (start, end) =>
            set((s) => ({
                selection: { kind: "range", start, end },
                playheadBeat: end,
                playheadRevision: s.playheadRevision + 1,
            })),
        selectNothing: () => set({ selection: { kind: "none" } }),
        seek: (beat) =>
            set((s) => {
                if (!Number.isFinite(beat)) return {};
                const whole = normalizePlayheadBeat(beat);
                return {
                    playheadBeat:
                        s.showEndBeat === null
                            ? whole
                            : Math.min(whole, s.showEndBeat),
                    playheadRevision: s.playheadRevision + 1,
                };
            }),
        followTimelineShift: (from, delta) =>
            set((s) => {
                if (!selectionIsRange(s.selection, from.start, from.end))
                    return {};
                const moved = (t: StoredTimelineMembership) =>
                    t.start === from.start && t.end === from.end
                        ? { ...t, start: t.start + delta, end: t.end + delta }
                        : t;
                return {
                    selection: {
                        kind: "range",
                        start: from.start + delta,
                        end: from.end + delta,
                    },
                    // Until the host reloads them, move the stored timeline too, so the moved
                    // selection still resolves to it and nobody is dimmed or deselected meanwhile
                    storedTimelines: s.storedTimelines?.map(moved) ?? null,
                };
            }),
        setStoredTimelines: (storedTimelines) => set({ storedTimelines }),
        setShowEndBeat: (showEndBeat) => set({ showEndBeat }),
        reset: () =>
            set((s) => ({
                selection: HOME,
                playheadBeat: 0,
                playheadRevision: s.playheadRevision + 1,
                storedTimelines: null,
                showEndBeat: null,
            })),
    }),
);

/** The stored timeline the selection resolves to (see `resolveStoredTimeline`). */
export const useSelectedStoredTimeline = (): StoredTimelineMembership | null =>
    useTimelineSelectionStore(selectedStoredTimeline);
