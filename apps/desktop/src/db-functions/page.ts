import {
    eq,
    gt,
    lt,
    asc,
    desc,
    inArray,
    count,
    and,
    ne,
    isNotNull,
} from "drizzle-orm";
import {
    createBeatsInTransaction,
    DatabaseBeat,
    DbConnection,
    DbTransaction,
    getLastBeat,
    ModifiedMarcherPageArgs,
    realDatabaseBeatToDatabaseBeat,
    transactionWithHistory,
    updateUtilityInTransaction,
} from "@/db-functions";
import { schema } from "@/global/database/db";
import { DEFAULT_PROP_WIDTH, DEFAULT_PROP_HEIGHT } from "@/global/classes/Prop";
import { assert } from "@/utilities/utils";
import { WorkspaceSettings } from "@/settings/workspaceSettings";
import {
    _createFromTempoGroupInTransaction,
    tempoGroupFromWorkspaceSettings,
} from "@/components/music/TempoGroup/TempoGroup";

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
    const allMarchers = await tx.query.marchers.findMany();
    if (allMarchers.length === 0) return;

    const propMarchers = allMarchers.filter((m) => m.type === "prop");
    const propMarcherIds = new Set(propMarchers.map((m) => m.id));

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
                    where: eq(schema.marcher_pages.page_id, previousPage.id),
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

        if (newMarcherPages.length === 0) continue;

        const createdMarcherPages = await tx
            .insert(schema.marcher_pages)
            .values(newMarcherPages)
            .returning();

        // Create prop_page_geometry for prop-type marchers
        const propMarcherPages = createdMarcherPages.filter((mp) =>
            propMarcherIds.has(mp.marcher_id),
        );

        if (propMarcherPages.length > 0 && previousPage) {
            // Get previous page's marcher_pages first so we can look up their geometry
            const prevMarcherPages = await tx.query.marcher_pages.findMany({
                where: eq(schema.marcher_pages.page_id, previousPage.id),
            });

            const prevMpIds = prevMarcherPages
                .filter((mp) => propMarcherIds.has(mp.marcher_id))
                .map((mp) => mp.id);

            // Copy geometry from previous page using the PREVIOUS marcher_page IDs
            const prevGeometries =
                prevMpIds.length > 0
                    ? await tx.query.prop_page_geometry.findMany({
                          where: (table, { inArray: inArr }) =>
                              inArr(table.marcher_page_id, prevMpIds),
                      })
                    : [];

            const prevGeomByMarcher = new Map<
                number,
                typeof schema.prop_page_geometry.$inferSelect
            >();
            for (const pg of prevGeometries) {
                const prevMp = prevMarcherPages.find(
                    (mp) => mp.id === pg.marcher_page_id,
                );
                if (prevMp) prevGeomByMarcher.set(prevMp.marcher_id, pg);
            }

            const newGeometries: {
                marcher_page_id: number;
                shape_type: string;
                width: number;
                height: number;
                radius: number | null;
                rotation: number;
            }[] = [];

            for (const mp of propMarcherPages) {
                const prevGeom = prevGeomByMarcher.get(mp.marcher_id);
                if (!prevGeom) continue;
                newGeometries.push({
                    marcher_page_id: mp.id,
                    shape_type: prevGeom.shape_type,
                    width: prevGeom.width,
                    height: prevGeom.height,
                    radius: prevGeom.radius,
                    rotation: prevGeom.rotation,
                });
            }

            if (newGeometries.length > 0) {
                await tx
                    .insert(schema.prop_page_geometry)
                    .values(newGeometries);
            }
        } else if (propMarcherPages.length > 0) {
            // No previous page — seed default geometry for each prop
            await tx.insert(schema.prop_page_geometry).values(
                propMarcherPages.map((mp) => ({
                    marcher_page_id: mp.id,
                    shape_type: "rectangle",
                    width: DEFAULT_PROP_WIDTH,
                    height: DEFAULT_PROP_HEIGHT,
                    rotation: 0,
                })),
            );
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
        console.debug("No new pages to create");
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

export const getLastPage = async ({
    tx,
}: {
    tx: DbConnection | DbTransaction;
}) => {
    return await tx
        .select()
        .from(schema.pages)
        .innerJoin(schema.beats, eq(schema.beats.id, schema.pages.start_beat))
        .orderBy(desc(schema.beats.position))
        .limit(1)
        .get();
};

export type DatabasePageWithBeat = DatabasePage & { beatObject: DatabaseBeat };

/**
 * Returns in ascending order by the beat position.
 */
export const getPagesInOrder = async ({
    tx,
}: {
    tx: DbConnection | DbTransaction;
}): Promise<DatabasePageWithBeat[]> => {
    const response = await tx
        .select()
        .from(schema.pages)
        .innerJoin(schema.beats, eq(schema.beats.id, schema.pages.start_beat))
        .orderBy(asc(schema.beats.position))
        .all();
    return response.map(({ pages, beats }) => ({
        ...realDatabasePageToDatabasePage(pages),
        beatObject: realDatabaseBeatToDatabaseBeat(beats),
    }));
};

/**
 * Ensure that the second beat of the show has a page associated with it.
 * This is crucial to run when deleting pages or beats to make sure beats aren't lost.
 *
 * @param tx - database transaction
 */
export const ensureSecondBeatHasPage = async ({
    tx,
}: {
    tx: DbTransaction;
}): Promise<void> => {
    const timing_objects = schema.timing_objects;
    const timingObjectOnSecondBeat = await tx
        .select({
            page_id: timing_objects.page_id,
            beat_id: timing_objects.beat_id,
        })
        .from(timing_objects)
        .orderBy(timing_objects.position)
        .limit(1)
        .offset(1)
        .get();

    if (!timingObjectOnSecondBeat) {
        console.debug(`No timing object found at second beat`);
        return;
    }

    // There is a page on the second beat, so return
    if (timingObjectOnSecondBeat.page_id != null) return;

    // Check that there are any pages after the first one
    const nextPage = await tx
        .select({
            page_id: timing_objects.page_id,
        })
        .from(timing_objects)
        .where(
            and(
                isNotNull(timing_objects.page_id),
                ne(timing_objects.page_id, FIRST_PAGE_ID),
            ),
        )
        .get();

    // There is no next page, so no need to update the pages
    if (nextPage == null) return;

    // Otherwise update the next page to start on the second beat
    await tx
        .update(schema.pages)
        .set({
            start_beat: timingObjectOnSecondBeat.beat_id,
        })
        .where(eq(schema.pages.id, nextPage.page_id!));
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
    const pagesBeforeDeletion = await tx
        .select()
        .from(schema.pages)
        .innerJoin(schema.beats, eq(schema.beats.id, schema.pages.start_beat))
        .orderBy(asc(schema.beats.position))
        .all();

    const lastPageBeforeDeletion = await getLastPage({ tx });
    assert(
        lastPageBeforeDeletion != null,
        "Last page before deletion not found",
    );

    const deletedPages = await tx
        .delete(schema.pages)
        .where(inArray(schema.pages.id, Array.from(pageIds)))
        .returning();

    const lastPageAfterDeletion = await getLastPage({ tx });
    assert(lastPageAfterDeletion != null, "Last page after deletion not found");

    // If the last page has changed, we need to update the last page counts
    if (
        lastPageBeforeDeletion.pages.id !== lastPageAfterDeletion.pages.id &&
        lastPageAfterDeletion.pages.id !== FIRST_PAGE_ID
    ) {
        // Find the new lat page's old next page
        // This works because this list is sorted by the beat position
        const newLastPagesOldNextPage = pagesBeforeDeletion.find(
            (page) =>
                page.beats.position > lastPageAfterDeletion.beats.position,
        );
        if (newLastPagesOldNextPage) {
            const newCounts =
                newLastPagesOldNextPage.beats.position -
                lastPageAfterDeletion.beats.position;
            if (newCounts > 0)
                await updateLastPageCounts({
                    tx,
                    lastPageCounts: newCounts,
                });
            else
                console.error(
                    "New counts is less than 0. This should never happen.",
                );
        } else {
            console.warn(
                "Could not find new last page's old next page. This should never happen.",
                "lastPageBeforeDeletion",
                lastPageBeforeDeletion,
                "lastPageAfterDeletion",
                lastPageAfterDeletion,
                "pagesBeforeDeletion",
                pagesBeforeDeletion,
                "deletedPages",
            );
        }
    }

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
            const response = await deletePagesInTransaction({
                pageIds,
                tx,
            });
            await ensureSecondBeatHasPage({ tx });
            return response;
        },
    );
    return response;
}

