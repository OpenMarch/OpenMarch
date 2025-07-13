import {
    MarcherPageMap,
    MarcherPageNestedMap,
} from "@/global/classes/MarcherPageIndex";
import MarcherPage from "@/global/classes/MarcherPage";
import { create } from "zustand";

interface MarcherPageStoreInterface {
    marcherPages: MarcherPageMap;
    marcherPagesAreLoading: boolean;
    fetchMarcherPages: () => Promise<void>;
}

export const useMarcherPageStore = create<MarcherPageStoreInterface>((set) => ({
    marcherPages: { marcherPagesByMarcher: {}, marcherPagesByPage: {} },
    marcherPagesAreLoading: true,

    fetchMarcherPages: async () => {
        // Fetch all marcherPages from the DB
        const rawMarcherPages = await MarcherPage.getMarcherPages();

        // Create maps
        const marcherPagesByMarcher: MarcherPageNestedMap = {};
        const marcherPagesByPage: MarcherPageNestedMap = {};

        // Populate maps
        rawMarcherPages.forEach((mp) => {
            if (!marcherPagesByMarcher[mp.marcher_id]) {
                marcherPagesByMarcher[mp.marcher_id] = {};
            }
            marcherPagesByMarcher[mp.marcher_id][mp.page_id] = mp;

            if (!marcherPagesByPage[mp.page_id]) {
                marcherPagesByPage[mp.page_id] = {};
            }
            marcherPagesByPage[mp.page_id][mp.marcher_id] = mp;
        });

        // Update the store with the new maps
        set({
            marcherPages: { marcherPagesByMarcher, marcherPagesByPage },
            marcherPagesAreLoading: false,
        });
    },
}));
