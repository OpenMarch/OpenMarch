import { type StateCreator } from "zustand";
import Measure from "@/global/classes/Measure";
import abcToMeasures from "@/utilities/abcToMeasures";

export interface MeasureStoreInterface {
    measures: Measure[];
    fetchMeasures: () => Promise<void>;
}

export const measureStoreCreator: StateCreator<MeasureStoreInterface> = (set) => ({
    measures: [],

    /**
     * Fetch the measures from the database and updates the store.
     * This is the only way to update retrieve the measures from the database that ensures the UI is updated.
     * To access the measures, use the `measures` property of the store.
     */
    fetchMeasures: async () => {
        const abc_data = await Measure.getMeasures();
        const measures = abcToMeasures(abc_data);
        set({ measures });
    },
});

export default measureStoreCreator;
