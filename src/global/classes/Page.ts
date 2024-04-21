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
    /** Number of counts to get to this page */
    readonly counts: number;
    /** The order of the page in the show. E.g. 1, 2, 3, etc. */
    readonly order: number;
    /** The tempo of the page in BPM. Currently only in quarter notes */
    readonly tempo: number;
    /** NOT IMPLEMENTED - The time signature of the page. E.g. "4/4" */
    readonly time_signature: TimeSignature;
    /** NOT IMPLEMENTED - The rehearsal letter of the page. Optional */
    readonly rehearsal_mark?: string;
    /** NOT IMPLEMENTED - Any notes about the page. Optional */
    readonly notes?: string;
    /**
     * Fetches all of the pages from the database.
     * This is attached to the Page store and needs to be updated in a useEffect hook so that the UI is updated.
     */
    static fetchPages: () => Promise<void>;

    constructor(args: {
        id: number, id_for_html: string, name: string, counts: number, order: number, tempo: number,
        time_signature: TimeSignature | string, rehearsal_mark?: string, notes?: string
    }) {
        this.id = args.id;
        this.id_for_html = args.id_for_html;
        this.rehearsal_mark = args.rehearsal_mark;
        this.name = args.name;
        if (args.counts < 0)
            this.counts = 1;
        else
            this.counts = args.counts;
        this.order = args.order;
        this.tempo = args.tempo || 120;

        if (TimeSignature.instanceOf(args.time_signature))
            this.time_signature = args.time_signature;
        else
            this.time_signature = TimeSignature.fromString(args.time_signature);

        this.notes = args.notes;
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
     * Creates one or more new pages in the database and updates the store.
     *
     * @param newPagesArg - The new pages to be created in order of how they should be created.
     * @param existingPages - The current list of pages. Must be provided to create correct page names and orders.
     * @returns DatabaseResponse: { success: boolean; error?: Error; newPages?: NewPageContainer[];}
     */
    static async createPages(newPagesArgs: NewPageArgs[], existingPages: Page[]):
        Promise<{ success: boolean; error?: { message: string, stack?: string }; newPages?: NewPageContainer[]; }> {

        // What all the new pages will look like
        const futurePages: ModifiedPageArgs[] = existingPages.map((page) => {
            const isSubset = page.splitPageName().subset !== null;
            return {
                id: page.id,
                counts: page.counts,
                tempo: page.tempo,
                time_signature: page.time_signature,
                rehearsal_mark: page.rehearsal_mark,
                notes: page.notes,
                isSubset: isSubset
            };
        });

        const newPageTempId = -1;
        newPagesArgs.forEach((newPageArg) => {
            // If there is no previous page, add the new page to the end of the show
            const previousPageIdx =
                newPageArg.previousPage ?
                    futurePages.findIndex((page) => page.id === newPageArg.previousPage!.id)
                    : futurePages.length - 1;

            // find the next page that is not a new page
            let newPageIdx = previousPageIdx + 1;
            if (futurePages.length > 0) {
                while (futurePages[newPageIdx] && (futurePages[newPageIdx].id === newPageTempId))
                    newPageIdx++;
            }

            futurePages.splice(newPageIdx, 0, { ...newPageArg, id: newPageTempId });
        })


        const futurePageNames = this.generatePageNames(futurePages.map((page) => page.isSubset || false));
        let currentOrder = 0;
        // If we are adding a new page, we need to modify the following existing pages
        let modifyExistingPages = false;

        const newPageContainers: NewPageContainer[] = [];
        const modifiedPageContainers: ModifiedPageContainer[] = [];

        futurePages.forEach((futurePage, i) => {
            if (futurePage.id === newPageTempId) {
                const newPageContainer: NewPageContainer = {
                    name: futurePageNames[i],
                    counts: futurePage.counts!,
                    order: currentOrder,
                    tempo: futurePage.tempo!,
                    time_signature: futurePage.time_signature!.toString()
                };
                if (futurePage.rehearsal_mark)
                    newPageContainer.rehearsal_mark = futurePage.rehearsal_mark;
                if (futurePage.notes)
                    newPageContainer.notes = futurePage.notes;

                newPageContainers.push(newPageContainer);
                // Since we are adding a new page, we need to modify the following existing pages
                modifyExistingPages = true;
            } else if (modifyExistingPages) {
                // If we are modifying existing pages, we need to update the order
                modifiedPageContainers.push({
                    id: futurePage.id,
                    name: futurePageNames[i],
                    order: currentOrder
                });
            }
            currentOrder++;
        });

        try {
            // Update the existing pages names and orders
            let response = await window.electron.updatePages(modifiedPageContainers, false);
            if (!response.success) {
                throw response.error;
            }

            // Create the new pages
            response = await window.electron.createPages(newPageContainers);
            // If this fails, we need to revert the changes to the existing pages
            if (!response.success) {
                // Revert the changes to the existing pages
                modifiedPageContainers.forEach((page) => {
                    const existingPage = existingPages.find((existingPage) => existingPage.id === page.id)!;
                    page.name = existingPage.name;
                    page.order = existingPage.order;
                });
                await window.electron.updatePages(modifiedPageContainers, false);
                throw response.error;
            }

            // fetch the pages to update the store
            this.checkForFetchPages();
            this.fetchPages();

            return { ...response, newPages: newPageContainers };
        } catch (error: any) {
            console.error("Error creating pages: ", error);
            return { success: false, error: error || new Error("Error creating pages") };
        }
    }

    /**
     * Update one or many pages with the provided arguments.
     *
     * @param modifiedPagesArg - The objects to update the pages with.
     * @param currentPages - The current list of pages. Must be provided to check for the order of the pages.
     * @returns DatabaseResponse: { success: boolean; errorMessage?: string;}
     */
    static async updatePages(modifiedPagesArg: ModifiedPageArgs[]) {
        const modifiedPagesToSend: ModifiedPageContainer[] = modifiedPagesArg.map((page) => {
            return {
                id: page.id,
                counts: page.counts,
                tempo: page.tempo,
                time_signature: page.time_signature ? page.time_signature.toString() : undefined,
                rehearsal_mark: page.rehearsal_mark,
                notes: page.notes
            };
        });
        const response = await window.electron.updatePages(modifiedPagesToSend);
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
     * Retrieves the next Page based on this Page and the list of all Pages.
     * If the current Page is the last Page, null is returned.
     *
     * @param allPages - The list of all Pages.
     * @returns The next Page or null if the current Page is the last Page.
     * @throws If the current Page is not found in the list of all Pages.
     */
    getNextPage(allPages: Page[]): Page | null {
        if (!allPages || allPages.length === 0)
            return null;

        const higherOrderPages = allPages.filter((page) => page.order > this.order);
        if (higherOrderPages.length === 0)
            return null; // the current page is the last page

        // find the nearest page with an order greater than the current page
        const sortedHigherOrderPages = Page.sortPagesByOrder(higherOrderPages);
        const nextPage = sortedHigherOrderPages.reduce((nearestNextPage, current) => {
            if (current.order > this.order && (nearestNextPage === null || current.order < nearestNextPage.order)) {
                return current;
            }
            return nearestNextPage;
        });

        return nextPage !== this ? nextPage : null;
    }

    /**
     * Retrieves the previous Page based on this Page and the list of all Pages.
     * If the current Page is the first Page, null is returned.
     *
     * @param allPages - The list of all Pages. Must be provided as the class doesn't have access to the store.
     * @returns The previous Page or null if the current Page is the first Page.
     * @throws If the current Page is not found in the list of all Pages.
     */
    getPreviousPage(allPages: Page[]): Page | null {
        if (!allPages || allPages.length === 0)
            return null;

        const lowerOrderPages = allPages.filter((page) => page.order < this.order);
        if (lowerOrderPages.length === 0)
            return null; // the current page is the first page

        // find the nearest page with an order greater than the current page
        const sortedLowerOrderPages = Page.sortPagesByOrder(lowerOrderPages).reverse();
        const previousPage = sortedLowerOrderPages.reduce((nearestPreviousPage, current) => {
            if (current.order < this.order && (nearestPreviousPage === null || current.order > nearestPreviousPage.order)) {
                return current;
            }
            return nearestPreviousPage;
        });

        return previousPage !== this ? previousPage : null;
    }

    /**
     * Retrieves the first Page based on the list of all Pages.
     *
     * @param allPages - The list of all Pages.
     * @returns The first Page or null if there are no Pages.
     */
    static getFirstPage(allPages: Page[]): Page | null {
        if (!allPages || allPages.length === 0)
            return null;

        const firstPage = allPages.reduce((nearestFirstPage, current) => {
            if (nearestFirstPage === null || current.order < nearestFirstPage.order) {
                return current;
            }
            return nearestFirstPage;
        });

        return firstPage;
    }

    /**
     * Retrieves the last Page based on the list of all Pages.
     *
     * @param allPages - The list of all Pages.
     * @returns The last Page or null if there are no Pages.
     */
    static getLastPage(allPages: Page[]): Page | null {
        if (!allPages || allPages.length === 0)
            return null;

        const lastPage = allPages.reduce((nearestLastPage, current) => {
            if (nearestLastPage === null || current.order > nearestLastPage.order) {
                return current;
            }
            return nearestLastPage;
        });

        return lastPage;
    }

    /**
     * Creates a list of page names based on the list of booleans that pages are subsets or not.
     *
     * E.g. [False, False, True, False, True, True, False] => ["1", "2", "2A", "3", "3A", "3B", "4"]
     *
     * NOTE - the first page will always evaluate to false no matter what is provided.
     *
     * @param pages boolean[] - A list to define if pages are subsets are not. Should align with the order of the pages.
     * @returns A list of page names in the order that the list of booleans was provided.
     */
    private static generatePageNames(isSubsetArr: boolean[]) {
        const pageNames: string[] = ['1'];
        let curPageNumber = 1;
        let curSubsetLetter = "";

        // Loop through the pages and create the page names
        // 1, 2, 2A, 3, 3A, 3B, 4, etc.
        for (let i = 1; i < isSubsetArr.length; i++) {
            const pageName = Page.getNextPageName(
                {
                    pageNumber: curPageNumber,
                    subsetString: isSubsetArr[i] ? curSubsetLetter : null,
                    incrementSubset: isSubsetArr[i]
                }
            );
            pageNames.push(pageName);
            if (isSubsetArr[i]) {
                curSubsetLetter = incrementLetters(curSubsetLetter);
            }
            else {
                curPageNumber++;
                curSubsetLetter = "";
            }
        }

        return pageNames;
    }

    /**
     * Get the next page name based on the current page name.
     *
     * @param pageNumber The number of the current page.
     * @param subsetString The subset letter of the current page. If null, the page is not a subset.
     * @param incrementSubset Whether it is the number or the subset letter that should be incremented.
     *      Default is false, which increments the number. If true, increments the subset letter and not the number.
     * @returns
     */
    private static getNextPageName({ pageNumber, subsetString, incrementSubset = false }:
        { pageNumber: number, subsetString: string | null, incrementSubset?: boolean; }) {

        let newPageNumber = pageNumber;
        let newSubsetString = subsetString || "";

        if (incrementSubset) {
            // If there is no subset, start with "A"
            if (!subsetString || subsetString === "")
                newSubsetString = "A";
            // Otherwise, increment the subset letter
            else
                newSubsetString = incrementLetters(subsetString);
        } else {
            newPageNumber = pageNumber + 1;
            newSubsetString = ""
        }

        return newPageNumber + newSubsetString;
    }

    /**
     * Splits a page name into its number and subset letter.
     *
     * @param pageName The name of the current page to split.
     * @returns - { number: number, subset: string | null}
     */
    private splitPageName(): { number: number, subset: string | null } {
        const match = this.name.match(/^(\d+)([A-Za-z]*)$/);
        if (match) {
            const subsetLetter = match[2].length > 0 ? match[2] : null;
            return { number: parseInt(match[1], 10), subset: subsetLetter };
        } else
            throw new Error("Invalid page name: " + this.name);
    }
}

/**
 * The arguments needed to create a new page.
 */
export interface NewPageArgs {
    /**
     * Provide this to determine the order of the page and the name.
     * If not provided, the page will be created at the end of the show.
     *
     * If you want to add multiple pages that are sequential to each other, provide the page of the initial
     * page in the sequence and make every following page also have that page as the previous page.
     */
    previousPage?: Page;
    /** If a page is a subset, its name will have an alphabetical letter appended. */
    isSubset: boolean;
    counts: number;
    tempo: number;
    time_signature: TimeSignature;
    rehearsal_mark?: string;
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
    /** If a page is a subset, its name will have an alphabetical letter appended. */
    isSubset?: boolean;
    counts?: number;
    tempo?: number;
    time_signature?: TimeSignature;
    rehearsal_mark?: string;
    notes?: string;
}

/**
 * This SHOULD NOT be used outside of the Page class or database functions.
 * The object that is sent to the database to create a new page.
 */
export interface NewPageContainer {
    name: string;
    counts: number;
    order: number;
    tempo: number;
    time_signature: string;
    rehearsal_mark?: string;
    notes?: string;
}


/**
 * This SHOULD NOT be used outside of the Page class or database functions.
 * The object that is sent to the database to modify a page.
 */
export interface ModifiedPageContainer {
    /** ID of the page to update */
    id: number;
    name?: string;
    counts?: number;
    order?: number;
    tempo?: number;
    rehearsal_mark?: string;
    time_signature?: string;
    notes?: string;
}

/**
 * Increments a letter to the next letter in the alphabet.
 *
 * @param letters The letters to increment.
 * @returns A -> B, B -> C, ..., Z -> AA, AA -> AB, etc. Letters are always capitalized.
 */
function incrementLetters(letters: string) {
    let result = [];
    let carry = true; // Start with the assumption that we need to increment the last character

    const capitalizedLetters = letters.toUpperCase();

    // Traverse from last to first character to handle the carry
    for (let i = capitalizedLetters.length - 1; i >= 0; i--) {
        let char = capitalizedLetters[i];
        if (carry) {
            if (char === 'Z') {
                result.push('A');
            } else {
                result.push(String.fromCharCode(char.charCodeAt(0) + 1));
                carry = false; // No carry needed if we haven't wrapped from 'Z' to 'A'
            }
        } else {
            result.push(char); // If no carry, keep current character as is
        }
    }

    // If the string was all 'Z's, we will have carry left over after processing all characters
    if (carry) {
        result.push('A'); // Append 'A' to handle cases like 'ZZ' -> 'AAA'
    }

    // Since we've constructed the result in reverse order, reverse it back and join into a string
    return result.reverse().join('');
}
