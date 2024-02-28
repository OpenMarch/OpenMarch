import { type StateCreator } from "zustand";
import { Marcher } from "@/global/classes/Marcher";

export interface MarcherStoreInterface {
    marchers: Marcher[]
    fetchMarchers: () => Promise<Marcher[]>;
}

export const marcherStoreCreator: StateCreator<MarcherStoreInterface> = (set) => ({
    marchers: [],

    fetchMarchers: async (): Promise<Marcher[]> => {
        const newMarchers = await Marcher.getMarchers();
        set({ marchers: newMarchers });
        return newMarchers;
    },
});
