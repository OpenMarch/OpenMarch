import { QueryCache, QueryClient } from "@tanstack/react-query";

export const tableNamesToQueryKeys = (tableNames: Set<string>): string[][] => {
    const queryKeys: string[][] = Array.from(tableNames)
        .map(singleTableNameToQueryKey)
        .flat();
    return queryKeys;
};

export const safelyInvalidateQueries = async (
    queryKeys: string[][],
    queryClient: QueryClient,
) => {
    const validQueryKeys = queryKeys.filter((queryKey) =>
        validateQueryKey(queryKey, queryClient.getQueryCache()),
    );
    for (const queryKey of validQueryKeys) {
        await queryClient.invalidateQueries({ queryKey });
    }
};

export const validateQueryKey = (
    queryKey: string[],
    currentCache: QueryCache,
) => {
    const matches = currentCache.findAll({ queryKey });

    if (matches.length === 0) {
        console.warn(
            `Query key '${queryKey}' not found in cache. No data will be fetched for this table.

            This likely means that you're using the wrong query key. Check if this table needs to be defined in "singleTableNameToQueryKey.`,
        );
        return true;
    }
    return true;
};

const singleTableNameToQueryKey = (tableName: string): string[][] => {
    switch (tableName) {
        case "shape_page_marchers":
            return [["shape_pages"], ["marcher_pages"]];
        // Timeline data tables (ADR 0001 §3). Their query hooks use the table name as the key
        // base, as the page-model hooks do; listed so the mapping is explicit when they land.
        case "timelines":
        case "timeline_shapes":
        case "timeline_transitions":
        case "timeline_assignments":
        case "timeline_slot_destinations":
            return [[tableName]];
        default:
            return [[tableName]];
    }
};
