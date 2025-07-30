import MarcherPageMap, {
    marcherPageMapFromArray,
} from "@/global/classes/MarcherPageIndex";
import { getMarcherPages } from "@/global/classes/MarcherPage";
import { create } from "zustand";
import { useTimingObjectsStore } from "./TimingObjectsStore";

interface MarcherPageStoreInterface {
    marcherPages: MarcherPageMap;
    marcherPagesAreLoading: boolean;
    fetchMarcherPages: () => Promise<void>;
}

export const useMarcherPageStore = create<MarcherPageStoreInterface>((set) => ({
    marcherPages: { marcherPagesByMarcher: {}, marcherPagesByPage: {} },
    marcherPagesAreLoading: true,

    fetchMarcherPages: async () => {
        // Get pages from the timing objects store
        const { pages } = useTimingObjectsStore.getState();

        // Fetch all marcherPages from the DB
        const marcherPages = await getMarcherPages({ pages });

        // Update the store with the new maps
        set({
            marcherPages: marcherPageMapFromArray(marcherPages),
            marcherPagesAreLoading: false,
        });
    },
}));
