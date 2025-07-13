import MarcherPage from "@/global/classes/MarcherPage";
import { create } from "zustand";

interface MarcherPageStoreInterface {
    marcherPages: MarcherPage[];
    fetchMarcherPages: () => Promise<void>;
}

export const useMarcherPageStore = create<MarcherPageStoreInterface>((set) => ({
    marcherPages: [],
    marcherPagesAreLoading: true,

    fetchMarcherPages: async () => {
        const newMarcherPages = await MarcherPage.getMarcherPages();
        // Todo, create marcherPage objects only after we have optimized the getMarcherPages function
        set({ marcherPages: newMarcherPages });
    },
}));
