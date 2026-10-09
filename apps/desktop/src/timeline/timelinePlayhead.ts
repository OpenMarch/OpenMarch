import type { TimelineNavigation } from "@/components/timeline/TimelineViewModel";
import type {
    TimelineEditSelection,
    TimelinePlaybackRun,
} from "@/stores/TimelineSelectionStore";
import { pageEndBeat } from "./pageEndBeat";

/**
 * Pages as flags, and the playhead's rules (docs/timeline/ui.md UI-9: Pages, Home, Playhead, Play,
 * Page-relative tools; P8.11). Pure. Every beat is a spec beat position.
 *
 * A page is named by its end flag: page N's flag is its end beat (`pageEndBeat`), and its box is
 * the range from the previous flag to its own. The first page (page 0) is home: its flag is show
 * time 0, written as beat 0, and it has no range.
 */

/** The fields of a page these rules read. `Page` satisfies this. */
export interface FlagPage {
    readonly id: number;
    readonly beats: readonly { readonly index: number }[];
}

export interface PageFlag<P extends FlagPage = FlagPage> {
    readonly page: P;
    /** Where the page's flag is: its end beat, or 0 for home */
    readonly flag: number;
    /** The page's box, previous flag to its own flag; `null` for home */
    readonly range: { readonly start: number; readonly end: number } | null;
}

/** Every page's flag and range, in show order (`pages` as `useTimingObjects` returns them). */
export function pageFlags<P extends FlagPage>(
    pages: readonly P[],
): PageFlag<P>[] {
    return pages.map((page, index) => {
        if (index === 0) return { page, flag: 0, range: null };
        const start = pageEndBeat(pages[index - 1]!);
        return {
            page,
            flag: pageEndBeat(page),
            range: { start, end: pageEndBeat(page) },
        };
    });
}

/** What a selection of a page is: home for the first page, its range for any other. */
export function selectionOfPage(
    flag: PageFlag,
): Exclude<TimelineEditSelection, { kind: "none" }> {
    return flag.range
        ? { kind: "range", start: flag.range.start, end: flag.range.end }
        : { kind: "home" };
}

/**
 * Where page navigation goes from the playhead (UI-9 Page-relative tools): the first page is home;
 * the next page is the first flag after the playhead; the previous page is the last flag before
 * it; the last page is the last flag. `null` when there is no such page (or no pages).
 */
export function navigationTarget<P extends FlagPage>(
    pages: readonly P[],
    playheadBeat: number,
    direction: TimelineNavigation,
): PageFlag<P> | null {
    const flags = pageFlags(pages);
    if (flags.length === 0) return null;
    switch (direction) {
        case "first-page":
            return flags[0]!;
        case "last-page":
            return flags[flags.length - 1]!;
        case "next-page":
            return flags.find((f) => f.flag > playheadBeat) ?? null;
        case "previous-page":
            return (
                [...flags].reverse().find((f) => f.flag < playheadBeat) ?? null
            );
    }
}

/**
 * The page containing the playhead or ending at it: on a flag, the page that flag ends; between
 * flags, the page whose box holds it; at beat 0, the first page. Past the last flag, the last
 * page. `null` with no pages.
 */
export function pageAtPlayhead<P extends FlagPage>(
    pages: readonly P[],
    playheadBeat: number,
): P | null {
    const flags = pageFlags(pages);
    return (
        flags.find((f) => f.flag >= playheadBeat)?.page ??
        flags[flags.length - 1]?.page ??
        null
    );
}

/** The fields of the selection store these rules read. */
export interface PlaybackWindow {
    readonly selection: TimelineEditSelection;
    readonly isolation: {
        readonly start: number;
        readonly end: number;
    } | null;
}

/**
 * The window Shift+Space plays once (UI-11, UI-17): exactly `[S, P)`, with no roll on either side
 * (project owner, V-24). An isolated timeline gives its whole range, which Play loops, as it always
 * has (09-isolation.md). `null` when there is no window at least a beat long (home, nothing
 * selected).
 */
export function previewBounds(
    state: PlaybackWindow,
): { readonly from: number; readonly to: number } | null {
    if (state.isolation)
        return { from: state.isolation.start, to: state.isolation.end };
    const { selection } = state;
    if (selection.kind !== "range" || selection.end - selection.start < 1)
        return null;
    return { from: selection.start, to: selection.end };
}

/** Whether playing on can start from `beat`: there is time after it. */
export function canPlayOn(beat: number, showEndBeat: number): boolean {
    return beat < showEndBeat;
}

/**
 * What playback does at a live beat (UI-11, UI-17):
 *
 * - A preview, the pinned window's loop, goes back to its start at its end.
 * - Playing on stops at the end of the show (`"stop"`; the playhead stays there). An isolated
 *   timeline loops instead.
 */
export function playbackStep(
    run: TimelinePlaybackRun,
    liveBeat: number,
    showEndBeat: number,
    isolated: { readonly start: number; readonly end: number } | null,
): { readonly loopTo: number } | "stop" | null {
    if (run.kind === "preview")
        return liveBeat < run.to
            ? null
            : run.once
              ? "stop"
              : { loopTo: run.from };
    if (isolated && liveBeat >= isolated.end) return { loopTo: isolated.start };
    if (liveBeat >= showEndBeat) return "stop";
    return null;
}
