import Constants from "../../../src/global/Constants";
import * as History from "../database.history";
import Database from "better-sqlite3";
import {
    ModifiedPageArgs,
    NewPageArgs,
} from "../../../src/global/classes/Page";
import * as DbActions from "../DatabaseActions";
import * as MarcherTable from "./MarcherTable";
import * as MarcherPageTable from "./MarcherPageTable";
import { ModifiedMarcherPageArgs } from "@/global/classes/MarcherPage";

/** How a page is represented in the database */
export interface DatabasePage {
    id: number;
    counts: number;
    next_page_id: number | null;
    is_subset: boolean;
    notes: string | null;
}

export function createPageTable(
    db: Database.Database
): DbActions.DatabaseResponse<string> {
    try {
        db.prepare(
            `
            CREATE TABLE IF NOT EXISTS "${Constants.PageTableName}" (
            "id"	            INTEGER PRIMARY KEY,
            "is_subset"	        INTEGER NOT NULL DEFAULT 0 CHECK (is_subset IN (0, 1)),
            "notes"	            TEXT,
            "counts"	        INTEGER NOT NULL CHECK (counts >= 0),
            "created_at"	    TEXT NOT NULL,
            "updated_at"	    TEXT NOT NULL,
            "next_page_id"	    INTEGER,
            FOREIGN KEY ("next_page_id") REFERENCES "${Constants.PageTableName}"("id")
            );
        `
        ).run();
        History.createUndoTriggers(db, Constants.PageTableName);

        return { success: true, data: Constants.PageTableName };
    } catch (error: any) {
        console.error("Failed to create page table:", error);
        return {
            success: false,
            error: { message: error, stack: error.stack },
            data: Constants.PageTableName,
        };
    }
}

interface NewPage {
    next_page_id: number | null;
    notes?: string;
    counts: number;
    is_subset: 0 | 1;
}

/* ============================ Page ============================ */
/**
 * processes the response from the database to convert from a DatabasePage[] to a Page[].
 *
 * @param response The response from the database with an array of pages
 * @returns The processed response
 */
function processPageTableResponse(
    response: DbActions.DatabaseResponse<DatabasePage[]>
): DbActions.DatabaseResponse<DatabasePage[]> {
    if (
        !response.success ||
        response.data === undefined ||
        response.data === null
    ) {
        console.error("Failed to get pages:", response.error);
        return response;
    }
    let processedData;
    processedData = response.data.map((page: any) => {
        return {
            ...page,
            is_subset: page.is_subset === 1, // Convert to boolean
        };
    });
    return { ...response, data: processedData };
}

/**
 * Gets the first page in the database linked list.
 *
 * This will throw an error if the first page is not found and there are pages in the database.
 *
 * @param db The database connection, or undefined to create a new connection
 * @returns DatabaseResponse with the first page in the database
 */
