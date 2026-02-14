/**
 * React Query hooks for fetching and creating productions from the OpenMarch API.
 * Uses Orval-generated editor API where the spec matches; keeps api-client for
 * productions-by-ensemble and upload revision (different request shape).
 */

import { useEffect, useMemo } from "react";
import {
    mutationOptions,
    QueryClient,
    queryOptions,
    useQuery,
} from "@tanstack/react-query";
import { getApiEditorV1ProductionsId } from "@/api/generated/productions/productions";
import { NEEDS_AUTH_BASE_QUERY_KEY, useAccessToken } from "@/auth/useAuth";
import { conToastError } from "@/utilities/utils";
import tolgee from "@/global/singletons/Tolgee";
import { workspaceSettingsQueryOptions } from "@/hooks/queries/useWorkspaceSettings";
import { OTM_BASE_QUERY_KEY } from "./constants";
import { apiGet } from "@/auth/api-client";
import { uploadDatabaseToServer } from "../utilities/upload-service";
import { db } from "@/global/database/db";

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
 * GET /v1/productions/:production_id/audio_files includes checksum for matching local audio.
 */
export interface ProductionAudioFile {
    id: number;
    name: string;
    url: string | null;
    checksum?: string;
    duration_seconds?: number | null;
    size_megabytes?: number | null;
    created_at?: string;
}

/**
 * Serialized revision preview data structure matching the Rails controller response.
 */
export interface RevisionPreview {
    id: number;
    pushed_at: string;
    title: string;
    show_data_url: string | null;
    active: boolean;
}

/**
 * Serialized production data structure matching the Rails controller response.
 */
export interface Production {
    id: number;
    name: string;
    background_image_url: string | null;
    background_image_checksum: string | null;
    revisions: RevisionPreview[];
    active_revision_id: number | null;
    audio_files: ProductionAudioFile[];
    default_audio_file_id: number | null;
    ensemble: { id: number; name: string };
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
 * API response structure for production audio files index.
 * GET /v1/productions/:production_id/audio_files
 */
export interface AudioFilesIndexResponse {
    audio_files: ProductionAudioFile[];
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
    byId: (productionId: number | undefined) =>
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
            );
            return response.productions;
        },
        enabled: enabled && !!ensembleId,
        staleTime: undefined,
    });
};

export const uploadRevisionMutationOptions = ({
    queryClient,
    onSuccess,
    onError,
}: {
    queryClient: QueryClient;
    onSuccess?: () => void;
    onError?: (error: Error) => void;
}) => {
    return mutationOptions({
        mutationFn: async ({ title }: { title: string }) =>
            uploadDatabaseToServer(db, title),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: productionKeys.all(),
            });
            onSuccess?.();
        },
        onError: (error) => {
            console.error("Failed to upload revision", error);
            onError?.(error);
        },
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

/**
 * Query options for a single production by ID.
 * Uses generated GET production fetcher (auth via mutator); spec types response as void so we cast to Production.
 */
export const _productionQueryOptions = (
    productionId: number | undefined,
    _getAccessToken: () => Promise<string | null>,
) => {
    if (productionId == null) {
        return queryOptions<Production>({
            queryKey: productionKeys.byId(productionId),
            queryFn: () => Promise.reject(new Error("No production ID")),
            enabled: false,
        });
    }
    const id = productionId;
    return queryOptions<Production>({
        // eslint-disable-next-line @tanstack/query/exhaustive-deps
        queryKey: productionKeys.byId(productionId),
        queryFn: async ({ signal }: { signal?: AbortSignal }) => {
            const data = await getApiEditorV1ProductionsId(
                id,
                undefined,
                signal,
            );
            return (data as unknown as { production: Production }).production;
        },
        enabled: true,
        staleTime: undefined,
        networkMode: "online",
    });
};

/**
 * The ID of the current OTM production this file is attached to.
 */
export const useOtmProductionId = (): number | undefined => {
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
