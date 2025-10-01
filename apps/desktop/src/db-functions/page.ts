import { eq, gt, lt, asc, desc, inArray } from "drizzle-orm";
import {
    DatabaseMarcherPage,
    DbConnection,
    DbTransaction,
    ModifiedMarcherPageArgs,
    transactionWithHistory,
} from "@/db-functions";
import { schema } from "@/global/database/db";
import { assert } from "@/utilities/utils";

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
type RealDatabasePage = typeof schema.pages.$inferSelect;

export const realDatabasePageToDatabasePage = (
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
export async function getPages({
    db,
}: {
    db: DbConnection;
}): Promise<DatabasePage[]> {
    const result = await db.query.pages.findMany();
    return result.map(realDatabasePageToDatabasePage);
}

/**
 * Fetches the previous or next page from the database based on a given page ID.
 * @param pageId - The ID of the current page.
 * @param direction - Either "previous" or "next".
 * @returns The found page or null if no page is found.
 */
export async function getAdjacentPage({
    tx,
    pageId,
    direction,
}: {
    tx: DbTransaction;
    pageId: number;
    direction: "previous" | "next";
}): Promise<DatabasePage | null> {
    // Get the current page's beat position
    const currentPagePosition = await tx
        .select({
            position: schema.beats.position,
        })
        .from(schema.pages)
        .innerJoin(schema.beats, eq(schema.beats.id, schema.pages.start_beat))
        .where(eq(schema.pages.id, pageId))
        .limit(1)
        .get();

    if (!currentPagePosition) {
        throw new Error(`Page with ID ${pageId} not found.`);
    }

    // Determine comparison operator and ordering based on direction
    const comparison =
        direction === "previous"
            ? lt(schema.beats.position, currentPagePosition.position)
            : gt(schema.beats.position, currentPagePosition.position);

    const ordering =
        direction === "previous"
            ? desc(schema.beats.position)
            : asc(schema.beats.position);

    // Find the adjacent page using Drizzle ORM
    const adjacentPage = await tx
        .select({ page: schema.pages })
        .from(schema.pages)
        .innerJoin(schema.beats, eq(schema.beats.id, schema.pages.start_beat))
        .where(comparison)
        .orderBy(ordering)
        .limit(1)
        .get();

    return adjacentPage?.page
        ? realDatabasePageToDatabasePage(adjacentPage.page)
        : null;
}

/**
 * Updates the last page counts in the utility record. Does not use the next undo group.
 *
 * @param tx The database transaction.
 * @param lastPageCounts The number of last page counts to update.
 * @returns A database response containing the updated utility record.
 */
export const updateLastPageCounts = async ({
    tx,
    lastPageCounts,
}: {
    tx: DbTransaction;
    lastPageCounts: number;
}): Promise<typeof schema.utility.$inferSelect | null> => {
    const response = tx
        .update(schema.utility)
        .set({
            last_page_counts: lastPageCounts,
        })
        .where(eq(schema.utility.id, 0))
        .returning()
        .get();
    return response;
};

const _createMarcherPages = async ({
    tx,
    sortedNewPages,
}: {
    tx: DbTransaction;
    sortedNewPages: RealDatabasePage[];
}) => {
    // Create the marcher pages
    const allMarchers = await tx.query.marchers.findMany();
    if (allMarchers.length > 0) {
        for (const page of sortedNewPages) {
            const newMarcherPages: ModifiedMarcherPageArgs[] = [];
            const previousPage = await getAdjacentPage({
                tx,
                pageId: page.id,
                direction: "previous",
            });
            if (previousPage) {
                const previousPageMarcherPages =
                    await tx.query.marcher_pages.findMany({
                        where: eq(
                            schema.marcher_pages.page_id,
                            previousPage.id,
                        ),
                    });

                for (const marcherPage of previousPageMarcherPages)
                    newMarcherPages.push({
                        marcher_id: marcherPage.marcher_id,
                        page_id: page.id,
                        x: marcherPage.x,
                        y: marcherPage.y,
                        notes: marcherPage.notes,
                        path_data_id: marcherPage.path_data_id,
                        path_start_position: marcherPage.path_start_position,
                        path_end_position: marcherPage.path_end_position,
                    });
            } else {
                for (const marcher of allMarchers) {
                    newMarcherPages.push({
                        marcher_id: marcher.id,
                        page_id: page.id,
                        x: 100,
                        y: 100,
                    });
                }
            }

            if (newMarcherPages.length > 0) {
                // Create the marcher pages
                await tx
                    .insert(schema.marcher_pages)
                    .values(newMarcherPages)
                    .returning();
            }
        }
    }
};

/**
 * Creates one or many new pages in the database as well as the marcher pages for each page.
 *
 * THIS SHOULD ALWAYS BE CALLED RATHER THAN 'db.insert' DIRECTLY.
 *
 * @param newPages The new pages to create.
 * @param tx The database transaction.
 * @returns
 */
export const createPagesInTransaction = async ({
    newPages,
    tx,
}: {
    newPages: NewPageArgs[];
    tx: DbTransaction;
}): Promise<DatabasePage[]> => {
    // Reverse the order of the new pages so that they are created in the correct order
    const createdPages = await tx
        .insert(schema.pages)
        .values(newPages.map(newPageArgsToRealNewPageArgs))
        .returning();
    const pageBeatMap = new Map<number, typeof schema.beats.$inferSelect>();
    for (const page of createdPages) {
        const startBeat = await tx.query.beats.findFirst({
            where: eq(schema.beats.id, page.start_beat),
        });
        // const startBeatResponse = getBeat({ db, beatId: page.start_beat });
        if (!startBeat) {
            console.error(
                `Failed to get start beat ${page.start_beat.toString()}:`,
            );
            throw new Error(
                "Failed to get start beat " + page.start_beat.toString(),
            );
        }
        pageBeatMap.set(page.id, startBeat);
    }
    const sortedNewPages = createdPages.sort(
        (a, b) =>
            pageBeatMap.get(a.id)!.position - pageBeatMap.get(b.id)!.position,
    );

    await _createMarcherPages({
        tx,
        sortedNewPages,
    });

    return createdPages.map(realDatabasePageToDatabasePage);
};

/**
 * Create one or many new pages.
 *
 * @param newPages The new pages to create.
 * @returns The response from the database.
 */
export async function createPages({
    newPages,
    db,
}: {
    newPages: NewPageArgs[];
    db: DbConnection;
}): Promise<DatabasePage[]> {
    if (newPages.length === 0) {
        console.log("No new pages to create");
        return [];
    }
    const transactionResult = await transactionWithHistory(
        db,
        "createPages",
        async (tx) => {
            return await createPagesInTransaction({
                newPages,
                tx,
            });
        },
    );
    return transactionResult;
}

export const updatePagesInTransaction = async ({
    modifiedPages,
    tx,
}: {
    modifiedPages: ModifiedPageArgs[];
    tx: DbTransaction;
}): Promise<DatabasePage[]> => {
    // Ensure the first page is not updated (except for notes)
    const firstPageFound = modifiedPages.find(
        (page) => page.id === FIRST_PAGE_ID,
    );
    if (firstPageFound) {
        // Check if anything other than notes is being modified
        const hasNonNotesChanges = Object.keys(firstPageFound).some(
            (key) => key !== "id" && key !== "notes",
        );

        if (hasNonNotesChanges) {
            console.warn(
                "Attempting to modify the first page (ID: " +
                    FIRST_PAGE_ID +
                    "), which is not allowed. Filtering it out.",
            );
            modifiedPages = modifiedPages.filter(
                (page) => page.id !== FIRST_PAGE_ID,
            );
            // Only include the notes if it was changed
            if (firstPageFound.notes !== undefined)
                modifiedPages.push({
                    id: firstPageFound.id,
                    notes: firstPageFound.notes,
                });
        }
    }

    const updatedPages: DatabasePage[] = [];
    const realModifiedPages = modifiedPages.map(
        modifiedPageArgsToRealModifiedPageArgs,
    );
    for (const modifiedPage of realModifiedPages) {
        const updatedPage = await tx
            .update(schema.pages)
            .set(modifiedPage)
            .where(eq(schema.pages.id, modifiedPage.id))
            .returning()
            .get();
        updatedPages.push(realDatabasePageToDatabasePage(updatedPage));
    }
    return updatedPages;
};
/**
 * Update a list of pages with the given values.
 *
 * @param modifiedPages Array of UpdatePage objects that contain the id of the
 *                    page to update and the values to update it with
 * @returns - DatabaseResponse
 */
export async function updatePages({
    db,
    modifiedPages,
}: {
    db: DbConnection;
    modifiedPages: ModifiedPageArgs[];
}): Promise<DatabasePage[]> {
    const transactionResult = await transactionWithHistory(
        db,
        "updatePages",
        async (tx) => {
            return await updatePagesInTransaction({
                modifiedPages,
                tx,
            });
        },
    );
    return transactionResult;
}

const filterOutFirstPage = (pageIds: Set<number>): Set<number> => {
    if (pageIds.has(FIRST_PAGE_ID)) {
        console.warn(
            "Attempting to delete the first page (ID: " +
                FIRST_PAGE_ID +
                "), which is not allowed. Filtering it out.",
        );
        pageIds.delete(FIRST_PAGE_ID);
    }
    return pageIds;
};

export const deletePagesInTransaction = async ({
    pageIds,
    tx,
}: {
    pageIds: Set<number>;
    tx: DbTransaction;
}): Promise<DatabasePage[]> => {
    pageIds = filterOutFirstPage(pageIds);
    if (pageIds.size === 0) return [];
    const deletedPages = await tx
        .delete(schema.pages)
        .where(inArray(schema.pages.id, Array.from(pageIds)))
        .returning();
    return deletedPages.map(realDatabasePageToDatabasePage);
};

/**
 * Deletes the pages with the given ids from the database.
 * CAUTION - this will delete all of the marcherPages associated with the page.
 *
 * @param pageIds
 * @returns DatabaseResponse with the deleted pages
 */
export async function deletePages({
    pageIds,
    db,
}: {
    pageIds: Set<number>;
    db: DbConnection;
}): Promise<DatabasePage[]> {
    pageIds = filterOutFirstPage(pageIds);
    if (pageIds.size === 0) return [];
    // Ensure the first page is not deleted
    const response = await transactionWithHistory(
        db,
        "deletePages",
        async (tx) => {
            return await deletePagesInTransaction({
                pageIds,
                tx,
            });
        },
    );
    return response;
}

/**
 * Creates a new page at the next available beat after the current last page.
 *
 * @param tx The database transaction.
 * @param newPageCounts The number of counts for the new page.
 * @returns True if the new page was created, false if no more beats are available.
 */
export const createLastPage = async ({
    db,
    newPageCounts,
}: {
    db: DbConnection;
    newPageCounts: number;
}) => {
    const transactionResult = await transactionWithHistory(
        db,
        "createLastPage",
        async (tx) => {
            return await createLastPageInTransaction({
                tx,
                newPageCounts,
            });
        },
    );
    return transactionResult;
};

/**
 * Creates a new page at the next available beat after the current last page.
 *
 * Same as createLastPage, but not wrapped in a history transaction. Only use this inside of a transactionWithHistory.
 *
 * @param tx The database transaction.
 * @param newPageCounts The number of counts for the new page.
 * @returns
 */
export const createLastPageInTransaction = async ({
    tx,
    newPageCounts,
}: {
    tx: DbTransaction;
    newPageCounts: number;
}) => {
    const lastPageCounts = (await tx.query.utility.findFirst())
        ?.last_page_counts;
    assert(lastPageCounts != null, "Last page counts not found");

    const lastPage = await tx
        .select({
            beat_id: schema.beats.id,
        })
        .from(schema.pages)
        .leftJoin(schema.beats, eq(schema.beats.id, schema.pages.start_beat))
        .orderBy(desc(schema.beats.position))
        .limit(1)
        .get();
    assert(lastPage && lastPage.beat_id != null, "Last page not found");
    const nextBeatToStartOn = await tx
        .select()
        .from(schema.beats)
        .where(gt(schema.beats.position, lastPage.beat_id))
        .orderBy(asc(schema.beats.position))
        .limit(1)
        .offset(lastPageCounts - 1)
        .get();
    if (!nextBeatToStartOn) throw new Error("No next beat to start on found");

    await createPagesInTransaction({
        newPages: [
            {
                start_beat: nextBeatToStartOn.id,
                is_subset: false,
            },
        ],
        tx,
    });

    await updateLastPageCounts({
        tx,
        lastPageCounts: newPageCounts,
    });
    return true;
};
