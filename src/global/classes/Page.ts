import Measure from "./Measure";
import Beat from "./Beat";
import {
    DatabasePage,
    ModifiedPageArgs,
    NewPageArgs,
} from "electron/database/tables/PageTable";
import { DatabaseResponse } from "electron/database/DatabaseActions";
import { toast } from "sonner";

interface Page {
    /** The id of the page in the database */
    readonly id: number;
    /** The name of the page. E.g. "2A" */
    readonly name: string;
    /** Number of counts to get to this page */
    readonly counts: number;
    /** The notes for the page. E.g. "Intro" */
    readonly notes: string | null;
    /** The order of the page in the show. E.g. 1, 2, 3, etc. */
    readonly order: number;
    /** The ID of the next page in the show. Null if this is the last page. */
    readonly nextPageId: number | null;
    /** The ID of the previous page in the show. Null if this is the first page. */
    readonly previousPageId: number | null;
    /** True if this page is a subset of another page. The only difference is that the name of the page will have an alphabetical letter appended. */
    readonly isSubset: boolean;
    /** The duration of the page in seconds */
    readonly duration: number;
    /** The beats that belong to this page in order */
    readonly beats: Beat[];
    /** The measures that belong to this page in order */
    readonly measures: Measure[] | null;
    /**
     * The beat in the first measure that the page starts on.
     * Remember that music is 1-indexed, meaning the first beat is 1, not 0.
     *
     * E.g. 3 means the page starts on beat 3 of measures[0]
     */
    readonly measureBeatToStartOn: number | null;
    /**
     * Gets the beat number of the last measure that the page goes until.
     * This is calculated by taking the total big beats of all measures, subtracting the start beat offset,
     * and then subtracting the total counts of the page to get the remaining beats.
     *
     * E.g. if the page has 7 counts and has two 4/4 measures, the beat to end on is 4 because it goes to that beat.
     */
    readonly measureBeatToEndOn: number | null;
    /** Where the start of this page is in the music in seconds */
    readonly timestamp: number;
}
export default Page;

/**
 * Creates one or more new pages in the database and updates the store.
 *
 * @param newPagesArg - The new pages to be created in order of how they should be created.
 * @param fetchPagesFunction - The function to call to fetch the pages from the database. This function updates the store.
 * @returns DatabaseResponse with the new pages.
 */
export async function createPages(
    newPagesArgs: NewPageArgs[],
    fetchPagesFunction: () => Promise<void>,
): Promise<DatabaseResponse<DatabasePage[]>> {
    const createResponse = await window.electron.createPages(newPagesArgs);

    if (createResponse.success) fetchPagesFunction();
    return createResponse;
}

/**
 * Update one or many pages with the provided arguments.
 *
 * @param modifiedPagesArg - The objects to update the pages with.
 * @returns DatabaseResponse: { success: boolean; errorMessage?: string;}
 */
export async function updatePages(
    modifiedPagesArg: ModifiedPageArgs[],
    fetchPagesFunction: () => Promise<void>,
) {
    const response = await window.electron.updatePages(modifiedPagesArg);
    // fetch the pages to update the store
    if (response.success) fetchPagesFunction();
    return response;
}

/**
 * Deletes pages from the database.
 * CAUTION - this will delete all of the pagePages associated with the page.
 *
 * @param pageIds - The ids of the pages to delete.
 * @returns Response data from the server.
 */
export async function deletePages(
    pageIds: Set<number>,
    fetchPagesFunction: () => Promise<void>,
) {
    const deleteResponse = await window.electron.deletePages(pageIds);
    // fetch the pages to update the store
    if (deleteResponse.success) fetchPagesFunction();
    return deleteResponse;
}

/**
 * Sorts the pages by order.
 * @param pages - The list of pages to sort.
 * @returns The list of pages sorted by order.
 */
export const sortPagesByOrder = (pages: Page[]) => {
    return pages.sort((a, b) => a.order - b.order);
};

/**
 * Retrieves the first Page based on the list of all Pages.
 *
 * @param allPages - The list of all Pages.
 * @returns The first Page or null if there are no Pages.
 */
export const getFirstPage = (allPages: Page[]): Page => {
    return allPages.reduce((nearestFirstPage, current) => {
        if (
            nearestFirstPage === null ||
            current.order < nearestFirstPage.order
        ) {
            return current;
        }
        return nearestFirstPage;
    });
};

/**
 * Retrieves the last Page based on the list of all Pages.
 *
 * @param allPages - The list of all Pages.
 * @returns The last Page or null if there are no Pages.
 */
