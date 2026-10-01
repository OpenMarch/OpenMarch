import { useEffect, useRef } from "react";
import type { fabric } from "fabric";
import { rgbaToString, type FieldTheme } from "@openmarch/core";
import TimelineShapeOverlay, {
    DEFAULT_DRAG_THRESHOLD,
    type TimelineShapeOverlayColors,
} from "@/global/classes/canvasObjects/TimelineShapeOverlay";
import { useTimelineShapeCanvasStore } from "./timelineShapeCanvas";

/** The canvas fields this hook uses. `OpenMarchCanvas` satisfies it. */
export type ShapeOverlayCanvas = fabric.Canvas & {
    fieldProperties: { theme: FieldTheme };
    /** Set while an overlay is drawn, so the canvas keeps its handles on top */
    timelineShapeOverlay?: TimelineShapeOverlay | null;
    /** The canvas's own click-or-drag threshold for marchers, reused for handles */
    DRAG_TIMER_MILLISECONDS?: number;
    DISTANCE_THRESHOLD?: number;
};

const colorsOf = (theme: FieldTheme): TimelineShapeOverlayColors => ({
    shape: rgbaToString(theme.shape),
    handleFill: "#fff",
});

/**
 * Draws the shape picked in the inspector's shape editor on the canvas in timeline mode (P7.11),
 * with handles to drag. A drag redraws locally and commits once, on release, through the editor
 * (`useTimelineShapeCanvasStore`'s `commit`). While that edit is pending the drawn shape stays as
 * dragged and takes no drags; once it settles, the shape is drawn again from the editor's rows:
 * the new geometry, or the old one when the edit was refused. A release that starts no edit (the
 * shape didn't change, or another edit was pending) puts the shape back at once.
 *
 * Does nothing while `enabled` is false (page mode, or the resolver isn't ready) and nothing while
 * playing; it removes what it drew then.
 *
 * @param theme the field theme; the overlay redraws in its colors when it changes
 */
export function useTimelineShapeCanvas({
    canvas,
    enabled,
    isPlaying,
    theme,
}: {
    canvas: ShapeOverlayCanvas | null;
    enabled: boolean;
    isPlaying: boolean;
    theme?: FieldTheme;
}): void {
    const target = useTimelineShapeCanvasStore((s) => s.target);
    const pending = useTimelineShapeCanvasStore((s) => s.pending);
    const overlayRef = useRef<TimelineShapeOverlay | null>(null);
    const active = enabled && !isPlaying && canvas !== null;

    // One overlay per canvas; removed when the canvas changes or the hook stops drawing
    useEffect(() => {
        if (!active || !canvas) return;
        const overlay: TimelineShapeOverlay = new TimelineShapeOverlay(
            canvas,
            colorsOf(canvas.fieldProperties.theme),
            (shape) => {
                const state = useTimelineShapeCanvasStore.getState();
                const result = state.commit ? state.commit(shape) : "busy";
                if (result === "started") return;
                // Nothing was saved: draw what the editor has, not the unsaved drag
                if (state.target)
                    overlay.show(state.target.shape, !state.pending);
                else overlay.clear();
            },
            {
                milliseconds:
                    canvas.DRAG_TIMER_MILLISECONDS ??
                    DEFAULT_DRAG_THRESHOLD.milliseconds,
                distance:
                    canvas.DISTANCE_THRESHOLD ??
                    DEFAULT_DRAG_THRESHOLD.distance,
            },
        );
        overlayRef.current = overlay;
        canvas.timelineShapeOverlay = overlay;
        return () => {
            overlay.clear();
            if (canvas.timelineShapeOverlay === overlay)
                canvas.timelineShapeOverlay = null;
            overlayRef.current = null;
        };
    }, [active, canvas]);

    // The field theme changed: same shape, new colors
    useEffect(() => {
        if (theme) overlayRef.current?.setColors(colorsOf(theme));
    }, [theme]);

    useEffect(() => {
        const overlay = overlayRef.current;
        if (!active || !overlay) return;
        if (!target) {
            overlay.clear();
            return;
        }
        // Keep the dragged shape until the edit settles, so it doesn't jump back meanwhile
        if (pending && overlay.shown) {
            overlay.setInteractive(false);
            return;
        }
        overlay.show(target.shape, !pending);
    }, [active, canvas, target, pending]);
}
