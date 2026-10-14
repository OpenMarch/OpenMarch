import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import type { ModifiedMarcherPageArgs } from "@/global/classes/MarcherPage";
import { moveMarchersInTargetMutationOptions } from "@/hooks/queries";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import {
    planCanvasEdit,
    snapIsolatedPlayheadToEnd,
    toTimelineMoves,
} from "@/timeline/timelineCoordinateWrites";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";

/**
 * Writes new coordinates for the marchers: the endings in the selected timeline or the homes, as
 * the selection allows (UI-9 Editing, P8.15). A refusal is a toast when marchers are selected.
 */
export function useUpdateCoordinates() {
    const selectedMarcherCount =
        useSelectedMarchers()?.selectedMarchers.length ?? 0;
    const { mutate: moveMarchersInTarget } = useMutation(
        moveMarchersInTargetMutationOptions(),
    );

    return useCallback(
        (changes: ModifiedMarcherPageArgs[]) => {
            // The changes' page ids can be left over from an earlier render and are ignored.
            // This plans again after `getSelectedMarcherPages` planned the read. The tools call
            // both synchronously in one action, so the selection can't change in between and
            // both plans agree; passing the plan through would touch every tool's call.
            const plan = planCanvasEdit();
            if (!plan.ok) {
                if (changes.length > 0 || selectedMarcherCount > 0)
                    toastTimelineError(plan.error);
                return;
            }
            if (changes.length === 0) return;
            snapIsolatedPlayheadToEnd();
            moveMarchersInTarget({
                target: plan.target,
                moves: toTimelineMoves(changes),
            });
        },
        [selectedMarcherCount, moveMarchersInTarget],
    );
}
