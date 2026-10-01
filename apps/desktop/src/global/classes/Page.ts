import Measure from "./Measure";
import Beat from "./Beat";
import { toast } from "sonner";
import { conToastError } from "@/utilities/utils";
import { DatabasePage, ModifiedPageArgs, NewPageArgs } from "@/db-functions";
import { ModifyPagesRequest } from "@/hooks/queries/usePages";
import { generatePageNames, getLastPageNumber } from "@openmarch/core";
import { measureRangeString as _measureRangeString } from "./Page.utils";
export const measureRangeString = _measureRangeString;
export { generatePageNames, getLastPageNumber };
interface Page {
    /** The id of the page in the database
     *
     * Note, this ID is not the same as the order of the page in the show.
     * Do not use ID to sort pages. Use order instead.
     */
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
    /** Where the start of this page is in the music in seconds.
     *
     * Note -  to find the timestamp of a marcherPage, you must use the page's timestamp PLUS it's duration.
     * The marcherPage's definition is at the end of the page to conform to existing standards.
     */
    readonly timestamp: number;
}
export default Page;

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

export {
    fromDatabasePages,
    type FromDatabasePagesArgs,
} from "./Page.fromDatabase";

/**
 * Finds the next page in a sequence of pages based on the current page's nextPageId.
 *
 * @param currentPage The current page from which to find the next page.
 * @param allPages An array of all available pages to search through.
 * @returns The next page if found, or null if no next page exists.
 */
// Cooldown timestamps for toast messages
let lastNextPageToastTime = 0;
let lastPrevPageToastTime = 0;
const TOAST_COOLDOWN_MS = 2000; // 2 seconds cooldown

export const getNextPage = (
    currentPage: Page,
    allPages: Page[],
): Page | null => {
    const nextPage = allPages.find(
        (page) => page.id === currentPage.nextPageId,
    );
    if (!nextPage) {
        const now = Date.now();
        if (now - lastNextPageToastTime > TOAST_COOLDOWN_MS) {
            toast.info("No next page");
            lastNextPageToastTime = now;
        }
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
        const now = Date.now();
        if (now - lastPrevPageToastTime > TOAST_COOLDOWN_MS) {
            toast.info("No previous page");
            lastPrevPageToastTime = now;
        }
        return null;
    }
    return prevPage;
};

// Function to update page duration in the database
/**
 * Updates the duration of a page by adjusting its beats and the start beat of the next page.
 *
 * To push or yank all of the subsequent pages, use the yankOrPushPagesAfterIndex function.
 *
 * @param pageToUpdate The page whose duration is being modified
 * @param newCounts The target duration (in counts) for the page
 * @param pages Array of all pages in the project
 * @param beats Array of all beats in the project
 * @returns {Promise<void>} Resolves after updating page duration or handling update failure
 */
export const updatePageCountRequest = ({
    pageToUpdate,
    newCounts,
    pages,
    beats,
}: {
    pages: Page[];
    beats: Beat[];
    pageToUpdate: Page;
    newCounts: number;
}): ModifyPagesRequest => {
    // If there's no next page, we can't adjust the duration
    const nextPage = pages.find((page) => page.id === pageToUpdate.nextPageId);
    let output: ModifyPagesRequest = { modifiedPagesArgs: [] };

    // Calculate how many beats to include in the current page based on the new duration
    let targetBeatIndex = -1;

    // Find the index of the first beat of the current page
    const currentPageStartBeatIndex = beats.findIndex(
        (beat) => beat.id === pageToUpdate.beats[0].id,
    );

    // Calculate how many beats should be included to match the new duration
    for (let i = currentPageStartBeatIndex; i < beats.length; i++) {
        if (
            i - currentPageStartBeatIndex >= newCounts ||
            i === beats.length - 1
        ) {
            targetBeatIndex = i; // The last beat we want to include in the current page
            break;
        }
    }

    // If we couldn't find a suitable beat, don't update
    if (targetBeatIndex === -1 || targetBeatIndex >= beats.length) {
        const message =
            "Failed to update page duration. No suitable beat found.";
        toast.error(message);
        console.error(message);
        return output;
    }

    // Update the next page's start beat
    try {
        // If we have a specific next page ID and duration, we're updating both pages
        // This happens when the user drags a page and we need to update both the current
        // and next page durations
        if (nextPage) {
            const newNextPageStartBeatId = beats[targetBeatIndex].id;

            // Update the next page's start beat
            output = {
                modifiedPagesArgs: [
                    {
                        id: nextPage.id,
                        start_beat: newNextPageStartBeatId,
                    },
                ],
            };

            if (nextPage.nextPageId === null) {
                // The next page is the last page. Update its counts to adjust for the offset created by the drag
                output.lastPageCounts =
                    pageToUpdate.counts - newCounts + nextPage.counts;
            }
        } else {
            // There is no next page. Update the last page's duration
            output = {
                modifiedPagesArgs: [],
                lastPageCounts: targetBeatIndex - currentPageStartBeatIndex + 1,
            };
        }
    } catch (error) {
        toast.error("Failed to update page duration");
        console.error("Failed to update page duration:", error);
    }
    return output;
};

