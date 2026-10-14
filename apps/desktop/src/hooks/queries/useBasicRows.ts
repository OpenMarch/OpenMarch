import {
    keepPreviousData,
    queryOptions,
    useQuery,
} from "@tanstack/react-query";
import { db } from "@/global/database/db";
import { readBasicRows } from "@/db-functions/basicRows";
import { withTimelineWriteLock } from "@/db-functions/history";
import { useTimelineViewVersions } from "@/timeline/useTimelineViewVersions";

const KEY_BASE = "timeline_basic_rows";

/**
 * Keys for Basic mode's rows (`readBasicRows`). They carry the resolver and display versions
 * (`useTimelineViewVersions`), which every committed timeline edit, undo, redo and cold build
 * moves, so nothing has to invalidate them: like the other timeline views, they follow the change
 * log (`hooks/queries/utils.ts` maps the timeline tables to no keys for that reason).
 */
export const basicRowsKeys = {
    all: () => [KEY_BASE] as const,
    at: (version: number, displayVersion: number) =>
        [KEY_BASE, version, displayVersion] as const,
};

export const basicRowsQueryOptions = (
    version: number,
    displayVersion: number,
) =>
    queryOptions({
        queryKey: basicRowsKeys.at(version, displayVersion),
        // Under the write lock, so no write lands while the rows are read
        queryFn: () => withTimelineWriteLock(() => readBasicRows(db)),
        staleTime: Infinity,
        // Keep showing the last rows while the next version loads, so locks and ticks don't flicker
        placeholderData: keepPreviousData,
    });

/**
 * Every assignment row as Basic mode reads it (`BasicRow`), current after every timeline edit.
 * Reads nothing while `enabled` is false (Expert), since every edit would otherwise re-read them.
 */
export function useBasicRows(enabled = true) {
    const { version, displayVersion } = useTimelineViewVersions();
    return useQuery({
        ...basicRowsQueryOptions(version, displayVersion),
        enabled,
    });
}
