import { useQueryClient } from "@tanstack/react-query";
import { NUDGE_ACTION_IDS, type NudgeArgs } from "@/shortcuts/definitions";
import { resolveNudgeDistance } from "@/shortcuts/nudge";
import {
    useActionHandler,
    useActionHandlerGroup,
} from "@/shortcuts/useActionHandler";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { currentShapeField } from "../field/shapeFieldContext";
import { nudgeEnvFor, toolEnvFor } from "../tool/toolEnv";
import type { AnyToolKind } from "../tool/toolKind";
import { useBoxSelectionStore } from "./boxSelectionStore";
import { commitBox } from "./commitBox";
import { leaveBox, selectOnField } from "./boxSelection";

const DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
} as const;

/** The number a kind's − and + step (a box's count across), if it has one */
export const steppedParam = (kind: AnyToolKind) =>
    kind.params.find((p) => p.primary && p.stepper);

/**
 * One less or more of the selected placed shape's stepped number (a box: one fewer or more
 * across the field, however it's turned), saved at once
 */
export function stepPlacedBoxFiles(
    delta: -1 | 1,
    queryClient: ReturnType<typeof useQueryClient>,
): void {
    const field = currentShapeField();
    const box = useBoxSelectionStore.getState().selected;
    const stepper = box && steppedParam(box.kind)?.stepper;
    if (!field || !box || !stepper) return;
    const params = stepper.by(box.params, box.spots, delta, toolEnvFor(field));
    if (params !== null && params !== box.params)
        void commitBox(box, params, queryClient);
}

/**
 * The keys a selected placed shape takes over (07-placed-boxes.md). Mounted only while a shape is
 * selected or you're inside one, on top of the editor's handlers.
 *
 * - The nudge keys move the whole shape through its kind, every member the same distance, so it
 *   keeps its form (the plain nudge rounds each marcher on its own, which bends a box on half
 *   steps).
 * - Escape inside a box selects the whole box again, and on a box selected whole deselects it.
 */
export function PlacedBoxKeys(): null {
    const queryClient = useQueryClient();
    const selected = useBoxSelectionStore((s) => s.selected !== null);
    const inside = useBoxSelectionStore((s) => s.inside !== null);
    const rounding = useUiSettingsStore((s) => s.uiSettings.coordinateRounding);

    useActionHandlerGroup(
        NUDGE_ACTION_IDS,
        (_id, args) => {
            const field = currentShapeField();
            const box = useBoxSelectionStore.getState().selected;
            if (!field || !box) return;
            const nudge = args as unknown as NudgeArgs;
            const steps = resolveNudgeDistance(nudge, rounding);
            const d = DIRECTIONS[nudge.direction];
            const px = steps * field.fieldProperties.pixelsPerStep;
            const params = box.kind.move(
                box.params,
                box.spots,
                { x: d.x * px, y: d.y * px },
                nudgeEnvFor(field, nudge),
            );
            void commitBox(box, params, queryClient);
        },
        { enabled: selected },
    );
    // On top of the app's Escape, so it must handle a box selected whole too: it deselects
    useActionHandler(
        "cancelAlignmentUpdates",
        () => (inside ? leaveBox() : selectOnField([])),
        { enabled: inside || selected },
    );
    return null;
}
