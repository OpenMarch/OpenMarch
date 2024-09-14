import Page from "@/global/classes/Page";
import { create } from "zustand";

interface PageStoreInterface {
    /**
     * List of all pages sorted by order in the drill
     */
    pages: Page[];
    /**
     * Fetch the pages from the API and set them in the store
     * @returns A promise that resolves when the pages have been fetched
     */
    fetchPages: () => Promise<void>;
    /**
     * THIS SHOULD NOT BE CALLED OUTSIDE OF THE STATE INITIALIZER
     * @param pages - The pages to set in the store
     */
    setPages: (pages: Page[]) => void;
}

export const usePageStore = create<PageStoreInterface>((set) => ({
    pages: [],

    /**
     * Fetch the pages from the database and updates the store.
     * This is the only way to update retrieve the pages from the database that ensures the UI is updated.
     * To access the pages, use the `pages` property of the store.
     */
    fetchPages: async (): Promise<void> => {
        const newPages = await Page.getPages();

        // Create new Page objects from the API response. This is necessary to ensure the instance methods work.
        let pagesToUse = newPages.map((page) => new Page(page));
        pagesToUse = Page.sortPagesByOrder(pagesToUse);

        set({
            pages: pagesToUse,
        });
    },

    /**
     * THIS SHOULD NOT BE CALLED OUTSIDE OF THE STATE INITIALIZER
     * @param pages - The pages to set in the store
     */
    setPages: (pages: Page[]) => {
        set({
            pages: pages,
        });
    },
}));
