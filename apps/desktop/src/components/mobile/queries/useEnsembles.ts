/**
 * React Query hooks for fetching ensembles from the OpenMarch API.
 */

import { queryOptions } from "@tanstack/react-query";
import { NEEDS_AUTH_BASE_QUERY_KEY } from "../../../hooks/queries/useAuth";
import { apiGet } from "@/api/api-client";
import { DEFAULT_STALE_TIME } from "../../../hooks/queries/constants";
import { OTM_BASE_QUERY_KEY } from "./constants";

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
    all: () =>
        [NEEDS_AUTH_BASE_QUERY_KEY, OTM_BASE_QUERY_KEY, KEY_BASE] as const,
    hasAny: () =>
        [
            NEEDS_AUTH_BASE_QUERY_KEY,
            OTM_BASE_QUERY_KEY,
            KEY_BASE,
            "hasAny",
        ] as const,
    byId: (ensembleId: number) =>
        [
            NEEDS_AUTH_BASE_QUERY_KEY,
            OTM_BASE_QUERY_KEY,
            KEY_BASE,
            "id",
            ensembleId,
        ] as const,
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

type HasAnyEnsemblesResponse = {
    has_any: boolean;
};
export const hasAnyEnsemblesQueryOptions = (
    getAccessToken: () => Promise<string | null>,
) => {
    return queryOptions<HasAnyEnsemblesResponse>({
        queryKey: ensembleKeys.hasAny(),
        queryFn: async (): Promise<HasAnyEnsemblesResponse> => {
            const token = await getAccessToken();
            if (!token) {
                throw new Error("Authentication token is required");
            }
            const response = await apiGet<HasAnyEnsemblesResponse>(
                "v1/ensembles/any",
                token,
            );
            return response;
        },
    });
};
