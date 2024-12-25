import { DatabasePage } from "electron/database/tables/PageTable";
import Measure from "./Measure";
import { DatabaseResponse } from "electron/database/DatabaseActions";

/**
 * A class that represents a Page in the database.
 * This is the standard Page object that should be used throughout the application.
 *
 * Note: this class has no/should not have instance methods. All methods are static.
 */
class Page {
    /********** Database Attributes **********/
    // These are the Attributes that are stored in the database and are not editable by the user.

    /** The id of the page in the database */
    readonly id: number;
    /** The name of the page. E.g. "2A" */
    private _name: string;
    /** Number of counts to get to this page */
    readonly counts: number;
    /** The order of the page in the show. E.g. 1, 2, 3, etc. */
    readonly order: number;
    /** NOT IMPLEMENTED - Any notes about the page. Optional */
    readonly notes?: string;
    /** The id of the next page in the show. Null if this is the last page. */
    readonly nextPageId: number | null;
    /** The id of the previous page in the show. Null if this is the first page. */
    readonly previousPageId: number | null;
    /** If a page is a subset, its name will have an alphabetical letter appended. */
    readonly isSubset: boolean = false;

    /********** Runtime Attributes **********/
    // These are Attributes that are calculated at runtime and are not stored in the database.

    /** Duration of the page in seconds */
    private _duration: number = 5;
    /** Measures in the page */
    private _measures: Measure[] = [];
    /**
     * The beat in the first measure that the page starts on.
     * Remember that music is 1-indexed, meaning the first beat is 1, not 0.
     *
     * E.g. 3 means the page starts on beat 3 of measures[0]
     */
    private _measureBeatToStartOn: number = 1;
    /** Whether or not the Page object has been aligned with the measures */
    private _hasBeenAligned: boolean = false;
    /** Where the start of this page is in the music */
    private _timestamp: number = 0;

    /**
     * Fetches all of the pages from the database.
     * This is attached to the Page store and needs to be updated in a useEffect hook so that the UI is updated.
     */
    static fetchPages: () => Promise<void>;

    constructor({
        id,
        name,
        counts,
        order,
        notes,
        nextPageId,
        previousPageId,
        isSubset = false,
    }: {
        id: number;
        name: string;
        counts: number;
        order: number;
        notes?: string;
        nextPageId: number | null;
        previousPageId: number | null;
        isSubset?: boolean;
    }) {
        this.id = id;
        this._name = name;

        if (counts < 0) this.counts = 1;
        else this.counts = counts;

        this.order = order;

        this.notes = notes;

        this.nextPageId = nextPageId;
        this.previousPageId = previousPageId;

        this.isSubset = isSubset;
    }

    /**
     * Generates a string representation of the measure range for the page.
     * If the page starts on the first beat, the measure number is returned.
     * Otherwise, the measure number and the starting beat are returned.
     * The last measure number and ending beat are also included in the string if the page ends in the middle of a measure.
     *
     * E.g. "1 - 2" means the page starts on the first beat of m1 and goes through m2 to the start of m3.
     *
     * E.g. "1(2) - 3(4)" means the page starts on the second beat of m1 and goes up to the fourth beat of m3.
     *
     * @returns A string representing the measure range for the page.
     */
    measureRangeString() {
        try {
            const firstMeasure = this.measures[0];
            const lastMeasure = this.measures[this.measures.length - 1];

            // If the page starts on the first measure, just return the measure number. Otherwise, return the measure number and the beat.
            const firstMeasureString =
                this.measureBeatToStartOn === 1
                    ? firstMeasure.number.toString()
                    : `${firstMeasure.number}(${this.measureBeatToStartOn})`;
            const beatToEndOn = this.measureBeatToEndOn;
            const lastMeasureString =
                beatToEndOn === 0
                    ? lastMeasure.number.toString()
                    : `${lastMeasure.number}(${beatToEndOn})`;

            if (firstMeasureString === lastMeasureString)
                return firstMeasureString;
            return `${firstMeasureString} → ${lastMeasureString}`;
        } catch (err) {
            console.error("Unable to get measure range string", err);
            return "N/A";
        }
    }

    /**************** Getters and Setters ****************/

    /** Duration of the page in seconds */
    public get duration() {
        return this._duration;
    }

    /** Measures in the page */
    public get measures() {
        return this._measures;
    }

    /**
     * An offset that defines how many beats into the measure the page starts.
     *
     * E.g. if this is 1 then we start on the first beat of the measure. If this is 2, then we start on the second beat of the measure.
     */
    public get measureBeatToStartOn() {
        return this._measureBeatToStartOn;
    }

