import Constants from "../../../src/global/Constants";
import * as History from "../database.history";
import Database from "better-sqlite3";
import * as DbActions from "../DatabaseActions";
import * as MarcherPageTable from "./MarcherPageTable";
import { ModifiedMarcherPageArgs } from "../../../src/global/classes/MarcherPage";
import { DatabaseBeat, getBeat } from "./BeatTable";
import { getMarchers } from "./MarcherTable";
import Beat from "../../../src/global/classes/Beat";
import Measure from "../../../src/global/classes/Measure";
import Page from "../../../src/global/classes/Page";

export const FIRST_PAGE_ID = 0;

/** How a page is represented in the database */
/** Represents a page in the database */
export interface DatabasePage {
    /** Unique identifier for the page */
    id: number;
    /** Indicates if this page is a subset of another page */
    is_subset: boolean;
    /** Optional notes or description for the page */
    notes: string | null;
    /** The beat number where this page starts */
    start_beat: number;
}
interface RealDatabasePage {
    /** Unique identifier for the page */
    id: number;
    /** Indicates if this page is a subset of another page */
    is_subset: 0 | 1;
    /** Optional notes or description for the page */
    notes: string | null;
    /** The beat number where this page starts */
    start_beat: number;
    /** Timestamp of when the page was created */
    created_at: string;
    /** Timestamp of when the page was last updated */
    updated_at: string;
}

const realDatabasePageToDatabasePage = (
    page: RealDatabasePage,
): DatabasePage => {
    return {
        ...page,
        is_subset: page.is_subset === 1,
    };
};

export interface NewPageArgs {
    start_beat: number;
    notes?: string | null;
    is_subset: boolean;
}

interface RealNewPageArgs {
    start_beat: number;
    notes?: string | null;
    is_subset: 0 | 1;
}
const newPageArgsToRealNewPageArgs = (args: NewPageArgs): RealNewPageArgs => {
    return {
        ...args,
        is_subset: args.is_subset ? 1 : 0,
    };
};

export interface ModifiedPageArgs {
    id: number;
    start_beat?: number;
    notes?: string | null;
    is_subset?: boolean;
}

interface RealModifiedPageArgs {
    id: number;
    start_beat?: number;
    notes?: string | null;
    is_subset?: 0 | 1;
}
const modifiedPageArgsToRealModifiedPageArgs = (
    args: ModifiedPageArgs,
): RealModifiedPageArgs => {
    return {
        ...args,
        ...(args.is_subset === undefined
            ? {}
            : { is_subset: (args.is_subset ? 1 : 0) as 0 | 1 }),
    } as RealModifiedPageArgs;
};

/**
 * Gets all of the pages in the database.
 *
 * @param db The database connection, or undefined to create a new connection
 * @returns List of all pages
 */
export function getPages({
    db,
}: {
    db: Database.Database;
}): DbActions.DatabaseResponse<DatabasePage[]> {
    const response = DbActions.getAllItems<RealDatabasePage>({
        tableName: Constants.PageTableName,
        db,
    });
    return {
        success: response.success,
        data: response.data.map(realDatabasePageToDatabasePage),
    };
}

/**
 * Fetches the previous or next page from the database based on a given page ID.
 * @param pageId - The ID of the current page.
 * @param direction - Either "previous" or "next".
 * @returns The found page or null if no page is found.
 */
export function getAdjacentPage({
    db,
    pageId,
    direction,
}: {
    db: Database.Database;
    pageId: number;
    direction: "previous" | "next";
}): DatabasePage | null {
    // Get the current page
    const currentPageResponse = DbActions.getItem<RealDatabasePage>({
        tableName: Constants.PageTableName,
        db,
        id: pageId,
    });

    if (!currentPageResponse.success || !currentPageResponse.data) {
        throw new Error(`Page with ID ${pageId} not found.`);
    }

    // Get the beat for the current page to access its position
    const currentBeatResponse = getBeat({
        db,
        beatId: currentPageResponse.data.start_beat,
    });

    if (!currentBeatResponse.success || !currentBeatResponse.data) {
        throw new Error(
            `Beat with ID ${currentPageResponse.data.start_beat} not found.`,
        );
    }

    const currentBeatPosition = currentBeatResponse.data.position;

    // Query that joins the Page and Beat tables to compare by beat position
    const query = `
        SELECT p.*
        FROM "${Constants.PageTableName}" p
        JOIN "${Constants.BeatsTableName}" b ON p.start_beat = b.id
        WHERE b.position ${direction === "previous" ? "<" : ">"} ?
        ORDER BY b.position ${direction === "previous" ? "DESC" : "ASC"}
        LIMIT 1
    `;

    const adjacentPageStmt = db.prepare(query);
    const adjacentPage = adjacentPageStmt.get(
        currentBeatPosition,
    ) as DatabasePage;

    return adjacentPage || null;
}

/**
 * Create one or many new pages.
 *
 * @param newPages The new pages to create.
 * @returns The response from the database.
 */
