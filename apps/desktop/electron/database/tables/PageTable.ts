import Constants from "../../../src/global/Constants";
import * as History from "../database.history";
import Database from "better-sqlite3";
import * as DbActions from "../DatabaseActions";
import * as MarcherPageTable from "./MarcherPageTable";
import { ModifiedMarcherPageArgs } from "../../../src/global/classes/MarcherPage";
import { DatabaseBeat, getBeat } from "./BeatTable";
import { getMarchers } from "./MarcherTable";
import { updateUtilityRecord, UtilityRecord } from "./UtilityTable";

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
    last_page_counts?: number;
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
 * Updates the last page counts in the utility record. Does not use the next undo group.
 *
 * @param db The database connection.
 * @param lastPageCounts The number of last page counts to update.
 * @returns A database response containing the updated utility record.
 */
export const updateLastPageCounts = ({
    db,
    lastPageCounts,
}: {
    db: Database.Database;
    lastPageCounts: number;
}): DbActions.DatabaseResponse<UtilityRecord> =>
    updateUtilityRecord({
        db,
        utilityRecord: {
            last_page_counts: lastPageCounts,
        },
        useNextUndoGroup: false,
    });

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
    // Ensure the first page is not updated
    modifiedPages = modifiedPages.filter((page) => page.id !== FIRST_PAGE_ID);
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
    // Ensure the first page is not deleted
    pageIds.delete(FIRST_PAGE_ID);
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
