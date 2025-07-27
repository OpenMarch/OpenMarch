import MarcherPageMap, {
    marcherPageMapFromArray,
} from "@/global/classes/MarcherPageIndex";
import { getMarcherPages } from "@/global/classes/MarcherPage";
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
        const marcherPages = await getMarcherPages();

        // Update the store with the new maps
        set({
            marcherPages: marcherPageMapFromArray(marcherPages),
            marcherPagesAreLoading: false,
        });
    },
}));
