import { type StateCreator } from "zustand";
import { Marcher } from "@/global/classes/Marcher";

export interface MarcherStoreInterface {
    marchers: Marcher[]
    fetchMarchers: () => Promise<void>;
}

export const marcherStoreCreator: StateCreator<MarcherStoreInterface> = (set) => ({
    marchers: [],

    /**
     * Fetch the marchers from the database and updates the store.
     * This is the only way to update retrieve the marchers from the database that ensures the UI is updated.
     * To access the marchers, use the `marchers` property of the store.
     */
    fetchMarchers: async () => {
        const receivedMarchers = await Marcher.getMarchers();
        const sortedMarchers = receivedMarchers.sort((a, b) => Marcher.compare(a, b));
        set({ marchers: sortedMarchers });
    },
});
