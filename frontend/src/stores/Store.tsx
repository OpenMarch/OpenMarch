import { create } from "zustand";
import * as api from "../api/api";
import * as Types from "../Interfaces";

interface MarcherStoreState {
    marchers: Types.Marcher[],
    marchersAreLoading: boolean
}
interface MarcherStoreActions {
    // Why void?
    fetchMarchers: () => Promise<void>;
    setMarchersAreLoading: (isLoading: boolean) => void;
}
export const useMarcherStore = create<MarcherStoreState & MarcherStoreActions>()((set) => ({
    marchers: [],
    marchersAreLoading: true,

    fetchMarchers: async () => {
        const newMarchers = await api.getMarchers();
        set({ marchers: newMarchers });
    },


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

interface PageStoreState {
    pages: Types.Page[],
    pagesAreLoading: boolean
}
interface PageStoreActions {
    fetchPages: () => Promise<void>;
    setPagesAreLoading: (isLoading: boolean) => void;
}
export const usePageStore = create<PageStoreState & PageStoreActions>()((set) => ({
    pages: [],
    pagesAreLoading: true,

    fetchPages: async () => {
        const newPages = await api.getPages();
        set({ pages: newPages });
    },

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

interface MarcherPageStoreState {
    marcherPages: Types.MarcherPage[],
    marcherPagesAreLoading: boolean
}
interface MarcherPageStoreActions {
    fetchMarcherPages: () => Promise<void>;
    setMarcherPagesAreLoading: (isLoading: boolean) => void;
}
export const useMarcherPageStore = create<MarcherPageStoreState & MarcherPageStoreActions>()((set) => ({
    marcherPages: [],
    marcherPagesAreLoading: true,

    fetchMarcherPages: async () => {
        const newMarcherPages = await api.getMarcherPages();
        set({ marcherPages: newMarcherPages });
    },

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
