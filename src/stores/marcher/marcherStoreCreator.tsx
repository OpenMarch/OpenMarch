import { type StateCreator } from "zustand";
import * as api from "../../api/api";
import * as Interfaces from "../../global/Interfaces";

interface MarcherStoreState {
    marchers: Interfaces.Marcher[],
    marchersAreLoading: boolean
}
interface MarcherStoreActions {
    fetchMarchers: () => Promise<void>;
    setMarchersAreLoading: (isLoading: boolean) => void;
}
export interface MarcherStoreInterface extends MarcherStoreState, MarcherStoreActions { }

export const marcherStoreCreator: StateCreator<MarcherStoreState & MarcherStoreActions> = (set) => ({
    marchers: [],
    marchersAreLoading: true,

    fetchMarchers: async () => {
        const newMarchers = await api.getMarchers();
        set({ marchers: newMarchers });
    },

    setMarchersAreLoading: (isLoading) => {
        set({ marchersAreLoading: isLoading });
    }
});
