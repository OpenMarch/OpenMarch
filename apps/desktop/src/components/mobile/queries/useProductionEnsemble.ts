import { useGetApiEditorV1Ensembles } from "@/api/generated/ensembles/ensembles";
import type { Ensemble } from "@/api/generated/model/ensemble";

/**
 * The ensemble a production belongs to, from the ensembles list. The
 * production's own response carries only the ensemble's id and name; its
 * expiry (`expires_on`, `expired`) is on the ensemble's row.
 */
export function useProductionEnsemble(
    production: { ensemble?: { id: number } | null } | undefined,
): Ensemble | undefined {
    const { data } = useGetApiEditorV1Ensembles();
    const ensembleId = production?.ensemble?.id;
    if (ensembleId === undefined) return undefined;
    return data?.ensembles?.find((e) => e.id === ensembleId);
}
