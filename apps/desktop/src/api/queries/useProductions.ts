/**
 * React Query hooks for fetching and creating productions from the OpenMarch API.
 */

import { useEffect } from "react";
import {
    queryOptions,
    mutationOptions,
    useQuery,
    useMutation,
    useQueryClient,
    QueryClient,
} from "@tanstack/react-query";
import { useAccessToken } from "../../hooks/queries/useAuth";
import { apiGet, apiPostFormData } from "@/api/api-client";
import { DEFAULT_STALE_TIME } from "../../hooks/queries/constants";
import { conToastError } from "@/utilities/utils";
import tolgee from "@/global/singletons/Tolgee";
import { ensembleKeys } from "./useEnsembles";

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
 * Serialized production data structure matching the Rails controller response.
 */
export interface Production {
    id: number;
    name: string;
    dots_sqlite_url: string | null;
    background_image_url: string | null;
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
 * API response structure for production create.
 */
interface ProductionCreateResponse {
    production: Production;
}

/**
 * Query key factory for productions.
 */
export const productionKeys = {
    all: () => [KEY_BASE] as const,
    byEnsemble: (ensembleId: number) =>
        [KEY_BASE, "ensemble", ensembleId] as const,
    byId: (productionId: number) => [KEY_BASE, "id", productionId] as const,
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

/**
 * Parameters for creating a new production.
 */
export interface CreateProductionParams {
    ensembleId: number;
    dotsFile: File;
    name?: string;
}

/**
 * Mutation options for creating a production.
 */
export const createProductionMutationOptions = (
    qc: QueryClient,
    getAccessToken: () => Promise<string | null>,
) => {
    return mutationOptions({
        mutationFn: async ({
            ensembleId,
            dotsFile,
            name,
        }: CreateProductionParams): Promise<Production> => {
            const token = await getAccessToken();
            if (!token) {
                throw new Error("Authentication token is required");
            }

            const formData = new FormData();
            formData.append("dots_file", dotsFile);
            if (name) {
                formData.append("name", name);
            }

            const response = await apiPostFormData<ProductionCreateResponse>(
                `v1/ensembles/${ensembleId}/productions`,
                formData,
                token,
            );

            return response.production;
        },
        onSuccess: (data, variables) => {
            // Invalidate productions list for this ensemble
            void qc.invalidateQueries({
                queryKey: productionKeys.byEnsemble(variables.ensembleId),
            });
            // Also invalidate ensembles list to update production count
            void qc.invalidateQueries({
                queryKey: ensembleKeys.all(),
            });
        },
        onError: (error, variables) => {
            conToastError(
                tolgee.t("productions.createFailed", {
                    defaultValue: "Failed to create production",
                    error:
                        error instanceof Error ? error.message : String(error),
                }),
                error,
                variables,
            );
        },
    });
};

/**
 * Hook for creating a new production.
 *
 * @example
 * ```tsx
 * function CreateProductionForm({ ensembleId }: { ensembleId: number }) {
 *     const createProduction = useCreateProduction();
 *
 *     const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
 *         e.preventDefault();
 *         const formData = new FormData(e.currentTarget);
 *         const dotsFile = formData.get('dots_file') as File;
 *         const name = formData.get('name') as string;
 *
 *         createProduction.mutate({
 *             ensembleId,
 *             dotsFile,
 *             name: name || undefined,
 *         });
 *     };
 *
 *     return (
 *         <form onSubmit={handleSubmit}>
 *             <input type="file" name="dots_file" accept=".dots" required />
 *             <input type="text" name="name" placeholder="Production name (optional)" />
 *             <button type="submit" disabled={createProduction.isPending}>
 *                 {createProduction.isPending ? 'Creating...' : 'Create Production'}
 *             </button>
 *         </form>
 *     );
 * }
 * ```
 */
export function useCreateProduction() {
    const queryClient = useQueryClient();
    const { getAccessToken } = useAccessToken();

    return useMutation(
        createProductionMutationOptions(queryClient, getAccessToken),
    );
}
