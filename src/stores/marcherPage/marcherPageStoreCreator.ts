import { type StateCreator } from "zustand";
import { MarcherPage } from "@/global/classes/MarcherPage";
export interface MarcherPageStoreInterface {
    marcherPages: MarcherPage[],
    fetchMarcherPages: () => Promise<void>;
}

export const marcherPageStoreCreator: StateCreator<MarcherPageStoreInterface> = (set) => ({
    marcherPages: [],
    marcherPagesAreLoading: true,

    fetchMarcherPages: async () => {
        const newMarcherPages = await MarcherPage.getMarcherPages();
        // Todo, create marcherpage objects only after we have optimized the getMarcherPages function
        set({ marcherPages: newMarcherPages });
    },
});
