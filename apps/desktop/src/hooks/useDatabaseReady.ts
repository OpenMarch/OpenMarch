import { queryOptions, useQuery } from "@tanstack/react-query";

const DATABASE_READY_KEY = ["database", "isReady"] as const;

/**
 * Query options for checking if the database is ready
 */
export const databaseReadyQueryOptions = () =>
    queryOptions({
        queryKey: DATABASE_READY_KEY,
        queryFn: async () => {
            try {
                return await window.electron.databaseIsReady();
            } catch (error) {
                console.error("Error checking database ready state:", error);
                return false;
            }
        },
        staleTime: 1000,
        refetchInterval: (query) => (query.state.data === true ? false : 1000),
    });

/**
 * Hook to check if the database is ready.
 * Uses React Query to cache the result and automatically refetch when needed.
 */
export function useDatabaseReady() {
    const { data: isReady = false } = useQuery(databaseReadyQueryOptions());

    return isReady;
}
