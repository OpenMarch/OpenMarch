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

export type TimingObjects = {
    beats: Beat[];
    measures: Measure[];
    pages: Page[];
    fetchTimingObjects: () => void;
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

    // Log any errors that occurred during data fetching
    if (pagesError) {
        console.error("Pages query error:", results[0]);
    }
    if (measuresError) {
        console.error("Measures query error:", results[1]);
    }
    if (beatsError) {
        console.error("Beats query error:", results[2]);
    }
    if (utilityError) {
        console.error("Utility query error:", results[3]);
    }

    const fetchTimingObjects = async () => {
        await queryClient.invalidateQueries({
            queryKey: allDatabaseBeatsQueryOptions().queryKey,
        });
        void queryClient.invalidateQueries({
            queryKey: getUtilityQueryOptions().queryKey,
        });
        void queryClient.invalidateQueries({
            queryKey: allDatabasePagesQueryOptions().queryKey,
        });
        void queryClient.invalidateQueries({
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
    });

    const lastPageCounts = utility.last_page_counts;

    const createdPages = fromDatabasePages({
        databasePages: pages,
        allMeasures: createdMeasures,
        allBeats: createdBeats,
        lastPageCounts,
    });

    const processedData = {
        pages: createdPages,
        measures: createdMeasures,
        beats: createdBeats,
        fetchTimingObjects,
        isLoading: false,
        hasError: false,
    };
    return processedData;
};

export const useTimingObjects = () => {
    return useQueries({
        queries: [
            allDatabasePagesQueryOptions(),
            allDatabaseMeasuresQueryOptions(),
            allDatabaseBeatsQueryOptions(),
            getUtilityQueryOptions(),
        ],
        // This must not be a stable function, not an inline function, otherwise it will be called every time the component re-renders
        // https://tanstack.com/query/latest/docs/framework/react/reference/useQueries#memoization
        combine: _combineTimingObjects,
    });
};