    /**
     * Gets the beat number of the last measure that the page goes until.
     * This is calculated by taking the total big beats of all measures, subtracting the start beat offset,
     * and then subtracting the total counts of the page to get the remaining beats.
     *
     * E.g. if the page has 7 counts and has two 4/4 measures, the beat to end on is 4 because
     *
     * @returns The beat number of the last measure that the page goes until.
     */
    public get measureBeatToEndOn() {
        const totalMeasureBigBeats = this.measures.reduce(
            (total, measure) => total + measure.getBigBeats(),
            0,
        );
        const missingBeats =
            totalMeasureBigBeats -
            this.counts -
            (this.measureBeatToStartOn - 1);
        if (missingBeats === 0) return 0;

        const lastMeasure = this.measures[this.measures.length - 1];
        return lastMeasure.getBigBeats() - missingBeats;
    }

    /** Whether or not the Page object has been aligned with the measures */
    public get hasBeenAligned() {
        return this._hasBeenAligned;
    }

    /** Where the start of this page is in the music */
    public get timestamp() {
        return this._timestamp;
    }

    /** The name of the page. E.g. "2A" */
    public get name() {
        return this._name;
    }

    private set name(name: string) {
        this._name = name;
    }

    /**************** Public Static Methods ****************/
    /**
     * Converts the pages from the database (which are stored as a linked list) to Page objects.
     *
     * @param databasePages The pages from the database
     * @returns A list of Page objects
     */
    static fromDatabasePages(databasePages: DatabasePage[]): Page[] {
        if (databasePages.length === 0) return [];
        let createdPages: Page[] = [];
        // Find the first page
        const nextPageIds = new Set(
            databasePages.map((page) => page.next_page_id),
        );
        const firstPage = databasePages.find(
            (page) => !nextPageIds.has(page.id),
        );
        if (!firstPage) {
            throw new Error(
                "Failed to find first page! The linked list is broken.",
            );
        }

        // Loop through the pages and create the Page objects, updating order and the previous page id
        const databasePageMap = new Map<number, DatabasePage>(
            databasePages.map((page) => [page.id, page]),
        );
        let currentPage: DatabasePage | undefined = firstPage;
        let currentPreviousPageId = null;
        let orderTracker = 0;
        while (currentPage) {
            createdPages.push(
                new Page({
                    id: currentPage.id,
                    name: "NOT YET",
                    counts: currentPage.counts,
                    order: orderTracker++,
                    notes: currentPage.notes || undefined,
                    nextPageId: currentPage.next_page_id,
                    previousPageId: currentPreviousPageId,
                    isSubset: currentPage.is_subset,
                }),
            );

            if (currentPage.next_page_id === null) break;
            else {
                currentPreviousPageId = currentPage.id;
                currentPage = databasePageMap.get(currentPage.next_page_id);
            }
        }

        // Add the names to the pages
        createdPages.sort((a, b) => a.order - b.order);
        const isSubsetArr = createdPages.map((page) => page.isSubset);
        const pageNames = Page.generatePageNames(isSubsetArr);
        createdPages.forEach((page, i) => {
            page.name = pageNames[i];
        });

        return createdPages;
    }

    /**
     * Fetches all of the pages from the database.
     * This should not be called outside of the page store - as the current pages are stored already in the store
     * and the fetchPages function is attached to the store and updates the UI.
     * @returns a list of all pages
     */
    static async getPages(): Promise<Page[]> {
        const response = await window.electron.getPages();
        return this.fromDatabasePages(response.data);
    }

