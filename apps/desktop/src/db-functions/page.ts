import { eq, gt, lt, asc, desc, inArray } from "drizzle-orm";
import {
    createBeatsInTransaction,
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
 * Fills the beats of the current last page and returns the last beat of the page.
 *
 * * Before:
 * +-------------+-------------+
 * |     pg 1    |     pg 2    |
 * +-------------+-------------+
 * | 1  2  3  4  | 5  6        |
 * +-------------+-------------+
 *
 * After:
 * +-------------+-------------+
 * |     pg 1    |     pg 2    |
 * +-------------+-------------+
 * | 1  2  3  4  | 5  6  7  8  |
 * +-------------+-------------+
 *
 * Returns:
 * beat 8
 *
 * @param
 * @returns
 */
const _fillBeatsOfCurrentLastPage = async ({
    tx,
    defaultDuration,
    currentLastPageCounts,
    lastPage,
}: {
    tx: DbTransaction;
    defaultDuration: number;
    currentLastPageCounts: number;
    lastPage: { id: number; start_beat_id: number };
}) => {
    let lastBeatOfPage = null;
    if (lastPage.id !== FIRST_PAGE_ID) {
        const getLastBeatOfPage = async (startBeatId: number) =>
            await tx
                .select()
                .from(schema.beats)
                .where(gt(schema.beats.position, startBeatId))
                .orderBy(asc(schema.beats.position))
                .limit(1)
                .offset(currentLastPageCounts - 2)
                .get();
        // Check if the last page is already filled
        lastBeatOfPage = await getLastBeatOfPage(lastPage.start_beat_id);
        if (!lastBeatOfPage) {
            // There is not enough beats to fill the current last page. Fill the last page
            for (let i = 0; i < currentLastPageCounts; i++) {
                // Just filling with the lastPageCounts is a bit sloppy, but it's guaranteed to fill the last page
                await createBeatsInTransaction({
                    tx,
                    newBeats: [
                        {
                            duration: defaultDuration,
                            include_in_measure: true,
                        },
                    ],
                });
            }
            lastBeatOfPage = await getLastBeatOfPage(lastPage.start_beat_id);
        }
    } else {
        // If this is the first page, just return the start beat (since it is the start and end, as page 0 has no duration)
        lastBeatOfPage = await tx
            .select()
            .from(schema.beats)
            .where(eq(schema.beats.position, FIRST_PAGE_ID))
            .get();
    }

    assert(
        lastBeatOfPage != null,
        "No last beat of page found. This should never happen.",
    );

    return lastBeatOfPage;
};

/**
 * Fills the beats to ensure that at least the lastPage's start beat is filled,
 * and then returns the beat to start on.
 *
 * Here is a visual example of what this function does:
 *
 *Last page counts: 8
 *
 * Before:
 * +-------------+-------------+
 * |     pg 1    |     pg 2    |
 * +-------------+-------------+
 * | 1  2  3  4  | 5  6        |
 * +-------------+-------------+
 *
 * After adding beats:
 * +-------------+-------------+-------------+
 * |     pg 1    |     pg 2    |    pg 3     |
 * +-------------+-------------+-------------+
 * | 1  2  3  4  | 5  6  7  8  | 9  10 11 12 |
 * +-------------+-------------+-------------+
 *
 * Notes:
 * - pg 2 filled up (added 7, 8)
 * - pg 3 created to fill the last page (9–12)
 *
 *
 * @param
 */
export const _fillAndGetBeatToStartOn = async ({
    tx,
    lastPage,
    currentLastPageCounts,
    newLastPageCounts,
}: {
    tx: DbTransaction;
    lastPage: { id: number; start_beat_id: number };
    currentLastPageCounts: number;
    newLastPageCounts: number;
}) => {
    // Fill the beats
    const defaultDurationResult = await tx
        .select({
            duration: schema.utility.default_beat_duration,
        })
        .from(schema.utility)
        .get();

    if (defaultDurationResult == null)
        console.warn("Default beat duration not found. Using 0.5 seconds.");
    const defaultDuration = defaultDurationResult?.duration ?? 0.5;

    const lastBeatOfCurrentLastPage = await _fillBeatsOfCurrentLastPage({
        tx,
        defaultDuration,
        currentLastPageCounts,
        lastPage,
    });

    // Check if there are enough beats to fill a page of newLastPageCounts
    const beatsAfterLastPage = await tx
        .select()
        .from(schema.beats)
        .where(gt(schema.beats.position, lastBeatOfCurrentLastPage.position))
        .orderBy(asc(schema.beats.position))
        .all();

    const availableBeats = beatsAfterLastPage.length;
    const neededBeats = newLastPageCounts;

    if (availableBeats < neededBeats) {
        // Create the missing beats
        const beatsToCreate = neededBeats - availableBeats;
        for (let i = 0; i < beatsToCreate; i++) {
            await createBeatsInTransaction({
                tx,
                newBeats: [
                    { duration: defaultDuration, include_in_measure: true },
                ],
            });
        }
    }

    const beatToStartNewLastPageOn = await tx
        .select()
        .from(schema.beats)
        .where(gt(schema.beats.position, lastBeatOfCurrentLastPage.id))
        .orderBy(asc(schema.beats.position))
        .limit(1)
        .get();

    assert(
        beatToStartNewLastPageOn != null,
        "No beat to start new last page on found. This should never happen.",
    );

    return beatToStartNewLastPageOn;
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

    const allPages = await tx.query.pages.findMany();
    let lastPage: { id: number; start_beat_id: number } | undefined;
    assert(allPages.length > 0, "No pages found");
    if (allPages.length === 1) {
        lastPage = {
            id: allPages[0].id,
            start_beat_id: allPages[0].start_beat,
        };
    } else {
        const response = await tx
            .select({
                page_id: schema.pages.id,
                beat_id: schema.beats.id,
                jeff: schema.beats.position,
            })
            .from(schema.pages)
            .leftJoin(
                schema.beats,
                eq(schema.beats.id, schema.pages.start_beat),
            )
            .orderBy(desc(schema.beats.position))
            .limit(1)
            .get();
        assert(
            response != null && response.beat_id != null,
            "Last page not found",
        );
        lastPage = {
            id: response.page_id,
            start_beat_id: response.beat_id,
        };
    }
    const nextBeatToStartOn = await _fillAndGetBeatToStartOn({
        tx,
        lastPage,
        currentLastPageCounts: lastPageCounts,
        newLastPageCounts: newPageCounts,
    });

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
