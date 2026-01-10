/**
 * React Query hooks for fetching ensembles from the OpenMarch API.
 */

import { useEffect } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useAccessToken } from "./useAuth";
import { apiGet } from "@/api/api-client";
import { DEFAULT_STALE_TIME } from "./constants";
import { conToastError } from "@/utilities/utils";
import tolgee from "@/global/singletons/Tolgee";

const KEY_BASE = "ensembles";

/**
 * Serialized ensemble data structure matching the Rails controller response.
 */
export interface Ensemble {
    id: number;
    name: string;
    productions_count: number;
    performers_count: number;
    created_at: string;
    updated_at: string;
}

/**
 * API response structure for ensembles index.
 */
interface EnsemblesResponse {
    ensembles: Ensemble[];
}

/**
 * Query key factory for ensembles.
 */
export const ensembleKeys = {
    all: () => [KEY_BASE] as const,
    byId: (ensembleId: number) => [KEY_BASE, "id", ensembleId] as const,
};

/**
 * Query options for fetching all ensembles.
 */
export const allEnsemblesQueryOptions = (
    getAccessToken: () => Promise<string | null>,
) => {
    return queryOptions<Ensemble[]>({
        queryKey: ensembleKeys.all(),
        queryFn: async (): Promise<Ensemble[]> => {
            const token = await getAccessToken();
            if (!token) {
                throw new Error("Authentication token is required");
            }
            const response = await apiGet<EnsemblesResponse>(
                "v1/ensembles",
                token,
            );
            return response.ensembles;
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

/**
 * Hook for fetching all ensembles.
 *
 * @example
 * ```tsx
 * function EnsemblesList() {
 *     const { data: ensembles, isLoading, error } = useEnsembles();
 *
 *     if (isLoading) return <div>Loading ensembles...</div>;
 *     if (error) return <div>Error: {error.message}</div>;
 *
 *     return (
 *         <ul>
 *             {ensembles?.map(ensemble => (
 *                 <li key={ensemble.id}>{ensemble.name}</li>
 *             ))}
 *         </ul>
 *     );
 * }
 * ```
 */
export function useEnsembles() {
    const { getAccessToken } = useAccessToken();
    const query = useQuery({
        ...allEnsemblesQueryOptions(getAccessToken),
    });

    // Handle errors using useEffect (React Query v5 removed onError from query options)
    useEffect(() => {
        if (query.error) {
            conToastError(
                tolgee.t("ensembles.fetchFailed", {
                    defaultValue: "Failed to fetch ensembles",
                    error:
                        query.error instanceof Error
                            ? query.error.message
                            : String(query.error),
                }),
                query.error,
            );
        }
    }, [query.error]);

    return query;
}
