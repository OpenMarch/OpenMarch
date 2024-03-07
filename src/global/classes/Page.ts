import { TimeSignature } from "./TimeSignature";

/**
 * A class that represents a Page in the database.
 * This is the standard Page object that should be used throughout the application.
 *
 * Note: this class has no/should not have instance methods. All methods are static.
 */
export class Page {
    /** The id of the page in the database */
    readonly id: number;
    /** The id of the page for use in the HTML. E.g. "page_2" for page with ID of 2 */
    readonly id_for_html: string;
    /** The name of the page. E.g. "2A" */
    readonly name: string;
    /** Amount of counts in the page */
    readonly counts: number;
    /** The order of the page in the show. E.g. 1, 2, 3, etc. */
    readonly order: number;
    /** The tempo of the page in BPM. Currently only in quarter notes */
    readonly tempo: number;
    /** The time signature of the page. E.g. "4/4" */
    readonly time_signature: TimeSignature | string;
    /** Any notes about the page. Optional */
    readonly notes?: string;
    /**
     * Fetches all of the pages from the database.
     * This is attached to the Page store and needs to be updated in a useEffect hook so that the UI is updated.
     */
    static fetchPages: () => Promise<void>;

    constructor(page: Page) {
        this.id = page.id;
        this.id_for_html = page.id_for_html;
        this.name = page.name;
        this.counts = page.counts;
        this.order = page.order;
        this.tempo = page.tempo || 120;

        if (!(page.time_signature instanceof TimeSignature))
            this.time_signature = TimeSignature.timeSignatureFromString(page.time_signature);
        else
            this.time_signature = page.time_signature;

        this.notes = page.notes;
    }

    /**
     * Fetches all of the pages from the database.
     * This should not be called outside of the page store - as the current pages are stored already in the store
     * and the fetchPages function is attached to the store and updates the UI.
     * @returns a list of all pages
     */
    static async getPages() {
        const response = await window.electron.getPages();
        return response;
    }

    /**
     * Creates a new page in the database and updates the store.
     *
     * @param newPage - The new page object to be created.
     * @returns DatabaseResponse: { success: boolean; errorMessage?: string;}
     */
    static async createPage(newPage: NewPageArgs) {
        return await this.createPages([newPage]);
    }

    /**
     * Creates one or more new pages in the database and updates the store.
     *
     * @param newPagesArg - The new pages to be created.
     * @returns DatabaseResponse: { success: boolean; errorMessage?: string;}
     */
    static async createPages(newPagesArg: NewPageArgs[]) {
        const newPages = this.validateTimeSignatures(newPagesArg) as NewPageArgs[];
        const response = await window.electron.createPages(newPages);
        // fetch the pages to update the store
        this.checkForFetchPages();
        this.fetchPages();
        return response;
    }

    /**
     * Update one or many pages with the provided arguments.
     *
     * @param modifiedPagesArg - The objects to update the pages with.
     * @returns DatabaseResponse: { success: boolean; errorMessage?: string;}
     */
    static async updatePages(modifiedPagesArg: ModifiedPageArgs[]) {
        const modifiedPages = this.validateTimeSignatures(modifiedPagesArg) as ModifiedPageArgs[];
        const response = await window.electron.updatePages(modifiedPages);
        // fetch the pages to update the store
        this.checkForFetchPages();
        this.fetchPages();
        return response;
    }

    /**
     * Deletes a page from the database.
     * CAUTION - this will delete all of the pagePages associated with the page.
     * THIS CANNOT BE UNDONE.
     *
     * @param page_id - The id of the page. Do not use id_for_html.
     * @returns Response data from the server.
     */
    static async deletePage(page_id: number) {
        const response = await window.electron.deletePage(page_id);
        // fetch the pages to update the store
        this.checkForFetchPages();
        this.fetchPages();
        return response;
    }

