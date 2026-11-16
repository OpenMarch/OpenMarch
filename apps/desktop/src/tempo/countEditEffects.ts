/**
 * Tempo mode: what the app does after counts were added or removed in the tempo band, besides
 * refetching the timing. Removing counts carries their item Outline changes and cues onward
 * (`deleteBeatsCarryingItemChangesInTransaction`), so, as after deleting beats anywhere else
 * (`deleteBeatsMutationOptions`), the item and cue queries refresh.
 */
import type { QueryClient } from "@tanstack/react-query";
import { itemGeometryKeys } from "@/hooks/queries/useItems";
import { cueKeys } from "@/hooks/queries/useCues";
import type { CountEditResult } from "./tempoWrites";

export function afterCountEdit(
    result: CountEditResult,
    queryClient: QueryClient,
): void {
    if (!result.removedCounts) return;
    void queryClient.invalidateQueries({ queryKey: itemGeometryKeys.all() });
    void queryClient.invalidateQueries({ queryKey: cueKeys.all() });
}
