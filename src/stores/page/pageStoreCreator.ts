import { type StateCreator } from "zustand";
import * as api from "../../api/api";
import * as Interfaces from "../../global/Interfaces";

interface PageStoreState {
    /**
     * List of all pages sorted by order in the drill
     */
    pages: Interfaces.Page[],
    pagesAreLoading: boolean
}
interface PageStoreActions {
    /**
     * Fetch the pages from the API and set them in the store
     * @returns A promise that resolves when the pages have been fetched
     */
    fetchPages: () => Promise<void>;
    setPagesAreLoading: (isLoading: boolean) => void;
}
export interface PageStoreInterface extends PageStoreState, PageStoreActions { }

export const pageStoreCreator: StateCreator<PageStoreState & PageStoreActions> = (set) => ({
    pages: [],
    pagesAreLoading: true,

    fetchPages: async () => {
        const newPages = await api.getPages();
        set({
            pages: newPages.sort((a, b) => a.order - b.order),
            pagesAreLoading: false
        });
    },

    setPagesAreLoading: (isLoading) => {
        set({ pagesAreLoading: isLoading });
    }
});
