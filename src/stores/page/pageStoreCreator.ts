import { type StateCreator } from "zustand";
import * as api from "../../api/api";
import * as Interfaces from "../../global/Interfaces";

interface PageStoreState {
    pages: Interfaces.Page[],
    pagesAreLoading: boolean
}
interface PageStoreActions {
    fetchPages: () => Promise<void>;
    setPagesAreLoading: (isLoading: boolean) => void;
}
export interface PageStoreInterface extends PageStoreState, PageStoreActions { }

export const pageStoreCreator: StateCreator<PageStoreState & PageStoreActions> = (set) => ({
    pages: [],
    pagesAreLoading: true,

    fetchPages: async () => {
        // set({ pagesAreLoading: true });
        const newPages = await api.getPages();
        set({ pages: newPages, pagesAreLoading: false });
    },

    setPagesAreLoading: (isLoading) => {
        set({ pagesAreLoading: isLoading });
    }
});
