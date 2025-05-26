import Beat, {
    fromDatabaseBeat,
    calculateTimestamps,
} from "@/global/classes/Beat";
import Measure, { fromDatabaseMeasures } from "@/global/classes/Measure";
import Page, { fromDatabasePages } from "@/global/classes/Page";
import { create } from "zustand";

export type TimingObjects = {
    beats: Beat[];
    measures: Measure[];
    pages: Page[];
};

type TimingObjectStoreInterface = TimingObjects & {
    /**
     * Fetch the timing objects (beats, measures, and pages) from the database and updates the store.
     * @returns A promise that resolves when the TimingObjects have been fetched
     */
    fetchTimingObjects: () => Promise<void>;
};

export const useTimingObjectsStore = create<TimingObjectStoreInterface>(
    (set) => ({
        pages: [],
        measures: [],
        beats: [],

        /**
         * Fetch the pages from the database and updates the store.
         * This is the only way to update retrieve the pages from the database that ensures the UI is updated.
         *
         * The objects are constructed in the order of Beats -> Measures -> Pages.
         */
        fetchTimingObjects: async (): Promise<void> => {
            const pagesResponse = await window.electron.getPages();
            if (!pagesResponse.success) {
                console.error(pagesResponse.error);
                throw new Error(
                    pagesResponse.error?.message ?? "Could not fetch pages",
                );
            }
            const beatsResponse = await window.electron.getBeats();
            if (!beatsResponse.success) {
                console.error(beatsResponse.error);
                throw new Error(
                    beatsResponse.error?.message ?? "Could not fetch beats",
                );
            }
            const measuresResponse = await window.electron.getMeasures();
            if (!measuresResponse.success) {
                console.error(measuresResponse.error);
                throw new Error(
                    measuresResponse.error?.message ??
                        "Could not fetch measures",
                );
            }
            // First create beats with default timestamps
            const rawBeats = beatsResponse.data
                .sort((a, b) => a.position - b.position)
                .map((beat, index) => fromDatabaseBeat(beat, index));
            // Then calculate the actual timestamps based on durations
            const createdBeats = calculateTimestamps(rawBeats);
            const createdMeasures = fromDatabaseMeasures({
                databaseMeasures: measuresResponse.data,
                allBeats: createdBeats,
            });

            const utilityResponse = await window.electron.getUtilityRecord();
            if (!utilityResponse.success || !utilityResponse.data) {
                console.error(utilityResponse.error);
                throw new Error(
                    utilityResponse.error?.message ??
                        "Could not fetch utility record",
                );
            }
            const lastPageCounts = utilityResponse.data.last_page_counts;

            const createdPages = fromDatabasePages({
                databasePages: pagesResponse.data,
                allMeasures: createdMeasures,
                allBeats: createdBeats,
                lastPageCounts,
            });
            set({
                pages: createdPages,
                measures: createdMeasures,
                beats: createdBeats,
            });
        },
    }),
);
