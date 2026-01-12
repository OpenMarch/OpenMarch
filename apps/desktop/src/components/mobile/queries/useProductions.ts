/**
 * React Query hooks for fetching and creating productions from the OpenMarch API.
 */

import { useEffect, useMemo } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import {
    NEEDS_AUTH_BASE_QUERY_KEY,
    useAccessToken,
} from "@/hooks/queries/useAuth";
import { apiGet } from "@/api/api-client";
import { DEFAULT_STALE_TIME } from "@/hooks/queries/constants";
import { conToastError } from "@/utilities/utils";
import tolgee from "@/global/singletons/Tolgee";
import { workspaceSettingsQueryOptions } from "@/hooks/queries/useWorkspaceSettings";
import { OTM_BASE_QUERY_KEY } from "./constants";

const KEY_BASE = "productions";

/**
 * Serialized production preview data structure matching the Rails controller response.
 */
export interface ProductionPreview {
    id: number;
    name: string;
    position: number;
    created_at: string;
    updated_at: string;
}

/**
 * Serialized audio file data structure matching the Rails controller response.
 */
export interface ProductionAudioFile {
    id: number;
    name: string;
    url: string | null;
}

/**
 * Serialized revision preview data structure matching the Rails controller response.
 */
export interface RevisionPreview {
    id: number;
    pushed_at: string;
    show_data_url: string | null;
    active: boolean;
}

/**
 * Serialized production data structure matching the Rails controller response.
 */
export interface Production {
    id: number;
    name: string;
    dots_sqlite_url: string | null;
    background_image_url: string | null;
    active_revision: RevisionPreview | null;
    audio_files: ProductionAudioFile[];
    created_at: string;
    updated_at: string;
}

/**
 * API response structure for productions index.
 */
interface ProductionsResponse {
    productions: ProductionPreview[];
}

/**
 * Query key factory for productions.
 */
export const productionKeys = {
    all: () =>
        [NEEDS_AUTH_BASE_QUERY_KEY, OTM_BASE_QUERY_KEY, KEY_BASE] as const,
    byEnsemble: (ensembleId: number) =>
        [
            NEEDS_AUTH_BASE_QUERY_KEY,
            OTM_BASE_QUERY_KEY,
            KEY_BASE,
            "ensemble",
            ensembleId,
        ] as const,
    byId: (productionId: string | undefined) =>
        [
            NEEDS_AUTH_BASE_QUERY_KEY,
            OTM_BASE_QUERY_KEY,
            KEY_BASE,
            "id",
            productionId,
        ] as const,
};

/**
 * Query options for fetching productions by ensemble ID.
 */
export const productionsByEnsembleQueryOptions = (
    ensembleId: number,
    getAccessToken: () => Promise<string | null>,
    enabled: boolean = true,
) => {
    return queryOptions<ProductionPreview[]>({
        queryKey: productionKeys.byEnsemble(ensembleId),
        queryFn: async (): Promise<ProductionPreview[]> => {
            const token = await getAccessToken();
            if (!token) {
                throw new Error("Authentication token is required");
            }
            const response = await apiGet<ProductionsResponse>(
                `v1/ensembles/${ensembleId}/productions`,
                token,
            );
            return response.productions;
        },
        enabled: enabled && !!ensembleId,
        staleTime: DEFAULT_STALE_TIME,
    });
};

/**
 * Hook for fetching productions by ensemble ID.
 *
 * @example
 * ```tsx
 * function ProductionsList({ ensembleId }: { ensembleId: number }) {
 *     const { data: productions, isLoading, error } = useProductions(ensembleId);
 *
 *     if (isLoading) return <div>Loading productions...</div>;
 *     if (error) return <div>Error: {error.message}</div>;
 *
 *     return (
 *         <ul>
 *             {productions?.map(production => (
 *                 <li key={production.id}>{production.name}</li>
 *             ))}
 *         </ul>
 *     );
 * }
 * ```
 */
export function useProductions(ensembleId: number) {
    const { getAccessToken } = useAccessToken();
    const query = useQuery({
        ...productionsByEnsembleQueryOptions(
            ensembleId,
            getAccessToken,
            !!ensembleId,
        ),
    });

    // Handle errors using useEffect (React Query v5 removed onError from query options)
    useEffect(() => {
        if (query.error) {
            conToastError(
                tolgee.t("productions.fetchFailed", {
                    defaultValue: "Failed to fetch productions",
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

export const _productionQueryOptions = (
    productionId: string | undefined,
    getAccessToken: () => Promise<string | null>,
) => {
    return queryOptions<Production>({
        queryKey: productionKeys.byId(productionId),
        queryFn: async (): Promise<Production> => {
            const token = await getAccessToken();
            if (!token) {
                throw new Error("Authentication token is required");
            }
            const response = await apiGet<Production>(
                `v1/productions/${productionId}`,
                token,
            );
            return response;
        },
        enabled: productionId != null,
        staleTime: undefined, // go stale immediately
        networkMode: "online",
    });
};

/**
 * The ID of the current OTM production this file is attached to.
 */
export const useOtmProductionId = (): string | undefined => {
    const { data: workspaceSettings } = useQuery(
        workspaceSettingsQueryOptions(),
    );
    return useMemo(
        () => workspaceSettings?.otmProductionId,
        [workspaceSettings],
    );
};

/**
 * Fetch the the current production based on the OTM Production ID from the workspace settings.
 */
export function useCurrentProduction() {
    const { getAccessToken } = useAccessToken();
    const productionId = useOtmProductionId();

    return useQuery({
        ..._productionQueryOptions(productionId, getAccessToken),
    });
}
