import { useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import type CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import type { RgbaColor } from "@openmarch/core";
import { fieldPropertiesQueryOptions } from "@/hooks/queries";
import {
    displayedBeat,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { useMarcherAppearanceSteps } from "./useMarcherAppearanceSteps";
import {
    appearanceStackAtBeat,
    type AppearanceStepsByMarcherId,
} from "@/services/appearance/appearanceSteps";

/**
 * Styles each canvas marcher with its appearance at `beat`, skipping a marcher already styled with
 * that stack (`applied`, a reference check). Doesn't render.
 *
 * @returns how many marchers were re-styled
 */
export function applyAppearanceStepsAt({
    canvasMarchers,
    steps,
    beat,
    applied,
    labelColor,
}: {
    canvasMarchers: readonly Pick<
        CanvasMarcher,
        "marcherObj" | "setAppearance"
    >[];
    steps: AppearanceStepsByMarcherId;
    beat: number;
    applied: WeakMap<object, unknown>;
    labelColor?: RgbaColor;
}): number {
    let changed = 0;
    for (const canvasMarcher of canvasMarchers) {
        const marcherSteps = steps.get(canvasMarcher.marcherObj.id);
        if (!marcherSteps) continue;
        const stack = appearanceStackAtBeat(marcherSteps, beat);
        if (!stack || applied.get(canvasMarcher) === stack) continue;
        applied.set(canvasMarcher, stack);
        canvasMarcher.setAppearance(
            stack,
            { requestRenderAll: false },
            labelColor,
        );
        changed++;
    }
    return changed;
}

/**
 * Keeps every marcher's appearance on the canvas in step with the beat in timeline mode
 * (docs/timeline/ui.md UI-9 No selected page). Appearance is per page, keyed by each page's flag
 * (`useMarcherAppearanceSteps`); the field shows the appearance of the last flag crossed, playing
 * or paused.
 *
 * - Playing: the returned function is called by `useAnimation`'s timeline frame with the live beat
 *   it already computes for positions, so there is no extra animation loop.
 * - Paused: `useTimelinePausedAppearance` calls it with the beat the paused canvas shows.
 *
 * Each canvas marcher is re-styled only when its sampled stack changes (a reference check). Page
 * mode (`enabled` off) does nothing and keeps `Canvas.tsx`'s selected-page appearance sync.
 *
 * @param redrawKey anything whose change means the canvas marchers were re-created, such as the
 * marcher visuals; every marcher is re-styled then
 * @returns styles the marchers (all of the canvas's, or `canvasMarchers`) at a beat and returns
 * how many changed (0 when disabled or not loaded); the caller renders
 */
export function useTimelineAppearance({
    canvas,
    enabled,
    redrawKey,
}: {
    canvas: OpenMarchCanvas | null;
    enabled: boolean;
    redrawKey?: unknown;
}): (beat: number, canvasMarchers?: readonly CanvasMarcher[]) => number {
    const steps = useMarcherAppearanceSteps(enabled);
    const { data: fieldProperties } = useQuery({
        ...fieldPropertiesQueryOptions(),
        enabled,
    });
    const labelColor = fieldProperties?.theme.defaultMarcher.label;
    /** The stack each canvas marcher was last styled with */
    const applied = useRef(new WeakMap<object, unknown>());
    const appliedFor = useRef<unknown[]>([]);

    return useCallback(
        (beat: number, canvasMarchers?: readonly CanvasMarcher[]) => {
            if (!enabled || !canvas || !steps) return 0;
            // New marchers, new appearances or a new label color: style everyone again
            const key = [canvas, steps, labelColor, redrawKey];
            if (key.some((k, i) => k !== appliedFor.current[i])) {
                applied.current = new WeakMap();
                appliedFor.current = key;
            }
            return applyAppearanceStepsAt({
                // The caller's list when it has one: playback already read it this frame
                canvasMarchers: canvasMarchers ?? canvas.getCanvasMarchers(),
                steps,
                beat,
                applied: applied.current,
                labelColor,
            });
        },
        [enabled, canvas, steps, labelColor, redrawKey],
    );
}

/**
 * Paused, styles the marchers at the beat the paused canvas shows (`displayedBeat`: the playhead,
 * or a held preview frame) whenever it or the appearance changes. It follows that beat through a
 * store subscription rather than a prop, so a scrub restyles marchers without re-rendering the
 * component that holds the canvas (as `useTimelineStaticRender` does). Call it after the effect
 * that creates the canvas marchers, so it styles the new ones.
 */
export function useTimelinePausedAppearance({
    canvas,
    isPlaying,
    applyAt,
}: {
    canvas: OpenMarchCanvas | null;
    isPlaying: boolean;
    applyAt: (beat: number) => number;
}): void {
    useEffect(() => {
        if (!canvas || isPlaying) return;
        let styled = displayedBeat(useTimelineSelectionStore.getState());
        if (applyAt(styled) > 0) canvas.requestRenderAll();
        return useTimelineSelectionStore.subscribe((state) => {
            const at = displayedBeat(state);
            if (at === styled) return;
            styled = at;
            // Inside the store's write, as useTimelineStaticRender: a failed restyle mustn't
            // reach the seek that made it, or stop the store's other listeners
            try {
                if (applyAt(at) > 0) canvas.requestRenderAll();
            } catch (error) {
                console.error(
                    "Error styling the marchers at the playhead",
                    error,
                );
            }
        });
    }, [canvas, isPlaying, applyAt]);
}