export function createPages({
    newPages,
    db,
}: {
    newPages: NewPageArgs[];
    db: Database.Database;
}): DbActions.DatabaseResponse<DatabasePage[]> {
    if (newPages.length === 0) {
        console.log("No new pages to create");
        return {
            success: true,
            data: [],
        };
    }
    let output: DbActions.DatabaseResponse<DatabasePage[]>;
    console.log("\n=========== start createPages ===========");

    History.incrementUndoGroup(db);
    // Track if any action was performed so that we can undo if necessary
    let actionWasPerformed = false;

    // Reverse the order of the new pages so that they are created in the correct order
    try {
        const createPagesResponse = DbActions.createItems<
            RealDatabasePage,
            RealNewPageArgs
        >({
            db,
            tableName: Constants.PageTableName,
            items: newPages.map(newPageArgsToRealNewPageArgs),
            functionName: "createPages",
            useNextUndoGroup: false,
        });
        if (
            !createPagesResponse.success ||
            createPagesResponse.data.length === 0
        ) {
            console.error("Failed to create pages:", createPagesResponse.error);
            return { ...createPagesResponse, data: [] };
        }
        actionWasPerformed = true;
        const pageBeatMap = new Map<number, DatabaseBeat>();
        for (const page of createPagesResponse.data) {
            const startBeatResponse = getBeat({ db, beatId: page.start_beat });
            if (!startBeatResponse.success || !startBeatResponse.data) {
                console.error(
                    `Failed to get start beat ${page.start_beat.toString()}:`,
                    startBeatResponse.error,
                );
                throw new Error(
                    "Failed to get start beat " + page.start_beat.toString(),
                );
            }
            pageBeatMap.set(page.id, startBeatResponse.data);
        }
        const sortedNewPages = createPagesResponse.data.sort(
            (a, b) =>
                pageBeatMap.get(a.id)!.position -
                pageBeatMap.get(b.id)!.position,
        );

        // Create the marcher pages
        const marchersResponse = getMarchers({ db });
        if (!marchersResponse.success) {
            console.error("Failed to get marchers:", marchersResponse.error);
            throw new Error("Failed to get marchers");
        }
        if (marchersResponse.data.length > 0) {
            for (const page of sortedNewPages) {
                const newMarcherPages: ModifiedMarcherPageArgs[] = [];
                const previousPage = getAdjacentPage({
                    db,
                    pageId: page.id,
                    direction: "previous",
                });
                if (previousPage) {
                    const previousPageMarcherPages =
                        MarcherPageTable.getMarcherPages({
                            db,
                            page_id: previousPage.id,
                        });

                    if (
                        !previousPageMarcherPages.success ||
                        !previousPageMarcherPages.data
                    ) {
                        console.error(
                            "Failed to get marcher pages:",
                            previousPageMarcherPages.error,
                        );
                        throw new Error("Failed to get marcher pages");
                    }
                    for (const marcherPage of previousPageMarcherPages.data)
                        newMarcherPages.push({
                            ...marcherPage,
                            page_id: page.id,
                        });
                } else {
                    for (const marcher of marchersResponse.data) {
                        newMarcherPages.push({
                            marcher_id: marcher.id,
                            page_id: page.id,
                            x: 100,
                            y: 100,
                        });
                    }
                }

                const marcherPagesResponse =
                    MarcherPageTable.createMarcherPages({
                        db,
                        newMarcherPages,
                        useNextUndoGroup: false,
                    });
                if (
                    !marcherPagesResponse.success ||
                    !marcherPagesResponse.data
                ) {
                    console.error(
                        "Failed to create marcher pages:",
                        marcherPagesResponse.error,
                    );
                    throw new Error("Failed to create marcher pages");
                }
            }
        }

        output = {
            ...createPagesResponse,
            data: createPagesResponse.data.map(realDatabasePageToDatabasePage),
        };
        History.incrementUndoGroup(db);
    } catch (error: any) {
        console.error("Error creating page. Rolling back changes.", error);
        if (actionWasPerformed) {
            History.performUndo(db);
            History.clearMostRecentRedo(db);
        }
        output = {
            success: false,
            error: {
                message: error,
                stack: error.stack || "could not get stack",
            },
            data: [],
        };
    } finally {
        console.log("=========== end createPages ===========\n");
    }
    return output;
}

/**
 * Update a list of pages with the given values.
 *
 * @param modifiedPages Array of UpdatePage objects that contain the id of the
 *                    page to update and the values to update it with
 * @returns - DatabaseResponse
 */
export function updatePages({
    db,
    modifiedPages,
}: {
    db: Database.Database;
    modifiedPages: ModifiedPageArgs[];
}): DbActions.DatabaseResponse<DatabasePage[]> {
    console.log("\n=========== start updatePages ===========");
    const pages = getPages({ db });
    if (!pages.success) {
        throw new Error("error getting pages");
    }
    const realModifiedPages = modifiedPages.map(
        modifiedPageArgsToRealModifiedPageArgs,
    );
    const response = DbActions.updateItems<
        RealDatabasePage,
        RealModifiedPageArgs
    >({
        db,
        items: realModifiedPages,
        tableName: Constants.PageTableName,
        printHeaders: false,
        useNextUndoGroup: true,
    });

    console.log("=========== end updatePages ===========\n");
    return {
        ...response,
        data: response.data.map(realDatabasePageToDatabasePage),
    };
}

/**
 * Deletes the pages with the given ids from the database.
 * CAUTION - this will delete all of the marcherPages associated with the page.
 *
 * @param pageIds
 * @returns DatabaseResponse with the deleted pages
 */
export function deletePages({
    pageIds,
    db,
}: {
    pageIds: Set<number>;
    db: Database.Database;
}): DbActions.DatabaseResponse<DatabasePage[]> {
    const response = DbActions.deleteItems<RealDatabasePage>({
        db,
        ids: pageIds,
        functionName: "deletePages",
        tableName: Constants.PageTableName,
        printHeaders: false,
        useNextUndoGroup: true,
    });
    return {
        ...response,
        data: response.data.map(realDatabasePageToDatabasePage),
    };
}

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
            throw new Error(`No measures found for page ${dbPage.id}`);
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
            measures,
            measureBeatToStartOn:
                measures[0].beats.findIndex(
                    (beat) => beat.id === startBeat.id,
                ) + 1,
            measureBeatToEndOn:
                measures[measures.length - 1].beats.findIndex(
                    (beat) => beat.id === lastBeat.id,
                ) + 1,
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
