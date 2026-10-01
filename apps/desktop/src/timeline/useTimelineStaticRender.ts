import { useEffect, useRef } from "react";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { pageEndBeat, TimelinePositionBuffer } from "./timelineCanvas";
import { useTimelineResolverStore } from "./timelineStore";

/**
 * Draws the static (not playing) canvas in timeline mode (docs/timeline/phases/05-rendering.md
 * P5.5): every marcher at the resolver's position at the selected page's end beat
 * (`pageEndBeat`), in place of the marcher_pages render. Redraws when the resolver's answers
 * change. When the resolver isn't ready, marchers stay where they are.
 *
 * Does nothing while `enabled` is false (the flag is off) or while playing, when `useAnimation`
 * draws.
 *
 * @param redrawKey anything whose change means the canvas marchers were re-created, such as the
 * marcher visuals
 */
export function useTimelineStaticRender({
    canvas,
    selectedPage,
    isPlaying,
    enabled,
    redrawKey,
}: {
    canvas: OpenMarchCanvas | null;
    selectedPage: {
        readonly beats: readonly { readonly index: number }[];
    } | null;
    isPlaying: boolean;
    enabled: boolean;
    redrawKey?: unknown;
}): void {
    const version = useTimelineResolverStore((s) => s.version);
    const bufferRef = useRef<TimelinePositionBuffer | null>(null);

    useEffect(() => {
        if (!enabled || !canvas || !selectedPage || isPlaying) return;
        const buffer = (bufferRef.current ??= new TimelinePositionBuffer());
        if (!buffer.fill(pageEndBeat(selectedPage))) return;
        canvas.renderMarcherPositions(buffer);
    }, [enabled, canvas, selectedPage, isPlaying, version, redrawKey]);
}
