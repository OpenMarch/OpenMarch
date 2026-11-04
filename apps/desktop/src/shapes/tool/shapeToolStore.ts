import { create } from "zustand";
import type { CanvasEditPlan } from "@/timeline/timelineCoordinateWrites";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { usePreviewModeStore } from "@/stores/PreviewModeStore";
import type { ToolState } from "./toolMachine";
import { isAwayFrom, momentOf, type ShapeMoment } from "./shapeMoment";

/**
 * The open shape tool, if any. Every change goes through the pure functions in `toolMachine.ts`;
 * this store only holds the result so the canvas, the readout and the keys see the same state.
 *
 * `openedAt` is what the edit window was when the tool opened. `moment` is where the timeline was
 * then (#416): away from it the shape is hidden behind a chip that goes back. `discarded` is the shape Escape just
 * threw away, which undo can still bring back.
 */
export const useShapeToolStore = create<{
    tool: ToolState | null;
    openedAt: CanvasEditPlan | null;
    moment: ShapeMoment | null;
    discarded: OpenShape | null;
}>(() => ({ tool: null, openedAt: null, moment: null, discarded: null }));

/** A shape tool, the edit window it opened at and the moment it belongs to */
export interface OpenShape {
    readonly tool: ToolState;
    readonly openedAt: CanvasEditPlan | null;
    readonly moment: ShapeMoment | null;
}

/** Applies `change` to the open tool; nothing happens when it's closed */
export function updateTool(change: (tool: ToolState) => ToolState): void {
    const { tool } = useShapeToolStore.getState();
    if (!tool) return;
    const next = change(tool);
    if (next !== tool) useShapeToolStore.setState({ tool: next });
}

/**
 * Opens `tool` at the moment now. A discarded shape can't come back once another one opens, unless
 * `keepDiscarded`: a new shape started over one waiting elsewhere (#416), which undo before
 * anything is drawn brings back
 */
export function openShapeTool(
    tool: ToolState,
    openedAt: CanvasEditPlan | null,
    moment: ShapeMoment | null = momentOf(),
    { keepDiscarded = false }: { keepDiscarded?: boolean } = {},
): void {
    useShapeToolStore.setState((s) => ({
        tool,
        openedAt,
        moment,
        discarded: keepDiscarded ? s.discarded : null,
    }));
}

/** Whether a shape is open and showing, so picking a kind changes it rather than starting over */
export function isShapeShown(): boolean {
    return useShapeToolStore.getState().tool !== null && !isShapeAway();
}

/** {@link isShapeShown} for components */
export function useShapeShown(): boolean {
    const open = useShapeToolStore((s) => s.tool !== null);
    const away = useShapeAway();
    return open && !away;
}

export function closeShapeTool(): void {
    if (useShapeToolStore.getState().tool)
        useShapeToolStore.setState({
            tool: null,
            openedAt: null,
            moment: null,
        });
}

/** Whether a shape is open and the timeline is away from its moment (#416) */
export function isShapeAway(): boolean {
    const { tool, moment } = useShapeToolStore.getState();
    return tool !== null && isAwayFrom(moment);
}

/** {@link isShapeAway} for components: true while the open shape's moment is somewhere else */
export function useShapeAway(): boolean {
    const moment = useShapeToolStore((s) => (s.tool ? s.moment : null));
    // The moment only with a shape open: the field uses this, and scrubbing would re-render it
    // for nothing (#455)
    const away = useTimelineSelectionStore(
        (s) => moment !== null && momentOf(s).key !== moment.key,
    );
    return away;
}

/**
 * Whether a shape is open but waiting out of sight (#416): away from its moment, while the show
 * plays, or in Preview. Nothing acts on it then; it shows again once that ends.
 */
export function isShapeHidden(): boolean {
    if (!useShapeToolStore.getState().tool) return false;
    return (
        isShapeAway() ||
        useTimelineSelectionStore.getState().playback !== null ||
        usePreviewModeStore.getState().isPreview
    );
}

/** {@link isShapeHidden} for components */
export function useShapeHidden(): boolean {
    const open = useShapeToolStore((s) => s.tool !== null);
    const away = useShapeAway();
    const playing = useTimelineSelectionStore((s) => s.playback !== null);
    const preview = usePreviewModeStore((s) => s.isPreview);
    return open && (away || playing || preview);
}
