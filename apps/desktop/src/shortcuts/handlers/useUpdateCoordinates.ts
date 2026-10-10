import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ModifiedMarcherPageArgs } from "@/db-functions/marcherPage";
import {
    moveMarchersInTargetMutationOptions,
    updateMarcherPagesMutationOptions,
} from "@/hooks/queries";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useTimelineMode } from "@/hooks/queries/useWorkspaceSettings";
import {
    planCanvasEdit,
    snapIsolatedPlayheadToEnd,
    toTimelineMoves,
} from "@/timeline/timelineCoordinateWrites";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";

/**
 * Writes new coordinates for the marchers: `marcher_pages` on the selected page in page mode
 * (unchanged); in timeline mode, the endings in the selected timeline or the homes, as the
 * selection allows (UI-9 Editing, P8.15). A refusal is a toast when marchers are selected.
 */
export function useUpdateCoordinates() {
    const queryClient = useQueryClient();
    const timelineMode = useTimelineMode();
    const selectedMarcherCount =
        useSelectedMarchers()?.selectedMarchers.length ?? 0;
    const { mutate: updateMarcherPages } = useMutation(
        updateMarcherPagesMutationOptions(queryClient),
    );
    const { mutate: moveMarchersInTarget } = useMutation(
        moveMarchersInTargetMutationOptions(),
    );

    return useCallback(
        (changes: ModifiedMarcherPageArgs[]) => {
            if (!timelineMode) {
                updateMarcherPages(changes);
                return;
            }
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
        [
            timelineMode,
            updateMarcherPages,
            selectedMarcherCount,
            moveMarchersInTarget,
        ],
    );
}
