/**
 * Tempo mode: what the app does after counts were added or removed in the tempo band, besides
 * refetching the timing. Removing counts carries their cues and item Outline changes onward
 * (`deleteBeatsCarryingCuesInTransaction`), so, as after deleting beats anywhere else
 * (`deleteBeatsMutationOptions`), the item and cue queries refresh and a notice says where the
 * cues went, with Undo.
 */
import type { QueryClient } from "@tanstack/react-query";
import { itemGeometryKeys } from "@/hooks/queries/useItems";
import { showCueCarryNotice } from "@/utilities/cueCarryNotice";
import type { CountEditResult } from "./tempoWrites";

export function afterCountEdit(
    result: CountEditResult,
    queryClient: QueryClient,
): void {
    if (!result.cues) return;
    void queryClient.invalidateQueries({ queryKey: itemGeometryKeys.all() });
    showCueCarryNotice(result.cues, queryClient);
}