export const getLastPage = (allPages: Page[]): Page => {
    return allPages.reduce((nearestLastPage, current) => {
        if (nearestLastPage === null || current.order > nearestLastPage.order) {
            return current;
        }
        return nearestLastPage;
    });
};

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
export const measureRangeString = (page: Page): string => {
    if (!page.measures || page.measures.length === 0) {
        return "-";
    }
    try {
        const firstMeasure = page.measures[0];
        const lastMeasure = page.measures[page.measures.length - 1];

        // If the page starts on the first measure, just return the measure number. Otherwise, return the measure number and the beat.
        const firstMeasureString =
            page.measureBeatToStartOn === 1
                ? firstMeasure.number.toString()
                : `${firstMeasure.number}(${page.measureBeatToStartOn})`;
        const beatToEndOn = page.measureBeatToEndOn;
        const lastMeasureString =
            beatToEndOn === 0
                ? lastMeasure.number.toString()
                : `${lastMeasure.number}(${beatToEndOn})`;

        if (firstMeasureString === lastMeasureString) return firstMeasureString;
        return `${firstMeasureString} → ${lastMeasureString}`;
    } catch (err) {
        return "N/A";
    }
};

//     /**
//      * Gets the beat number of the last measure that the page goes until.
//      * This is calculated by taking the total big beats of all measures, subtracting the start beat offset,
//      * and then subtracting the total counts of the page to get the remaining beats.
//      *
//      * E.g. if the page has 7 counts and has two 4/4 measures, the beat to end on is 4 because
//      *
//      * @returns The beat number of the last measure that the page goes until.
//      */
//     public get measureBeatToEndOn() {
//         const totalMeasureBigBeats = this.measures.reduce(
//             (total, measure) => total + measure.getBigBeats(),
//             0,
//         );
//         const missingBeats =
//             totalMeasureBigBeats -
//             this.counts -
//             (this.measureBeatToStartOn - 1);
//         if (missingBeats === 0) return 0;

//         const lastMeasure = this.measures[this.measures.length - 1];
//         return lastMeasure.getBigBeats() - missingBeats;
//     }

//     /**
//      * Retrieves the next Page based on this Page and the list of all Pages.
//      * If the current Page is the last Page, null is returned.
//      *
//      * @param allPages - The list of all Pages.
//      * @returns The next Page or null if the current Page is the last Page.
//      * @throws If the current Page is not found in the list of all Pages.
//      */
//     getNextPage(allPages: Page[]): Page | null {
//         if (!allPages || allPages.length === 0 || !this.nextPageId === null)
//             return null;

//         const pagesMap = new Map<number, Page>(
//             allPages.map((page) => [page.id, page]),
//         );
//         if (!pagesMap.has(this.id)) {
//             throw new Error(
//                 `Current page "id=${this.id}" not found in list of all pages.`,
//             );
//         }

//         // There is no next page
//         if (this.nextPageId === null) return null;

//         const nextPage = pagesMap.get(this.nextPageId);
//         if (!nextPage) {
//             throw new Error(
//                 `Next page "id=${this.nextPageId}" not found in list of all pages.`,
//             );
//         }
//         return nextPage;
//     }

/**
 * Splits a page name into its number and subset letter.
 *
 * @param pageName The name of the current page to split.
 * @returns - { number: number, subset: string | null}
 */
export const splitName = (
    page: Page,
): { number: number; subset: string | null } => {
    const match = page.name.match(/^(\d+)([A-Za-z]*)$/);
    if (match) {
        const subsetLetter = match[2].length > 0 ? match[2] : null;
        return { number: parseInt(match[1], 10), subset: subsetLetter };
    } else throw new Error("Invalid page name: " + page.name);
};

// Page Generation
/** A type that stores a beat with the index that it occurs in a list with all beats */
type BeatWithIndex = Beat & { index: number };

/**
 * Converts the pages from the database (which are stored as a linked list) to Page objects.
 *
 * @param databasePages The pages from the database
 * @returns A list of Page objects
 */
