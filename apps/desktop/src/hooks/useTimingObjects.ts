import { useQueries, UseQueryResult } from "@tanstack/react-query";
import {
    allDatabaseBeatsQueryOptions,
    allDatabaseMeasuresQueryOptions,
    allDatabasePagesQueryOptions,
    getUtilityQueryOptions,
} from "./queries";
import Beat, {
    calculateTimestamps,
    fromDatabaseBeat,
} from "@/global/classes/Beat";
import Measure, { fromDatabaseMeasures } from "@/global/classes/Measure";
import Page, { fromDatabasePages } from "@/global/classes/Page";
import { DatabaseUtility } from "@/db-functions/utility";
import { DatabaseBeat, DatabaseMeasure, DatabasePage } from "@/db-functions";
import { queryClient } from "@/App";
import { WorkspaceSettings } from "@/settings/workspaceSettings";
import { workspaceSettingsQueryOptions } from "./queries/useWorkspaceSettings";
import { useDatabaseReady } from "./useDatabaseReady";

export type TimingObjects = {
    beats: Beat[];
    measures: Measure[];
    pages: Page[];
    utility: DatabaseUtility | undefined;
    fetchTimingObjects: () => Promise<void>;
    isLoading: boolean;
    hasError: boolean;
};

// eslint-disable-next-line max-lines-per-function
export const _combineTimingObjects = (
    results: [
        UseQueryResult<DatabasePage[]>,
        UseQueryResult<DatabaseMeasure[]>,
        UseQueryResult<DatabaseBeat[]>,
        UseQueryResult<DatabaseUtility | undefined>,
        UseQueryResult<WorkspaceSettings | undefined>,
    ],
): TimingObjects => {
    const {
        data: pages,
        isLoading: pagesLoading,
        isError: pagesError,
    } = results[0];
    const {
        data: measures,
        isLoading: measuresLoading,
        isError: measuresError,
    } = results[1];
    const {
        data: beats,
        isLoading: beatsLoading,
        isError: beatsError,
    } = results[2];
    const {
        data: utility,
        isLoading: utilityLoading,
        isError: utilityError,
    } = results[3];
    const {
        data: workspaceSettings,
        isLoading: workspaceSettingsLoading,
        isError: workspaceSettingsError,
    } = results[4];

    const shouldSuppressQueryError = (error: Error | undefined): boolean => {
        const suppressedMessages = [
            "Database path is empty",
            "database is locked",
        ];
        return suppressedMessages.some((msg) => error?.message?.includes(msg));
    };

    // Log any errors that occurred during data fetching
    // Suppress errors related to database not being ready (expected during wizard setup)
    if (pagesError) {
        const error = results[0].error as Error | undefined;
        if (!shouldSuppressQueryError(error)) {
            console.error("Pages query error:", results[0]);
        }
    }
    if (measuresError) {
        const error = results[1].error as Error | undefined;
        if (!shouldSuppressQueryError(error)) {
            console.error("Measures query error:", results[1]);
        }
    }
    if (beatsError) {
        const error = results[2].error as Error | undefined;
        if (!shouldSuppressQueryError(error)) {
            console.error("Beats query error:", results[2]);
        }
    }
    if (utilityError) {
        const error = results[3].error as Error | undefined;
        if (!shouldSuppressQueryError(error)) {
            console.error("Utility query error:", results[3]);
        }
    }
    const pageNumberOffset =
        workspaceSettingsLoading || workspaceSettingsError
            ? 0
            : (workspaceSettings?.pageNumberOffset ?? 0);
    const measurementNumberOffset =
        workspaceSettingsLoading || workspaceSettingsError
            ? 1
            : (workspaceSettings?.measurementOffset ?? 1);

    const fetchTimingObjects = async () => {
        await queryClient.invalidateQueries({
            queryKey: allDatabaseBeatsQueryOptions().queryKey,
        });
        await queryClient.invalidateQueries({
            queryKey: getUtilityQueryOptions().queryKey,
        });
        await queryClient.invalidateQueries({
            queryKey: workspaceSettingsQueryOptions().queryKey,
        });
        await queryClient.invalidateQueries({
            queryKey: allDatabasePagesQueryOptions().queryKey,
        });
        await queryClient.invalidateQueries({
            queryKey: allDatabaseMeasuresQueryOptions().queryKey,
        });
    };

    // Check if any query is still loading
    const isLoading =
        pagesLoading || measuresLoading || beatsLoading || utilityLoading;

    // Check if any query has an error
    const hasError = pagesError || measuresError || beatsError || utilityError;

    // Check if all data is available
    const isDataReady =
        !isLoading && !hasError && beats && measures && pages && utility;
    // Return loading state
    if (isLoading) {
        return {
            pages: [],
            measures: [],
            beats: [],
            utility: undefined,
            fetchTimingObjects,
            isLoading: true,
            hasError: false,
        };
    }

    // Return error state
    if (hasError) {
        return {
            pages: [],
            measures: [],
            beats: [],
            utility: undefined,
            fetchTimingObjects,
            isLoading: false,
            hasError: true,
        };
    }

    // Return early if data is not ready (shouldn't happen after loading/error checks, but good for type safety)
    if (!isDataReady) {
        return {
            pages: [],
            measures: [],
            beats: [],
            utility: undefined,
            fetchTimingObjects,
            isLoading: false,
            hasError: false,
        };
    }

    // First create beats with default timestamps
    const rawBeats = beats
        .sort((a, b) => a.position - b.position)
        .map((beat, index) => fromDatabaseBeat(beat, index));
    // Then calculate the actual timestamps based on durations
    const createdBeats = calculateTimestamps(rawBeats);
    const createdMeasures = fromDatabaseMeasures({
        databaseMeasures: measures,
        allBeats: createdBeats,
        measurementNumberOffset: measurementNumberOffset,
    });

    const lastPageCounts = utility.last_page_counts;

    const createdPages = fromDatabasePages({
        databasePages: pages,
        allMeasures: createdMeasures,
        allBeats: createdBeats,
        lastPageCounts,
        pageNumberOffset: pageNumberOffset,
    });

    const processedData = {
        pages: createdPages,
        measures: createdMeasures,
        beats: createdBeats,
        utility,
        fetchTimingObjects,
        isLoading: false,
        hasError: false,
    };
    return processedData;
};

export const useTimingObjects = () => {
    const databaseReady = useDatabaseReady();
    return useQueries({
        queries: [
            allDatabasePagesQueryOptions(databaseReady),
            allDatabaseMeasuresQueryOptions(databaseReady),
            allDatabaseBeatsQueryOptions(databaseReady),
            getUtilityQueryOptions(databaseReady),
            workspaceSettingsQueryOptions(databaseReady),
        ],
        // This must not be a stable function, not an inline function, otherwise it will be called every time the component re-renders
        // https://tanstack.com/query/latest/docs/framework/react/reference/useQueries#memoization
        combine: _combineTimingObjects,
    });
};
