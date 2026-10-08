import {
    applyIsolationPlan,
    useIsolationPlanStore,
} from "./timelineIsolationPlan";
import { useEffect, useRef } from "react";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { pageEndBeat, TimelinePositionBuffer } from "./timelineCanvas";
import { useTimelineResolverStore } from "./timelineStore";
import {
    displayedBeat,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";

/**
 * Draws the static (not playing) canvas in timeline mode (docs/timeline/phases/05-rendering.md
 * P5.5): every marcher at the resolver's position at the paused playhead (`beat`, UI-9), or else
 * the selected page's end beat (`pageEndBeat`), in place of the marcher_pages render. Redraws when the resolver's answers
 * change. When the resolver isn't ready, marchers stay where they are.
 *
 * Does nothing while `enabled` is false (the flag is off) or while playing, when `useAnimation`
 * draws.
 *
 * With `followPlayhead`, it draws at the beat the timeline shows (`displayedBeat`: the paused
 * playhead, or a held preview frame) and follows it through a store subscription, so a scrub
 * redraws the marchers as each beat changes, in the same task as the pointer move, without
 * re-rendering the component that holds the canvas. While a scrub is down (`scrubbing`) each beat
 * only moves the marchers, as playback does; the full update follows when it ends.
 *
 * @param redrawKey anything whose change means the canvas marchers were re-created, such as the
 * marcher visuals
 */
export function useTimelineStaticRender({
    canvas,
    selectedPage,
    beat,
    followPlayhead = false,
    isPlaying,
    enabled,
    redrawKey,
}: {
    canvas: OpenMarchCanvas | null;
    /**
     * The beat to draw (UI-9: the paused playhead). Without it, the selected page's end beat.
     */
    beat?: number;
    /** Draw at, and follow, `displayedBeat` in `useTimelineSelectionStore` instead of `beat` */
    followPlayhead?: boolean;
    selectedPage: {
        /** Stamped on each marcher's `coordinate`, so its `page_id` is current */
        readonly id?: number;
        readonly beats: readonly { readonly index: number }[];
    } | null;
    isPlaying: boolean;
    enabled: boolean;
    redrawKey?: unknown;
}): void {
    const version = useTimelineResolverStore((s) => s.version);
    // Isolation draws its members where the isolated move's plan puts them
    const isolationPlan = useIsolationPlanStore((s) => s.current);
    const bufferRef = useRef<TimelinePositionBuffer | null>(null);

    useEffect(() => {
        if (!enabled || !canvas || !selectedPage || isPlaying) return;
        const buffer = (bufferRef.current ??= new TimelinePositionBuffer());
        const fill = (at: number) => {
            if (!buffer.fill(at)) return false;
            applyIsolationPlan(
                buffer.buffer,
                buffer.marcherIds,
                at,
                isolationPlan,
            );
            return true;
        };
        const draw = (at: number) => {
            if (fill(at))
                canvas.renderMarcherPositions(buffer, selectedPage.id);
        };
        // During a scrub, the beats it passes move the marchers as playback does
        // (`setLiveCoordinates`); the full update (coordinates, page, z-order, control corners)
        // comes once, when the scrub ends
        const drawLive = (at: number) => {
            if (!fill(at)) return;
            const coords = { x: 0, y: 0 };
            buffer.forEachMarcher(
                canvas.getLiveCanvasMarchers(),
                (canvasMarcher, x, y) => {
                    coords.x = x;
                    coords.y = y;
                    canvasMarcher.setLiveCoordinates(coords);
                },
            );
            canvas.requestRenderAll();
        };
        if (!followPlayhead) {
            draw(beat ?? pageEndBeat(selectedPage));
            return;
        }
        const initial = useTimelineSelectionStore.getState();
        let drawn = displayedBeat(initial);
        let scrubbing = initial.scrubbing;
        draw(drawn);
        return useTimelineSelectionStore.subscribe((state) => {
            const at = displayedBeat(state);
            const moved = at !== drawn;
            const ended = scrubbing && !state.scrubbing;
            drawn = at;
            scrubbing = state.scrubbing;
            if (!moved && !ended) return;
            // Called inside the store's write: a failed draw mustn't stop its other listeners
            try {
                if (scrubbing) drawLive(at);
                else draw(at);
            } catch (error) {
                console.error(
                    "Error drawing the marchers at the playhead",
                    error,
                );
            }
        });
    }, [
        enabled,
        canvas,
        selectedPage,
        beat,
        followPlayhead,
        isPlaying,
        version,
        redrawKey,
        isolationPlan,
    ]);
}