    /**
     * Creates one or more new pages in the database and updates the store.
     *
     * @param newPagesArg - The new pages to be created in order of how they should be created.
     * @returns DatabaseResponse with the new pages.
     */
    static async createPages(
        newPagesArgs: NewPageArgs[],
    ): Promise<DatabaseResponse<Page[]>> {
        const createResponse = await window.electron.createPages(newPagesArgs);

        if (createResponse.success) {
            const updatedPageIds = new Set(
                createResponse.data.map((p) => p.id),
            );

            // fetch the pages to update the store
            this.checkForFetchPages();
            this.fetchPages();

            const allPages = await this.getPages();
            const updatedPages = allPages.filter((p) =>
                updatedPageIds.has(p.id),
            );
            return {
                ...createResponse,
                data: updatedPages,
            };
        } else {
            return { ...createResponse, data: [] };
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
        const modifiedPagesToSend: ModifiedPageArgs[] = modifiedPagesArg.map(
            (page) => {
                const modifiedPage: ModifiedPageArgs = { id: page.id };
                if (page.counts) modifiedPage.counts = page.counts;
                if (page.notes) modifiedPage.notes = page.notes;

                return modifiedPage;
            },
        );
        const response = await window.electron.updatePages(modifiedPagesToSend);
        // fetch the pages to update the store
        this.checkForFetchPages();
        this.fetchPages();
        return response;
    }

    /**
     * Deletes pages from the database.
     * CAUTION - this will delete all of the pagePages associated with the page.
     *
     * @param pageIds - The ids of the pages to delete.
     * @returns Response data from the server.
     */
    static async deletePages(pageIds: Set<number>) {
        const deleteResponse = await window.electron.deletePages(pageIds);
        // fetch the pages to update the store
        this.checkForFetchPages();
        this.fetchPages();
        return deleteResponse;
    }

    /**
     * Checks if fetchPages is defined. If not, it logs an error to the console.
     */
    static checkForFetchPages() {
        if (!this.fetchPages)
            console.error(
                "fetchPages is not defined. The UI will not update properly.",
            );
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
     * Retrieves the first Page based on the list of all Pages.
     *
     * @param allPages - The list of all Pages.
     * @returns The first Page or null if there are no Pages.
     */
    static getFirstPage(allPages: Page[]): Page | null {
        if (!allPages || allPages.length === 0) return null;

        const firstPage = allPages.reduce((nearestFirstPage, current) => {
            if (
                nearestFirstPage === null ||
                current.order < nearestFirstPage.order
            ) {
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
        if (!allPages || allPages.length === 0) return null;

        const lastPage = allPages.reduce((nearestLastPage, current) => {
            if (
                nearestLastPage === null ||
                current.order > nearestLastPage.order
            ) {
                return current;
            }
            return nearestLastPage;
        });

        return lastPage;
    }

    /**
     * Using a list of Measures, all pages are given a duration based on their counts and the measures they align to.
     *
     * @param pages - List of all pages
     * @param measures - List of all measures
     * @returns The list of pages with their durations set and the measures inserted.
     */
    static alignWithMeasures(pages: Page[], measures: Measure[]): Page[] {
        const outputPages = [...pages];
        let currentMeasureIndex = 0;
        let currentMeasureBeat = 1;
        let currentTimestamp = 0;

        for (
            let currentPageIndex = 0;
            currentPageIndex < outputPages.length;
            currentPageIndex++
        ) {
            if (currentMeasureIndex >= measures.length) {
                console.log("Not enough measures to align with pages.");
                break;
            }
            let remainingCounts = outputPages[currentPageIndex].counts;

            outputPages[currentPageIndex]._hasBeenAligned = true;
            outputPages[currentPageIndex]._measures = [];
            outputPages[currentPageIndex]._duration = 0;
            outputPages[currentPageIndex]._measureBeatToStartOn =
                currentMeasureBeat;

            // Loop through the measures until the page is filled, or there are no more measures
            while (remainingCounts > 0) {
                if (currentMeasureIndex >= measures.length) {
                    break;
                }

                const currentMeasure = measures[currentMeasureIndex];

                outputPages[currentPageIndex]._measures.push(currentMeasure);
                // Add the offset of the current measure beat
                const offsetBigBeats =
                    currentMeasure.getBigBeats() - currentMeasureBeat + 1;
                if (remainingCounts - offsetBigBeats >= 0) {
                    // there are enough remaining counts in the page to complete the measure
                    if (currentMeasureIndex === measures.length - 1) {
                        // last measure
                        const durationPerBeat =
                            currentMeasure.duration /
                            currentMeasure.getBigBeats();
                        outputPages[currentPageIndex]._duration +=
                            durationPerBeat * remainingCounts;
                        break;
                    } else {
                        // not the last measure, fill the page with beats from the measures
                        outputPages[currentPageIndex]._duration +=
                            (offsetBigBeats / currentMeasure.getBigBeats()) *
                            currentMeasure.duration;
                        currentMeasureIndex++;
                        currentMeasureBeat = 1;
                    }
                } else {
                    // there are not enough counts in the page to complete the measure. Add the remaining counts to the duration
                    outputPages[currentPageIndex]._duration +=
                        (remainingCounts / currentMeasure.getBigBeats()) *
                        currentMeasure.duration;
                    currentMeasureBeat = remainingCounts + 1;
                    break;
                }

                remainingCounts -= offsetBigBeats;
            }

            currentTimestamp += outputPages[currentPageIndex]._duration;
            outputPages[currentPageIndex]._timestamp = currentTimestamp;
        }

        return outputPages;
    }

    /**************** Public Instance Methods ****************/

    /**
     * Retrieves the next Page based on this Page and the list of all Pages.
     * If the current Page is the last Page, null is returned.
     *
     * @param allPages - The list of all Pages.
     * @returns The next Page or null if the current Page is the last Page.
     * @throws If the current Page is not found in the list of all Pages.
     */
    getNextPage(allPages: Page[]): Page | null {
        if (!allPages || allPages.length === 0 || !this.nextPageId === null)
            return null;

        const pagesMap = new Map<number, Page>(
            allPages.map((page) => [page.id, page]),
        );
        if (!pagesMap.has(this.id)) {
            throw new Error(
                `Current page "id=${this.id}" not found in list of all pages.`,
            );
        }

        // There is no next page
        if (this.nextPageId === null) return null;

        const nextPage = pagesMap.get(this.nextPageId);
        if (!nextPage) {
            throw new Error(
                `Next page "id=${this.nextPageId}" not found in list of all pages.`,
            );
        }
        return nextPage;
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
        if (!allPages || allPages.length === 0 || this.previousPageId === null)
            return null;

        const pagesMap = new Map<number, Page>(
            allPages.map((page) => [page.id, page]),
        );
        if (!pagesMap.has(this.id)) {
            throw new Error(
                `Current page "id=${this.id}" not found in list of all pages.`,
            );
        }

        // There is no previous page
        if (this.previousPageId === null) return null;

        const previousPage = pagesMap.get(this.previousPageId);
        if (!previousPage) {
            throw new Error(
                `Previous page "id=${this.previousPageId}" not found in list of all pages.`,
            );
        }
        return previousPage;
    }

    /**************** Private Static Methods ****************/
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
        const pageNames: string[] = ["1"];
        let curPageNumber = 1;
        let curSubsetLetter = "";

        // Loop through the pages and create the page names
        // 1, 2, 2A, 3, 3A, 3B, 4, etc.
        for (let i = 1; i < isSubsetArr.length; i++) {
            const pageName = Page.getNextPageName({
                pageNumber: curPageNumber,
                subsetString: isSubsetArr[i] ? curSubsetLetter : null,
                incrementSubset: isSubsetArr[i],
            });
            pageNames.push(pageName);
            if (isSubsetArr[i]) {
                curSubsetLetter = incrementLetters(curSubsetLetter);
            } else {
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
    private static getNextPageName({
        pageNumber,
        subsetString,
        incrementSubset = false,
    }: {
        pageNumber: number;
        subsetString: string | null;
        incrementSubset?: boolean;
    }) {
        let newPageNumber = pageNumber;
        let newSubsetString = subsetString || "";

        if (incrementSubset) {
            // If there is no subset, start with "A"
            if (!subsetString || subsetString === "") newSubsetString = "A";
            // Otherwise, increment the subset letter
            else newSubsetString = incrementLetters(subsetString);
        } else {
            newPageNumber = pageNumber + 1;
            newSubsetString = "";
        }

        return newPageNumber + newSubsetString;
    }

    /**************** Private Instance Methods ****************/

    /**
     * Splits a page name into its number and subset letter.
     *
     * @param pageName The name of the current page to split.
     * @returns - { number: number, subset: string | null}
     */
    private W(): { number: number; subset: string | null } {
        const match = this.name.match(/^(\d+)([A-Za-z]*)$/);
        if (match) {
            const subsetLetter = match[2].length > 0 ? match[2] : null;
            return { number: parseInt(match[1], 10), subset: subsetLetter };
        } else throw new Error("Invalid page name: " + this.name);
    }
}

export default Page;

/**
 * The arguments needed to create a new page.
 */
export interface NewPageArgs {
    /**
     * The page the desired new page should come after
     *
     * If you want to add multiple pages that are sequential to each other, provide the page of the initial
     * page in the sequence and make every following page also have that page as the previous page.
     */
    previousPageId: number;
    /** If a page is a subset, its name will have an alphabetical letter appended. */
    isSubset: boolean;
    counts: number;
    notes?: string;
}

/**
 * Defines the editable fields of a page. Only the fields that need to be updated are included.
 */
export interface ModifiedPageArgs {
    /**
     * The id of the page to update.
     */
    id: number;
    /** If a page is a subset, its name will have an alphabetical letter appended. */
    is_subset?: boolean;
    counts?: number;
    notes?: string | null;
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
            if (char === "Z") {
                result.push("A");
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
        result.push("A"); // Append 'A' to handle cases like 'ZZ' -> 'AAA'
    }

    // Since we've constructed the result in reverse order, reverse it back and join into a string
    return result.reverse().join("");
}
