import { type StateCreator } from "zustand";
import * as api from "../../api/api";
import * as Interfaces from "../../global/Interfaces";

export interface PageStoreInterface {
    /**
     * List of all pages sorted by order in the drill
     */
    pages: Interfaces.Page[],
    /**
     * Fetch the pages from the API and set them in the store
     * @returns A promise that resolves when the pages have been fetched
     */
    fetchPages: () => Promise<void>;
}

export const pageStoreCreator: StateCreator<PageStoreInterface> = (set) => ({
    pages: [],
    pagesAreLoading: true,

    fetchPages: async () => {
        const newPages = await api.getPages();
        set({
            pages: newPages.sort((a, b) => a.order - b.order),
        });
    },
});
