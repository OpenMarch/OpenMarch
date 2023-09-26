import { create } from "zustand";
import * as api from "../api/api";
import * as Types from "../Interfaces";

interface MarcherStoreState { marchers: Types.Marcher[] }
interface MarcherStoreActions {
    // Why void?
    fetchMarchers: () => Promise<void>;
}
export const useMarcherStore = create<MarcherStoreState & MarcherStoreActions>()((set) => ({
    marchers: [{ id: 0, id_for_html: "asdf", name: "jeff", instrument: "", drill_number: 0, drill_prefix: "", tableName: Types.InterfaceConst.MarcherTableName }],

    fetchMarchers: async () => {
        const marchers = await api.getMarchers();
        set({ marchers });
    },

    // addMarcher: async (marcher) => {
    //     await addMarcher(marcher);
    //     set(state => ({
    //       marchers: [...state.marchers, marcher]
    //     }));
    //   }
}));

interface PageStoreState { pages: Types.Page[] }
interface PageStoreActions {
    fetchPages: () => Promise<void>;
}
export const usePageStore = create<PageStoreState & PageStoreActions>()((set) => ({
    pages: [],

    fetchPages: async () => {
        const pages = await api.getPages();
        set({ pages });
    },

    // addPage: async (page) => {
    //     await addPage(page);
    //     set(state => ({
    //       pages: [...state.pages, page]
    //     }));
    //   }
}));

interface MarcherPageStoreState { marcherPages: Types.MarcherPage[] }
interface MarcherPageStoreActions {
    fetchMarcherPages: () => Promise<void>;
}
export const useMarcherPageStore = create<MarcherPageStoreState & MarcherPageStoreActions>()((set) => ({
    marcherPages: [],

    fetchMarcherPages: async () => {
        const marcherPages = await api.getMarcherPages();
        set({ marcherPages });
    },

    // addMarcherPage: async (marcherPage) => {
    //     await addMarcherPage(marcherPage);
    //     set(state => ({
    //       marcherPages: [...state.marcherPages, marcherPage]
    //     }));
    //   }
}));