export const areEnoughBeatsForPages = ({
    pages,
    beats,
}: {
    pages: { counts: number }[];
    beats: { id: number }[];
}) => {
    const totalCounts = pages.reduce((acc, page) => acc + page.counts, 0);
    const totalBeats = beats.length;
    return totalCounts <= totalBeats;
};

/**
 * Pushes or yanks all of the subsequent pages after the given index.
 * Useful for updating counts of one page and having the subsequent pages update accordingly.
 *
 * @param allPages - The list of all pages in the project
 * @param allBeats - The list of all beats in the project
 * @param index - The index of the page to push or yank after
 * @param offset - The number of beats to push or yank
 * @returns The modified pages args
 */
export const yankOrPushPagesAfterIndex = ({
    allPages,
    allBeats,
    index,
    offset,
}: {
    allPages: Pick<Page, "id" | "beats" | "counts">[];
    allBeats: Pick<Beat, "id" | "index">[];
    index: number;
    offset: number;
}): ModifiedPageArgs[] | undefined => {
    if (index < 0 || index >= allPages.length) {
        throw new Error("Index out of bounds");
    }

    const pageAtIndex = allPages[index];

    if (pageAtIndex.counts + offset < 0) {
        conToastError("Cannot yank pages that would result in negative counts");
        return;
    }
    if (!areEnoughBeatsForPages({ pages: allPages, beats: allBeats })) {
        conToastError("Cannot push pages further than the end of the show");
        return;
    }

    const pagesToYankOrPush = allPages.slice(index + 1);
    const modifiedPagesArgs: ModifiedPageArgs[] = [];

    // validate that all pages have at least one beat
    for (const page of pagesToYankOrPush) {
        if (page.beats.length === 0) {
            conToastError("Cannot yank pages that have no beats", page);
            return;
        }
    }

    for (const page of pagesToYankOrPush) {
        const pageStartBeat = page.beats[0];
        const newBeatIndex = pageStartBeat.index + offset;

        if (newBeatIndex < 0 || newBeatIndex >= allBeats.length) {
            conToastError("Beat yank would result in out of bounds beats", {
                allBeatsLength: allBeats.length,
                newBeatIndex,
                pageIndex: index,
                pageObject: page,
            });
            return;
        }

        modifiedPagesArgs.push({
            id: page.id,
            start_beat: allBeats[newBeatIndex].id,
        });
    }

    return modifiedPagesArgs;
};

/**
 * Args for a new page that will be perceived as a subset of the original page.
 *
 * @param page - The page to split.
 * @returns The new page args.
 */
export const splitPage = (
    page: Pick<Page, "beats" | "nextPageId">,
):
    | { newPageArgs: NewPageArgs; modifyPageRequest?: ModifyPagesRequest }
    | undefined => {
    if (page.beats.length <= 1) {
        conToastError("Cannot split page that has less than 2 beats", page);
        return;
    }

    const beatIndex = Math.ceil(page.beats.length / 2);
    const newStartBeat = page.beats[beatIndex];

    if (!newStartBeat) {
        conToastError("Failed to find a new start beat", {
            page,
            newBeatIndex: Math.floor(page.beats.length / 2),
        });
        return;
    }
    const newPage: NewPageArgs = {
        start_beat: newStartBeat.id,
        is_subset: true,
    };

    const output: {
        newPageArgs: NewPageArgs;
        modifyPageRequest?: ModifyPagesRequest;
    } = {
        newPageArgs: newPage,
    };

    if (!page.nextPageId) {
        const modifyPageRequest: ModifyPagesRequest = {
            modifiedPagesArgs: [],
            lastPageCounts: Math.floor(page.beats.length / 2),
        };
        output.modifyPageRequest = modifyPageRequest;
    }

    return output;
};

export const pageToDatabasePage = (page: Page): DatabasePage => {
    return {
        ...page,
        is_subset: page.isSubset,
        start_beat: page.beats[0].id,
    };
};
