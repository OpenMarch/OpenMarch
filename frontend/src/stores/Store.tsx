import { create } from "zustand";
import * as api from "../api/api";
import * as Types from "../Interfaces";

interface MarcherStoreState { marchers: Types.Marcher[], marchersAreLoading: boolean }
interface MarcherStoreActions {
    // Why void?
    fetchMarchers: () => Promise<void>;
    setMarchersAreLoading: (isLoading: boolean) => void;
}
export const useMarcherStore = create<MarcherStoreState & MarcherStoreActions>()((set) => ({
    marchers: [],

    fetchMarchers: async () => {
        const marchers = await api.getMarchers();
        set({ marchers });
    },

    marchersAreLoading: true,

    setMarchersAreLoading: (isLoading) => {
        set({ marchersAreLoading: isLoading });
    }

    // addMarcher: async (marcher) => {
    //     await addMarcher(marcher);
    //     set(state => ({
    //       marchers: [...state.marchers, marcher]
    //     }));
    //   }
}));

interface PageStoreState { pages: Types.Page[], pagesAreLoading: boolean }
interface PageStoreActions {
    fetchPages: () => Promise<void>;
    setPagesAreLoading: (isLoading: boolean) => void;
}
export const usePageStore = create<PageStoreState & PageStoreActions>()((set) => ({
    pages: [],

    fetchPages: async () => {
        const pages = await api.getPages();
        set({ pages });
    },

    pagesAreLoading: true,

    setPagesAreLoading: (isLoading) => {
        set({ pagesAreLoading: isLoading });
    }

    // addPage: async (page) => {
    //     await addPage(page);
    //     set(state => ({
    //       pages: [...state.pages, page]
    //     }));
    //   }
}));

interface MarcherPageStoreState { marcherPages: Types.MarcherPage[], marcherPagesAreLoading: boolean }
interface MarcherPageStoreActions {
    fetchMarcherPages: () => Promise<void>;
    setMarcherPagesAreLoading: (isLoading: boolean) => void;
}
export const useMarcherPageStore = create<MarcherPageStoreState & MarcherPageStoreActions>()((set) => ({
    marcherPages: [],

    fetchMarcherPages: async () => {
        const marcherPages = await api.getMarcherPages();
        set({ marcherPages });
    },

    marcherPagesAreLoading: true,

    setMarcherPagesAreLoading: (isLoading) => {
        set({ marcherPagesAreLoading: isLoading });
    }

    // addMarcherPage: async (marcherPage) => {
    //     await addMarcherPage(marcherPage);
    //     set(state => ({
    //       marcherPages: [...state.marcherPages, marcherPage]
    //     }));
    //   }
}));
