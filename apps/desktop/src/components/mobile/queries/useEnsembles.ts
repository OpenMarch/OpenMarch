/**
 * React Query hooks for fetching ensembles from the OpenMarch API.
 * Uses Orval-generated editor API with custom query keys for invalidation.
 */

import {
    getGetApiEditorV1EnsemblesAnyQueryOptions,
    getGetApiEditorV1EnsemblesQueryOptions,
} from "@/api/generated/ensembles/ensembles";
import { NEEDS_AUTH_BASE_QUERY_KEY } from "../../../auth/useAuth";
import { DEFAULT_STALE_TIME } from "../../../hooks/queries/constants";
import { OTM_BASE_QUERY_KEY } from "./constants";
import { ProductionPreview } from "./useProductions";

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
    productions: ProductionPreview[];
}

export type HasAnyEnsemblesResponse = {
    has_any: boolean;
};

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
 * Uses generated API with custom queryKey for cache invalidation.
 */
export const allEnsemblesQueryOptions = (
    _getAccessToken: () => Promise<string | null>,
) => {
    return getGetApiEditorV1EnsemblesQueryOptions<Ensemble[]>({
        query: {
            queryKey: ensembleKeys.all(),
            select: (data) => (data.ensembles ?? []) as unknown as Ensemble[],
            staleTime: DEFAULT_STALE_TIME,
        },
    });
};

/**
 * Query options for checking if user has any ensembles.
 */
export const hasAnyEnsemblesQueryOptions = (
    _getAccessToken: () => Promise<string | null>,
) => {
    return getGetApiEditorV1EnsemblesAnyQueryOptions<HasAnyEnsemblesResponse>({
        query: {
            queryKey: ensembleKeys.hasAny(),
            select: (data) => ({
                has_any: data.has_any ?? false,
            }),
        },
    });
};