/**
 * Creates a new page at the next available beat after the current last page.
 *
 * @param tx The database transaction.
 * @param newPageCounts The number of counts for the new page.
 * @param createNewBeats Whether to create new beats to fill the last page - (default: false)
 * @returns True if the new page was created, false if no more beats are available.
 */
export const createLastPage = async ({
    db,
    newPageCounts,
    createNewBeats = false,
}: {
    db: DbConnection;
    newPageCounts: number;
    createNewBeats?: boolean;
}) => {
    const transactionResult = await transactionWithHistory(
        db,
        "createLastPage",
        async (tx) => {
            return await createLastPageInTransaction({
                tx,
                newPageCounts,
                createNewBeats,
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
        const getLastBeatOfPage = async (startBeatId: number) => {
            // First get the position of the start beat
            const startBeat = await tx
                .select({ position: schema.beats.position })
                .from(schema.beats)
                .where(eq(schema.beats.id, startBeatId))
                .get();

            if (!startBeat) {
                throw new Error(`Start beat with ID ${startBeatId} not found`);
            }

            return await tx
                .select()
                .from(schema.beats)
                .where(gt(schema.beats.position, startBeat.position))
                .orderBy(asc(schema.beats.position))
                .limit(1)
                .offset(currentLastPageCounts - 2)
                .get();
        };
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
        .where(gt(schema.beats.position, lastBeatOfCurrentLastPage.position))
        .orderBy(asc(schema.beats.position))
        .limit(1)
        .get();

    assert(
        beatToStartNewLastPageOn != null,
        "No beat to start new last page on found. This should never happen.",
    );

    return beatToStartNewLastPageOn;
};

export const canCreateLastPage = async ({
    tx,
    newPageCounts,
}: {
    tx: DbConnection | DbTransaction;
    newPageCounts: number;
}) => {
    const lastPage = await getLastPage({ tx });
    const lastPageCounts = (await tx.query.utility.findFirst())
        ?.last_page_counts;
    assert(lastPageCounts != null, "Last page counts not found");
    assert(lastPage != null, "Last page not found");
    assert(lastPage.beats != null, "Last page beat not found");
    const nextBeat = await tx.query.beats.findFirst({
        where: (table, { gte }) =>
            gte(table.position, lastPage.beats.position + lastPageCounts),
        orderBy: (table, { asc }) => asc(table.position),
        offset: newPageCounts,
    });
    return nextBeat != null;
};

/**
 * Helper function to determine the next beat to start a new page on.
 */
const _getNextBeatToStartOn = async ({
    tx,
    lastPage,
    lastPageCounts,
    newPageCounts,
    createNewBeats,
}: {
    tx: DbTransaction;
    lastPage: { id: number; start_beat_id: number };
    lastPageCounts: number;
    newPageCounts: number;
    createNewBeats: boolean;
}): Promise<{ id: number }> => {
    if (createNewBeats) {
        const nextBeat = await _fillAndGetBeatToStartOn({
            tx,
            lastPage,
            currentLastPageCounts: lastPageCounts,
            newLastPageCounts: newPageCounts,
        });
        if (!nextBeat) throw new Error("Next beat not found");
        return nextBeat;
    } else {
        // First get the beat object from the beat ID to access its position
        const lastPageBeat = await tx.query.beats.findFirst({
            where: eq(schema.beats.id, lastPage.start_beat_id),
        });
        if (!lastPageBeat) throw new Error("Last page beat not found");

        const nextBeat = await tx.query.beats.findFirst({
            where: (table, { gte }) =>
                gte(table.position, lastPageBeat.position),
            orderBy: (table, { asc }) => asc(table.position),
            offset: lastPageCounts,
        });
        if (!nextBeat) throw new Error("Not enough beats to create a new page");
        return nextBeat;
    }
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
    createNewBeats = false,
}: {
    tx: DbTransaction;
    newPageCounts: number;
    createNewBeats?: boolean;
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

    const nextBeatToStartOn = await _getNextBeatToStartOn({
        tx,
        lastPage,
        lastPageCounts,
        newPageCounts,
        createNewBeats,
    });

    const createdPages = await createPagesInTransaction({
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
    return createdPages[0];
};
/**
 * Gets the next beat a page should start on.
 *
 * This is done by
 *
 * 1. getting the last page's start beat
 * 2. getting the last page's count (from the utility record)
 * 3. Finding a beat that is offset by the last page's count from the last page's start beat
 * 4. Returning that beat, or null if no beat is found
 *
 * @param db The database connection or transaction
 * @returns
 */
export const getNextBeatToStartPageOn = async (
    db: DbConnection | DbTransaction,
): Promise<DatabaseBeat | null> => {
    const pagesCount = await db
        .select({
            count: count(),
        })
        .from(schema.pages)
        .get();
    assert(pagesCount != null && pagesCount.count > 0, "No pages found");

    let output: DatabaseBeat | null;
    const lastPage = await db
        .select()
        .from(schema.pages)
        .leftJoin(schema.beats, eq(schema.beats.id, schema.pages.start_beat))
        .orderBy(desc(schema.beats.position))
        .get();
    assert(lastPage != null, "Last page not found");
    const lastPageBeat = lastPage.beats;
    assert(lastPageBeat != null, "Last page beat not found");
    if (pagesCount.count === 1) {
        const nextBeat = await db.query.beats.findFirst({
            where: gt(schema.beats.position, lastPageBeat.position),
            orderBy: (table, { asc }) => asc(table.position),
        });
        output =
            nextBeat?.id != null
                ? realDatabaseBeatToDatabaseBeat(nextBeat)
                : null;
    } else {
        const utility = await db.query.utility.findFirst();
        assert(utility != null, "Utility not found");
        const lastPageCounts = utility.last_page_counts;
        const nextBeat = await db.query.beats.findFirst({
            where: (table, { gte }) =>
                gte(table.position, lastPageBeat.position),
            orderBy: (table, { asc }) => asc(table.position),
            offset: lastPageCounts,
        });
        return nextBeat?.id != null
            ? realDatabaseBeatToDatabaseBeat(nextBeat)
            : null;
    }
    return output;
};

export const createTempoGroupAndPageFromWorkspaceSettings = async ({
    db,
    workspaceSettings,
}: {
    db: DbConnection;
    workspaceSettings: Pick<
        WorkspaceSettings,
        "defaultBeatsPerMeasure" | "defaultTempo" | "defaultNewPageCounts"
    >;
}) => {
    const tempoGroup = tempoGroupFromWorkspaceSettings(workspaceSettings);

    const result = await transactionWithHistory(
        db,
        "createDefaultTempoGroupAndPage",
        async (tx) => {
            const lastBeat = await getLastBeat({ db });
            assert(lastBeat != null, "Last beat not found");
            await _createFromTempoGroupInTransaction({
                tx,
                tempoGroup,
                endTempo: undefined,
                startingPosition: lastBeat.position + 1,
            });
            const nextBeat = await getNextBeatToStartPageOn(tx);
            if (!nextBeat) throw new Error("Next beat not found");
            const createdPages = await createPagesInTransaction({
                tx,
                newPages: [{ start_beat: nextBeat.id, is_subset: false }],
            });
            await updateUtilityInTransaction({
                tx,
                args: {
                    last_page_counts: workspaceSettings.defaultNewPageCounts,
                },
            });
            return createdPages[0];
        },
    );
    return result;
};
