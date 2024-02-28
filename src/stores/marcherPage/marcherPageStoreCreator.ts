import { type StateCreator } from "zustand";
import * as api from "../../api/api";
import * as Interfaces from "../../global/Interfaces";

export interface MarcherPageStoreInterface {
    marcherPages: Interfaces.MarcherPage[],
    fetchMarcherPages: () => Promise<void>;
}

export const marcherPageStoreCreator: StateCreator<MarcherPageStoreInterface> = (set) => ({
    marcherPages: [],
    marcherPagesAreLoading: true,

    fetchMarcherPages: async () => {
        const newMarcherPages = await api.getMarcherPages();
        set({ marcherPages: newMarcherPages });
    },
});
