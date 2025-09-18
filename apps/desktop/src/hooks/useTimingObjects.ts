import { useQuery } from "@tanstack/react-query";
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
import { queryClient } from "@/App";
import { useCallback, useMemo } from "react";
import {
    DatabaseBeat,
    DatabaseMeasure,
    DatabasePage,
    DatabaseUtility,
} from "@/db-functions";

export type TimingObjects = {
    beats: Beat[];
    measures: Measure[];
    pages: Page[];
    fetchTimingObjects: () => void;
    isLoading: boolean;
    hasError: boolean;
};

const processTimingObjects = (
    pagesData: DatabasePage[],
    measuresData: DatabaseMeasure[],
    beatsData: DatabaseBeat[],
    utilityData: DatabaseUtility,
): { beats: Beat[]; measures: Measure[]; pages: Page[] } => {
    // First create beats with default timestamps
    const rawBeats = beatsData
        .sort((a, b) => a.position - b.position)
        .map((beat, index) => fromDatabaseBeat(beat, index));
    // Then calculate the actual timestamps based on durations
    const createdBeats = calculateTimestamps(rawBeats);
    const createdMeasures = fromDatabaseMeasures({
        databaseMeasures: measuresData,
        allBeats: createdBeats,
    });

    const lastPageCounts = utilityData.last_page_counts;

    const createdPages = fromDatabasePages({
        databasePages: pagesData,
        allMeasures: createdMeasures,
        allBeats: createdBeats,
        lastPageCounts,
    });

    return {
        beats: createdBeats,
        measures: createdMeasures,
        pages: createdPages,
    };
};

export const useTimingObjects = (): TimingObjects => {
    const {
        data: pagesData,
        isLoading: pagesLoading,
        isError: pagesError,
        isSuccess: pagesSuccess,
    } = useQuery(allDatabasePagesQueryOptions());
    const {
        data: measuresData,
        isLoading: measuresLoading,
        isError: measuresError,
        isSuccess: measuresSuccess,
    } = useQuery(allDatabaseMeasuresQueryOptions());
    const {
        data: beatsData,
        isLoading: beatsLoading,
        isError: beatsError,
        isSuccess: beatsSuccess,
    } = useQuery(allDatabaseBeatsQueryOptions());
    const {
        data: utilityData,
        isLoading: utilityLoading,
        isError: utilityError,
        isSuccess: utilitySuccess,
    } = useQuery(getUtilityQueryOptions());

    const isLoading =
        pagesLoading || measuresLoading || beatsLoading || utilityLoading;
    const hasError = pagesError || measuresError || beatsError || utilityError;
    const isDataReady =
        pagesSuccess && measuresSuccess && beatsSuccess && utilitySuccess;

    const fetchTimingObjects = useCallback(() => {
        queryClient.invalidateQueries({
            queryKey: allDatabasePagesQueryOptions().queryKey,
        });
        queryClient.invalidateQueries({
            queryKey: allDatabaseMeasuresQueryOptions().queryKey,
        });
        queryClient.invalidateQueries({
            queryKey: allDatabaseBeatsQueryOptions().queryKey,
        });
        queryClient.invalidateQueries({
            queryKey: getUtilityQueryOptions().queryKey,
        });
    }, []);

    const processedData = useMemo(() => {
        if (
            !isDataReady ||
            !pagesData ||
            !measuresData ||
            !beatsData ||
            !utilityData
        ) {
            return {
                beats: [],
                measures: [],
                pages: [],
            };
        }

        return processTimingObjects(
            pagesData,
            measuresData,
            beatsData,
            utilityData,
        );
    }, [isDataReady, pagesData, measuresData, beatsData, utilityData]);

    return {
        ...processedData,
        fetchTimingObjects,
        isLoading,
        hasError,
    };
};
