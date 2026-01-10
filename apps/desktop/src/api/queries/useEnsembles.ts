/**
 * React Query hooks for fetching ensembles from the OpenMarch API.
 */

import {
    queryOptions,
    mutationOptions,
    useQuery,
    useMutation,
    useQueryClient,
    QueryClient,
} from "@tanstack/react-query";
import { useAccessToken } from "../../hooks/queries/useAuth";
import { apiGet, apiPost } from "@/api/api-client";
import { DEFAULT_STALE_TIME } from "../../hooks/queries/constants";
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
 * API response structure for ensemble create.
 */
interface EnsembleCreateResponse {
    ensemble: Ensemble;
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

    return query;
}

/**
 * Parameters for creating a new ensemble.
 */
export interface CreateEnsembleParams {
    name: string;
}

/**
 * Mutation options for creating an ensemble.
 */
export const createEnsembleMutationOptions = (
    qc: QueryClient,
    getAccessToken: () => Promise<string | null>,
) => {
    return mutationOptions({
        mutationFn: async ({
            name,
        }: CreateEnsembleParams): Promise<Ensemble> => {
            const token = await getAccessToken();
            if (!token) {
                throw new Error("Authentication token is required");
            }

            const response = await apiPost<EnsembleCreateResponse>(
                "v1/ensembles",
                { name },
                token,
            );

            return response.ensemble;
        },
        onSuccess: () => {
            // Invalidate ensembles list to refresh the list
            void qc.invalidateQueries({
                queryKey: ensembleKeys.all(),
            });
        },
        onError: (error, variables) => {
            conToastError(
                tolgee.t("ensembles.createFailed", {
                    defaultValue: "Failed to create ensemble",
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
 * Hook for creating a new ensemble.
 *
 * @example
 * ```tsx
 * function CreateEnsembleForm() {
 *     const createEnsemble = useCreateEnsemble();
 *
 *     const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
 *         e.preventDefault();
 *         const formData = new FormData(e.currentTarget);
 *         const name = formData.get('name') as string;
 *
 *         createEnsemble.mutate({ name });
 *     };
 *
 *     return (
 *         <form onSubmit={handleSubmit}>
 *             <input type="text" name="name" placeholder="Ensemble name" required />
 *             <button type="submit" disabled={createEnsemble.isPending}>
 *                 {createEnsemble.isPending ? 'Creating...' : 'Create Ensemble'}
 *             </button>
 *         </form>
 *     );
 * }
 * ```
 */
export function useCreateEnsemble() {
    const queryClient = useQueryClient();
    const { getAccessToken } = useAccessToken();

    return useMutation(
        createEnsembleMutationOptions(queryClient, getAccessToken),
    );
}