export function getFirstPage({
    db,
}: {
    db: Database.Database;
}): DbActions.DatabaseResponse<DatabasePage | undefined> {
    const allPages = getPages({ db }).data;
    const nextPageIds = new Set(allPages.map((page) => page.next_page_id));
    const firstPage = allPages.find((page) => !nextPageIds.has(page.id));
    if (!firstPage && allPages.length > 0) {
        const message = "Failed to find first page! The linked list is broken.";
        console.error(message);
        return {
            success: false,
            error: { message },
            data: undefined,
        };
    } else if (!firstPage) {
        console.log("No pages found in the database");
        // There are no pages in the database
        return {
            success: true,
            data: undefined,
        };
    }
    const response = processPageTableResponse({
        success: true,
        data: [firstPage],
    });
    return {
        ...response,
        data: response.data[0],
    };
}

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
    const response = DbActions.getAllItems<DatabasePage>({
        tableName: Constants.PageTableName,
        db,
    });
    return processPageTableResponse(response);
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
    const createdPages: DatabasePage[] = [];
    let output: DbActions.DatabaseResponse<DatabasePage[]>;
    console.log("\n=========== start createPages ===========");

    History.incrementUndoGroup(db);
    // Track if any action was performed so that we can undo if necessary
    let actionWasPerformed = false;

    // Reverse the order of the new pages so that they are created in the correct order
    const reversedNewPages = [...newPages].reverse();
    try {
        for (const newPage of reversedNewPages) {
            let itemToInsert: NewPage;
            const { previousPageId, isSubset, ...rest } = newPage;
            let previousPage: DatabasePage | undefined;
            if (previousPageId) {
                // Get the previous page from the database
                previousPage = previousPageId
                    ? DbActions.getItem<DatabasePage>({
                          db,
                          tableName: Constants.PageTableName,
                          id: previousPageId,
                      }).data
                    : undefined;
                // Define the new page by getting the next_page_id from the previous page
                itemToInsert = {
                    ...rest,
                    next_page_id: previousPage?.next_page_id || null,
                    is_subset: isSubset ? 1 : 0,
                };
            } else {
                const firstPageResponse = getFirstPage({ db });
                if (!firstPageResponse.success) {
                    throw new Error(
                        "Failed to find first page! The linked list is broken: " +
                            firstPageResponse.error?.message ||
                            "No first page found"
                    );
                }
                // Define the new page by getting the next_page_id from the previous page
                itemToInsert = {
                    ...rest,
                    next_page_id: firstPageResponse.data?.id || null,
                    is_subset: isSubset ? 1 : 0,
                };
            }
            const createPageResponse = processPageTableResponse(
                DbActions.createItems<DatabasePage, NewPage>({
                    db,
                    tableName: Constants.PageTableName,
                    items: [itemToInsert],
                    useNextUndoGroup: false,
                    printHeaders: false,
                })
            );

            actionWasPerformed = true;
            if (!createPageResponse.success) {
                throw new Error(
                    "Failed to create page: " +
                        createPageResponse.error?.message || ""
                );
            }
            createdPages.push(createPageResponse.data[0]);

            // Update the previous page to point to the new page
            if (previousPage) {
                const updateResponse = DbActions.updateItems<
                    DatabasePage,
                    { id: number; next_page_id: number | null }
                >({
                    db,
                    tableName: Constants.PageTableName,
                    items: [
                        {
                            id: previousPage.id,
                            next_page_id: createPageResponse.data[0].id,
                        },
                    ],
                    useNextUndoGroup: false,
                    printHeaders: false,
                });

                if (!updateResponse.success) {
                    throw new Error(
                        "Failed to update previous page's next_page_id: " +
                            updateResponse.error?.message || ""
                    );
                }
            }

            // Add a marcherPage for this page for each marcher
            // Get all existing marchers
            const marchers = MarcherTable.getMarchers({ db }).data;
            const previousPageMarcherPages = MarcherPageTable.getMarcherPages({
                db,
                page_id: previousPage?.id || 0,
            }).data;
            /** A map that contains all of the coordinates of the previous page with the marcher_id as the key */
            const previousPageMarcherPageCoordsMap = new Map<
                number,
                { x: number; y: number }
            >(
                previousPageMarcherPages.map((marcherPage) => [
                    marcherPage.marcher_id,
                    { x: marcherPage.x, y: marcherPage.y },
                ])
            );
            // For each marcher, create a new MarcherPage
            const newMarcherPages: ModifiedMarcherPageArgs[] = [];
            for (const marcher of marchers) {
                let coords = previousPageMarcherPageCoordsMap.get(marcher.id);
                if (!coords) {
                    coords = {
                        x: 100,
                        y: 100,
                    };
                }

                newMarcherPages.push({
                    marcher_id: marcher.id,
                    page_id: createPageResponse.data[0].id,
                    ...coords,
                });
            }
            const createMarcherPageResponse =
                MarcherPageTable.createMarcherPages({
                    db,
                    newMarcherPages,
                    useNextUndoGroup: false,
                });
            if (!createMarcherPageResponse.success) {
                throw new Error(
                    `Failed to create marcherPage for page_id=${createPageResponse.data[0].id}: ` +
                        createMarcherPageResponse.error?.message || ""
                );
            }
        }
        output = { success: true, data: createdPages };
        History.incrementUndoGroup(db);
    } catch (error: any) {
        console.error("Error creating pages: ", error);
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
    const newModifiedPages = modifiedPages.map((modifiedPage) => {
        return {
            ...modifiedPage,
            is_subset: modifiedPage.is_subset ? 1 : 0,
        };
    });
    const response = processPageTableResponse(
        DbActions.updateItems<DatabasePage, any>({
            db,
            items: newModifiedPages,
            tableName: Constants.PageTableName,
            printHeaders: false,
        })
    );
    console.log("=========== end updatePages ===========\n");
    return response;
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
    console.log("\n=========== start deletePages ===========");
    let output: DbActions.DatabaseResponse<DatabasePage[]>;
    History.incrementUndoGroup(db);
    // Check if there are any marcherPages before deleting the pages
    const marcherPages = MarcherPageTable.getMarcherPages({
        db,
    }).data;
    try {
        if (marcherPages.length === 0) {
            console.log("No marcherPages found. Skipping marcherPage deletion");
        } else {
            const deleteMarcherPageResponse = DbActions.deleteItems({
                ids: pageIds,
                tableName: Constants.MarcherPageTableName,
                db,
                useNextUndoGroup: false,
                printHeaders: false,
                idColumn: "page_id",
            });
            if (!deleteMarcherPageResponse.success) {
                throw new Error(
                    "Failed to delete marcherPages: " +
                        (deleteMarcherPageResponse.error?.message || "")
                );
            }
        }
        // Update the next_page_id of the previous page to point to the next page
        const pages = getPages({ db }).data;
        const pagesMap = new Map(pages.map((page) => [page.id, page]));
        const modifiedPages: { id: number; next_page_id: number | null }[] = [];
        const firstPageResponse = getFirstPage({ db });
        if (!firstPageResponse.success) {
            throw new Error(
                firstPageResponse.error?.message || "No first page found"
            );
        }
        const pageIdsToDelete = pageIds;
        let currentPage = firstPageResponse.data || null;

        // Iterate through the pages linked list and update the next_page_id
        // to point to the next page that is not being deleted
        while (currentPage?.next_page_id) {
            if (pageIdsToDelete.has(currentPage.id)) {
                // Set the next_page_id of the page that will be deleted to null to avoid FOREIGN KEY constraint
                modifiedPages.push({
                    id: currentPage.id,
                    next_page_id: null,
                });
            } else if (
                currentPage.next_page_id !== null &&
                pageIdsToDelete.has(currentPage.next_page_id)
            ) {
                // If the next page is being deleted, find the next page that is not being deleted
                let nextPage: DatabasePage | null =
                    pagesMap.get(currentPage.next_page_id) || null;

                // Find the next page that is not being deleted
                while (
                    nextPage !== null &&
                    nextPage.next_page_id !== null &&
                    pageIdsToDelete.has(nextPage.next_page_id)
                ) {
                    nextPage = pagesMap.get(nextPage.next_page_id) || null;
                }

                // Update the next_page_id of the current page to the next page that is not being deleted
                modifiedPages.push({
                    id: currentPage.id,
                    next_page_id: nextPage?.next_page_id || null,
                });
            }
            currentPage = pagesMap.get(currentPage.next_page_id) || null;
        }

        const updateResponse = DbActions.updateItems<DatabasePage, any>({
            db,
            items: modifiedPages,
            tableName: Constants.PageTableName,
            useNextUndoGroup: false,
            printHeaders: false,
        });
        if (!updateResponse.success) {
            throw new Error(
                "Failed to update the next_page_id while deleting pages\n" +
                    (updateResponse.error?.message || "")
            );
        }

        const deletePagesResponse = processPageTableResponse(
            DbActions.deleteItems<DatabasePage>({
                ids: pageIds,
                tableName: Constants.PageTableName,
                db,
                useNextUndoGroup: false, // Don't do this
                printHeaders: false,
            })
        );
        if (!deletePagesResponse.success)
            throw new Error(
                "Failed to delete pages " +
                    (deletePagesResponse.error?.message || "")
            );
        output = deletePagesResponse;
    } catch (error: any) {
        console.error("Failed to delete pages:", error);
        History.performUndo(db);
        History.clearMostRecentRedo(db);
        output = {
            success: false,
            error: { message: error, stack: error.stack },
            data: [],
        };
    } finally {
        console.log("=========== end deletePages ===========\n");
    }
    return output;
}
