import { type StateCreator } from "zustand";
import * as api from "../../api/api";
import * as Interfaces from "../../global/Interfaces";

interface MarcherPageStoreState {
    marcherPages: Interfaces.MarcherPage[],
    marcherPagesAreLoading: boolean
}
interface MarcherPageStoreActions {
    fetchMarcherPages: () => Promise<void>;
    setMarcherPagesAreLoading: (isLoading: boolean) => void;
}
export interface MarcherPageStoreInterface extends MarcherPageStoreState, MarcherPageStoreActions { }

export const marcherPageStoreCreator: StateCreator<MarcherPageStoreState & MarcherPageStoreActions> = (set) => ({
    marcherPages: [],
    marcherPagesAreLoading: true,

    fetchMarcherPages: async () => {
        const newMarcherPages = await api.getMarcherPages();
        set({ marcherPages: newMarcherPages });
    },

    setMarcherPagesAreLoading: (isLoading) => {
        set({ marcherPagesAreLoading: isLoading });
    }
});