    /**
     * Checks if fetchPages is defined. If not, it logs an error to the console.
     */
    static checkForFetchPages() {
        if (!this.fetchPages)
            console.error("fetchPages is not defined. The UI will not update properly.");
    }

    /**
     * Sorts the pages by order.
     * @param pages - The list of pages to sort.
     * @returns The list of pages sorted by order.
     */
    static sortPagesByOrder(pages: Page[]) {
        return pages.sort((a, b) => a.order - b.order);
    }

    /**
     * Loops through a list of pages and validates the time signatures and turns them into strings for the database.
     *
     * @param pages - The list of page objects to validate time signatures for.
     * @return The list of pages with validated time signatures.
     */
    private static validateTimeSignatures(pages: NewPageArgs[] | ModifiedPageArgs[]) {
        const validatedPages = [...pages];
        validatedPages.forEach((page) => {
            if (page.time_signature) {
                if (page.time_signature instanceof TimeSignature) {
                    page.time_signature = page.time_signature.toString();
                } else {
                    // convert the time signature to a TimeSignature object and then to a string to ensure it is valid
                    page.time_signature = TimeSignature.timeSignatureFromString(page.time_signature).toString();
                }
            }
        });
        return validatedPages;
    }

    /**
     * Retrieves the next Page based on this Page and the list of all Pages.
     * If the current Page is the last Page, null is returned.
     *
     * @param currentPage - The current Page.
     * @param allPages - The list of all Pages.
     * @returns The next Page or null if the current Page is the last Page.
     * @throws If the current Page is not found in the list of all Pages.
     */
    static getNextPage(currentPage: Page, allPages: Page[]): Page | null {
        if (!allPages || allPages.length === 0)
            return null;

        const higherOrderPages = allPages.filter((page) => page.order > currentPage.order);
        if (higherOrderPages.length === 0)
            return null; // the current page is the last page

        // find the nearest page with an order greater than the current page
        const sortedHigherOrderPages = this.sortPagesByOrder(higherOrderPages);
        const nextPage = sortedHigherOrderPages.reduce((nearestNextPage, current) => {
            if (current.order > currentPage.order && (nearestNextPage === null || current.order < nearestNextPage.order)) {
                return current;
            }
            return nearestNextPage;
        });

        return nextPage !== currentPage ? nextPage : null;
    }

    /**
     * Retrieves the previous Page based on this Page and the list of all Pages.
     * If the current Page is the first Page, null is returned.
     *
     * @param currentPage - The current Page.
     * @param allPages - The list of all Pages.
     * @returns The previous Page or null if the current Page is the first Page.
     * @throws If the current Page is not found in the list of all Pages.
     */
    static getPreviousPage(currentPage: Page, allPages: Page[]): Page | null {
        if (!allPages || allPages.length === 0)
            return null;

        const lowerOrderPages = allPages.filter((page) => page.order < currentPage.order);
        if (lowerOrderPages.length === 0)
            return null; // the current page is the first page

        // find the nearest page with an order greater than the current page
        const sortedLowerOrderPages = this.sortPagesByOrder(lowerOrderPages).reverse();
        const previousPage = sortedLowerOrderPages.reduce((nearestPreviousPage, current) => {
            if (current.order < currentPage.order && (nearestPreviousPage === null || current.order > nearestPreviousPage.order)) {
                return current;
            }
            return nearestPreviousPage;
        });

        return previousPage !== currentPage ? previousPage : null;
    }
}

/**
 * Defines the required/available fields of a new page.
 */
export interface NewPageArgs {
    name: string;
    counts: number;
    tempo: number;
    time_signature: TimeSignature | string;
    notes?: string;
}

/**
 * Defines the editable fields of a page.
 */
export interface ModifiedPageArgs {
    /**
     * The id of the page to update.
     */
    id: number;
    counts?: number;
    tempo?: number;
    time_signature?: TimeSignature | string;
    notes?: string;
}
