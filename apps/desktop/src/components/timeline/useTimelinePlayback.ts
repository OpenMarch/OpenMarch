import { useEffect, useMemo, useState } from "react";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import type Beat from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";
import { beatIndexAtTime } from "@/timeline/timeMap";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import { getLivePlaybackPosition } from "./audio/AudioPlayer";
import type { TimelinePlayback } from "./Timeline";
import type { TimelineNavigation } from "./TimelineViewModel";

/**
 * The page that contains a beat: the last page whose first beat is at or before it. Pages are in
 * show order, as `useTimingObjects` returns them.
 */
export function pageAtBeat(
    pages: readonly Page[],
    beatIndex: number,
): Page | null {
    let found: Page | null = null;
    for (const page of pages) {
        const start = page.beats[0]?.index;
        if (start == null || start > beatIndex) continue;
        if (found == null || start >= (found.beats[0]?.index ?? -1))
            found = page;
    }
    return found;
}

/**
 * The page a seek to a beat line selects: the page whose move contains or ends at that line, so
 * seeking to the paused cursor (the selected page's end beat) keeps the selection. Line 0 selects
 * the first page.
 */
export function pageForSeek(
    pages: readonly Page[],
    beatIndex: number,
): Page | null {
    return pageAtBeat(pages, Math.max(beatIndex - 1, 0));
}

/** The page a transport navigation button lands on, or null to stay put. */
export function pageForNavigation(
    pages: readonly Page[],
    current: Page | null,
    direction: TimelineNavigation,
): Page | null {
    if (pages.length === 0) return null;
    if (direction === "first-page") return pages[0]!;
    if (direction === "last-page") return pages[pages.length - 1]!;
    if (!current) return null;
    const index = pages.findIndex((page) => page.id === current.id);
    if (index < 0) return null;
    const next = direction === "next-page" ? index + 1 : index - 1;
    return pages[next] ?? null;
}

/**
 * Feeds the timeline from the app's existing playback clock: `IsPlayingContext`, the selected
 * page and the audio player's `getLivePlaybackPosition` (the path P5.4 kept). The 0.2 frame clock
 * isn't wired in yet, so this is the one place the timeline reads playback.
 *
 * - While playing, the cursor is `beatIndexAtTime(beats, seconds)`, updated once per animation
 *   frame and re-rendered only when the beat changes. With no beats it returns -1, which is never
 *   used as a position.
 * - While paused, the cursor is the selected page's end beat (`pageEndBeat`), where the canvas
 *   draws the page.
 * - Seeking (`pageForSeek`) and page navigation select a page, the only paused position the
 *   clock has; they do nothing while playing, as the page navigation actions do.
 * - While paused, `pageLabel` names the selected page.
 */
export function useTimelinePlayback({
    beats,
    pages,
}: {
    beats: readonly Beat[];
    pages: readonly Page[];
}): TimelinePlayback {
    const { isPlaying, setIsPlaying } = useIsPlaying()!;
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const [liveBeat, setLiveBeat] = useState<number | null>(null);

    useEffect(() => {
        if (!isPlaying) {
            setLiveBeat(null);
            return;
        }
        let frame = 0;
        const update = () => {
            const index = beatIndexAtTime(beats, getLivePlaybackPosition());
            if (index >= 0) setLiveBeat(index);
            frame = requestAnimationFrame(update);
        };
        update();
        return () => cancelAnimationFrame(frame);
    }, [beats, isPlaying]);

    return useMemo<TimelinePlayback>(() => {
        const pausedBeat = selectedPage ? pageEndBeat(selectedPage) : 0;
        return {
            positionBeat: isPlaying && liveBeat != null ? liveBeat : pausedBeat,
            // The paused cursor is on the selected page's end beat, which is also the next page's
            // first beat, so name the selected page
            pageLabel: isPlaying ? undefined : selectedPage?.name,
            isPlaying,
            onSeek: (beatIndex) => {
                if (isPlaying) return;
                const page = pageForSeek(pages, beatIndex);
                if (page) setSelectedPage(page);
            },
            onNavigate: (direction) => {
                if (isPlaying) return;
                const page = pageForNavigation(pages, selectedPage, direction);
                if (page) setSelectedPage(page);
            },
            onPlayingChange: (next) => {
                // Same rule as the play/pause action: playback runs from the selected page to the next
                if (next && (!selectedPage || selectedPage.nextPageId === null))
                    return;
                setIsPlaying(next);
            },
        };
    }, [
        isPlaying,
        liveBeat,
        pages,
        selectedPage,
        setIsPlaying,
        setSelectedPage,
    ]);
}
