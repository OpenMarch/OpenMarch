import Measure from "@/global/classes/Measure";
import { create } from "zustand";

interface MeasureStoreInterface {
    measures: Measure[];
    fetchMeasures: () => Promise<void>;
}

export const useMeasureStore = create<MeasureStoreInterface>((set) => ({
    measures: [],

    /**
     * Fetch the measures from the database and updates the store.
     * This is the only way to update retrieve the measures from the database that ensures the UI is updated.
     * To access the measures, use the `measures` property of the store.
     */
    fetchMeasures: async () => {
        const measures = await Measure.getMeasures();
        set({ measures });
    },
}));