export function fromDatabasePages({
    databasePages,
    allMeasures,
    allBeats,
}: {
    databasePages: DatabasePage[];
    allMeasures: Measure[];
    allBeats: Beat[];
}): Page[] {
    if (databasePages.length === 0) return [];
    const sortedBeats = allBeats.sort((a, b) => a.position - b.position);
    const beatMap = new Map<number, BeatWithIndex>(
        sortedBeats.map((beat, i) => [beat.id, { ...beat, index: i }]),
    );
    const sortedDbPages = databasePages.sort((a, b) => {
        const aBeat = beatMap.get(a.start_beat);
        const bBeat = beatMap.get(b.start_beat);
        if (!aBeat || !bBeat) {
            console.log("aBeat", a.start_beat, aBeat);
            console.log("bBeat", b.start_beat, bBeat);
            throw new Error(
                `Beat not found: ${a.start_beat} ${aBeat} - ${b.start_beat} ${bBeat}`,
            );
        }
        return aBeat.position - bBeat.position;
    });
    const isSubsetArr = sortedDbPages.map((page) => page.is_subset);
    const pageNames = generatePageNames(isSubsetArr);
    const sortedMeasures = allMeasures.sort((a, b) => a.number - b.number);

    let curTimestamp = 0;
    const createdPages: Page[] = sortedDbPages.map((dbPage, i) => {
        // Get the beats that belong to this page
        const startBeat = beatMap.get(dbPage.start_beat);
        if (!startBeat) {
            throw new Error(`Start beat not found: ${dbPage.start_beat}`);
        }
        const nextPage = sortedDbPages[i + 1] || null;
        const nextPageBeat = nextPage ? beatMap.get(nextPage.start_beat) : null;
        if (!nextPageBeat && nextPage) {
            throw new Error(`Next beat not found: ${nextPage.start_beat}`);
        }
        const beats = nextPage
            ? sortedBeats.slice(startBeat.index, nextPageBeat!.index)
            : sortedBeats.slice(startBeat.index);
        const lastBeat = beats[beats.length - 1];
        const beatIdSet = new Set(beats.map((beat) => beat.id));

        // Get the measures that belong to this page
        const measures = sortedMeasures.filter(
            (measure) =>
                // Check if the start beat of the measure is on or after the start beat of the page
                (measure.startBeat.position >= startBeat.position ||
                    // Check that the start beat is on or before the last beat of the page
                    measure.startBeat.position <= lastBeat.position) &&
                // If both are true, ensure that the beat is actually in the measure
                measure.beats.some((beat) => beatIdSet.has(beat.id)),
        );
        if (measures.length === 0) {
            console.error(`No measures found for page ${dbPage.id}`);
        }
        const duration = beats.reduce((acc, beat) => acc + beat.duration, 0);
        const output = {
            id: dbPage.id,
            name: pageNames[i],
            counts: beats.length,
            notes: dbPage.notes || null,
            order: i,
            isSubset: dbPage.is_subset,
            duration: duration,
            beats,
            measures: measures.length > 0 ? measures : null,
            measureBeatToStartOn:
                measures.length > 0
                    ? measures[0].beats.findIndex(
                          (beat) => beat.id === startBeat.id,
                      ) + 1
                    : null,
            measureBeatToEndOn:
                measures.length > 0
                    ? measures[measures.length - 1].beats.findIndex(
                          (beat) => beat.id === lastBeat.id,
                      ) + 1
                    : null,
            timestamp: curTimestamp,
            previousPageId: sortedDbPages[i - 1]?.id || null,
            nextPageId: nextPage ? nextPage.id : null,
        } satisfies Page;
        curTimestamp += duration;
        return output;
    });

    return createdPages;
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
export const generatePageNames = (isSubsetArr: boolean[]) => {
    const pageNames: string[] = ["0"];
    let curPageNumber = 0;
    let curSubsetLetter = "";

    /**
     * Increments a letter to the next letter in the alphabet.
     *
     * @param letters The letters to increment.
     * @returns A -> B, B -> C, ..., Z -> AA, AA -> AB, etc. Letters are always capitalized.
     */
    const incrementLetters = (letters: string) => {
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
    };

    /**
     * Get the next page name based on the current page name.
     *
     * @param pageNumber The number of the current page.
     * @param subsetString The subset letter of the current page. If null, the page is not a subset.
     * @param incrementSubset Whether it is the number or the subset letter that should be incremented.
     *      Default is false, which increments the number. If true, increments the subset letter and not the number.
     * @returns
     */
    const getNextPageName = ({
        pageNumber,
        subsetString,
        incrementSubset = false,
    }: {
        pageNumber: number;
        subsetString: string | null;
        incrementSubset?: boolean;
    }) => {
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
    };

    // Loop through the pages and create the page names
    // 1, 2, 2A, 3, 3A, 3B, 4, etc.
    for (let i = 1; i < isSubsetArr.length; i++) {
        const pageName = getNextPageName({
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
};

/**
 * Finds the next page in a sequence of pages based on the current page's nextPageId.
 *
 * @param currentPage The current page from which to find the next page.
 * @param allPages An array of all available pages to search through.
 * @returns The next page if found, or null if no next page exists.
 */
export const getNextPage = (
    currentPage: Page,
    allPages: Page[],
): Page | null => {
    const nextPage = allPages.find(
        (page) => page.id === currentPage.nextPageId,
    );
    if (!nextPage) {
        toast.info("No next page");
        return null;
    }
    return nextPage;
};

/**
 * Finds the previous page in a sequence of pages based on the current page's previousPageId.
 *
 * @param currentPage The current page from which to find the previous page.
 * @param allPages An array of all available pages to search through.
 * @returns The previous page if found, or null if no previous page exists.
 */
export const getPreviousPage = (
    currentPage: Page,
    allPages: Page[],
): Page | null => {
    const prevPage = allPages.find(
        (page) => page.id === currentPage.previousPageId,
    );
    if (!prevPage) {
        toast.info("No previous page");
        return null;
    }
    return prevPage;
};
