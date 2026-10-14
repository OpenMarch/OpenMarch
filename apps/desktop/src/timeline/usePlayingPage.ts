import { useEffect, useMemo, useRef, useState } from "react";
import {
    getLivePlaybackPosition,
    playbackStartInfoRef,
} from "@/components/timeline/audio/AudioPlayer";
import { useIsPlaying } from "@/context/IsPlayingContext";
import type Page from "@/global/classes/Page";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { beatAtTime } from "./timeMap";
import { pageAtBeatOfFlags, pageFlags } from "./timelinePlayhead";

/**
 * While timeline-mode playback runs, the page being played: the page box holding the live beat
 * (`pageAtPlayhead`, the rule the readout and Basic's edits use). `null` while paused and before
 * the audio starts.
 *
 * The selected page doesn't follow playback (`useTimelinePageBridge` waits until
 * it stops, as selecting a page re-renders everything that reads it), so the inspector reads this
 * instead while playing, through `InspectorPageProvider` (one loop for the whole inspector). It
 * polls the audio position once per frame and re-renders its caller only when the page changes.
 */
export function usePlayingPage(): Page | null {
    const isPlaying = useIsPlaying()?.isPlaying ?? false;
    const { pages, beats } = useTimingObjects();
    const flags = useMemo(() => pageFlags(pages), [pages]);
    const [pageId, setPageId] = useState<number | null>(null);
    const lastPageId = useRef<number | null>(null);

    useEffect(() => {
        const set = (id: number | null) => {
            if (id === lastPageId.current) return;
            lastPageId.current = id;
            setPageId(id);
        };
        if (!isPlaying) {
            set(null);
            return;
        }
        let frame = 0;
        const update = () => {
            // No live position until the audio player has started
            if (playbackStartInfoRef.current)
                set(
                    pageAtBeatOfFlags(
                        flags,
                        beatAtTime(beats, getLivePlaybackPosition()),
                    )?.id ?? null,
                );
            frame = requestAnimationFrame(update);
        };
        update();
        return () => cancelAnimationFrame(frame);
    }, [isPlaying, flags, beats]);

    if (pageId === null) return null;
    return pages.find((p) => p.id === pageId) ?? null;
}
