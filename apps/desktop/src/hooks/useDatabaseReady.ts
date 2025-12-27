import { useQuery } from "@tanstack/react-query";

const DATABASE_READY_KEY = ["database", "isReady"] as const;

/**
 * Hook to check if the database is ready.
 * Uses React Query to cache the result and automatically refetch when needed.
 */
export function useDatabaseReady() {
    const { data: isReady = false } = useQuery({
        queryKey: DATABASE_READY_KEY,
        queryFn: async () => {
            return await window.electron.databaseIsReady();
        },
        staleTime: 1000, // Refetch every second to catch when database becomes ready
        refetchInterval: 1000,
    });

    return isReady;
}
