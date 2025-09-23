import { and, desc, eq, inArray } from "drizzle-orm";
import {
    DbConnection,
    DbTransaction,
    deleteShapePagesInTransaction,
    transactionWithHistory,
} from "@/db-functions";
import { db, schema } from "@/global/database/db";
import { assert } from "@/utilities/utils";

/** How a shape page marcher is represented in the database */
export type DatabaseShapePageMarcher =
    typeof schema.shape_page_marchers.$inferSelect;

export type ShapePageMarcher = DatabaseShapePageMarcher;

// Only do this if it's needed to convert the real database values to something else
// I.e. integer -> boolean in sqlite
type RealDatabaseShapePageMarcher = DatabaseShapePageMarcher;

export const realDatabaseShapePageMarcherToDatabaseShapePageMarcher = (
    item: RealDatabaseShapePageMarcher,
): DatabaseShapePageMarcher => {
    return {
        ...item,
        // Add any necessary transformations
    };
};

export interface NewShapePageMarcherArgs {
    shape_page_id: number;
    marcher_id: number;
    position_order: number;
    notes?: string | null;
}

export interface ModifiedShapePageMarcherArgs {
    id: number;
    position_order?: number;
    notes?: string | null;
}

interface RealModifiedShapePageMarcherArgs {
    id: number;
    position_order?: number;
    notes?: string | null;
}

const modifiedShapePageMarcherArgsToRealModifiedShapePageMarcherArgs = (
    args: ModifiedShapePageMarcherArgs,
): RealModifiedShapePageMarcherArgs => {
    return {
        ...args,
        // Add any necessary transformations
    };
};

/**
 * Gets all shape page marchers from the database.
 */
export async function getShapePageMarchers({
    db,
}: {
    db: DbConnection;
}): Promise<DatabaseShapePageMarcher[]> {
    const result = await db.query.shape_page_marchers.findMany();
    return result.map(realDatabaseShapePageMarcherToDatabaseShapePageMarcher);
}

/**
 * Retrieves a single ShapePageMarcher record from the database based on the provided marcher_id and page_id.
 *
 * @param db The database instance
 * @param marcherPage An object containing the marcher_id and page_id to filter the query
 * @returns A DatabaseResponse containing the matching ShapePageMarcher record, or null if no record is found
 */
export async function getSpmByMarcherPage({
    tx,
    marcherPage,
}: {
    tx: DbTransaction;
    marcherPage: { marcher_id: number; page_id: number };
}): Promise<ShapePageMarcher | null> {
    const response = await tx
        .select({ spm: schema.shape_page_marchers })
        .from(schema.shape_page_marchers)
        .innerJoin(
            schema.shape_pages,
            eq(schema.shape_page_marchers.shape_page_id, schema.shape_pages.id),
        )
        .where(
            and(
                eq(
                    schema.shape_page_marchers.marcher_id,
                    marcherPage.marcher_id,
                ),
                eq(schema.shape_pages.page_id, marcherPage.page_id),
            ),
        )
        .get();
    return response
        ? realDatabaseShapePageMarcherToDatabaseShapePageMarcher(response.spm)
        : null;
}

export async function getShapePageMarchersByPage({
    db,
    pageId,
}: {
    db: DbConnection;
    pageId: number;
}): Promise<ShapePageMarcher[]> {
    const result = await db
        .select()
        .from(schema.shape_page_marchers)
        .innerJoin(
            schema.shape_pages,
            eq(schema.shape_page_marchers.shape_page_id, schema.shape_pages.id),
        )
        .where(eq(schema.shape_pages.page_id, pageId))
        .all();

    return result.map(({ shape_page_marchers }) =>
        realDatabaseShapePageMarcherToDatabaseShapePageMarcher(
            shape_page_marchers,
        ),
    );
}

export async function _getShapePageMarchersByMarcherIds({
    tx,
    marcherIds,
}: {
    tx: DbTransaction;
    marcherIds: Set<number>;
}): Promise<DatabaseShapePageMarcher[]> {
    const result = await tx.query.shape_page_marchers.findMany({
        where: inArray(
            schema.shape_page_marchers.marcher_id,
            Array.from(marcherIds),
        ),
    });
    return result.map(realDatabaseShapePageMarcherToDatabaseShapePageMarcher);
}

/**
 * Gets a single shape page marcher by ID.
 */
export async function _getShapePageMarcherById({
    db,
    id,
}: {
    db: DbConnection;
    id: number;
}): Promise<DatabaseShapePageMarcher | undefined> {
    const result = await db.query.shape_page_marchers.findFirst({
        where: eq(schema.shape_page_marchers.id, id),
    });
    return result
        ? realDatabaseShapePageMarcherToDatabaseShapePageMarcher(result)
        : undefined;
}
/**
 * Increments the position_order of all ShapePageMarcher records with a position_order greater than or equal to the provided positionOrder for the given shapePageId.
 * This is used to shift the position_order of existing records when a new ShapePageMarcher is inserted.
 *
 * If it fails, an error is thrown
 *
 * @param db The database instance
 * @param shapePageId The ID of the ShapePage that the ShapePageMarchers belong to
 * @param positionOrder The position_order to start incrementing from
 */
async function _incrementPositionOrder({
    tx,
    shapePageId,
    positionOrder,
}: {
    tx: DbTransaction;
    shapePageId: number;
    positionOrder: number;
}): Promise<void> {
    const allSpmsByShapePage = await tx.query.shape_page_marchers.findMany({
        where: eq(schema.shape_page_marchers.shape_page_id, shapePageId),
    });
    if (!allSpmsByShapePage || allSpmsByShapePage.length === 0) {
        console.warn("No ShapePageMarchers found for the given shapePageId");
        return;
    }
    const allShapePageSpms = allSpmsByShapePage.sort(
        (a, b) => a.position_order - b.position_order,
    );
    const positionIndex = allShapePageSpms.findIndex(
        (spm) => spm.position_order === positionOrder,
    );

    // If there are no SPMs for the given shapePageId or there are no SPMs with the specified position_order, return early
    if (positionIndex === -1) {
        console.warn(
            `No ShapePageMarcher found with position_order ${positionOrder} for shapePageId ${shapePageId}`,
        );
        return;
    }

    const modifiedSpms: Pick<
        DatabaseShapePageMarcher,
        "id" | "position_order"
    >[] = [];
    for (let i = positionIndex; i < allShapePageSpms.length; i++) {
        const spm = allShapePageSpms[i];
        modifiedSpms.push({
            id: spm.id,
            position_order: positionOrder + (i - positionIndex) + 1,
        });
    }
    // reverse the order of the modifiedSpms array so that the unique constraint is not violated
    modifiedSpms.reverse();

    for (const spm of modifiedSpms) {
        await tx
            .update(schema.shape_page_marchers)
            .set(spm)
            .where(eq(schema.shape_page_marchers.id, spm.id))
            .get();
    }
}

export async function swapPositionOrder({
    db,
    spmId1,
    spmId2,
}: {
    db: DbTransaction;
    spmId1: number;
    spmId2: number;
}): Promise<[DatabaseShapePageMarcher, DatabaseShapePageMarcher]> {
    return await transactionWithHistory(db, "swapPositionOrder", async (tx) => {
        return await swapPositionOrderInTransaction({ tx, spmId1, spmId2 });
    });
}

/**
 * Swaps the position order of two ShapePageMarcher objects in the database.
 *
 * @param tx The database transaction
 * @param spmId1 The ID of the first ShapePageMarcher object
 * @param spmId2 The ID of the second ShapePageMarcher object
 * @returns An array containing the updated ShapePageMarcher objects
 */
export async function swapPositionOrderInTransaction({
    tx,
    spmId1,
    spmId2,
}: {
    tx: DbTransaction;
    spmId1: number;
    spmId2: number;
}): Promise<[DatabaseShapePageMarcher, DatabaseShapePageMarcher]> {
    const smp1 = await tx.query.shape_page_marchers.findFirst({
        where: eq(schema.shape_page_marchers.id, spmId1),
    });
    assert(smp1, `ShapePageMarcher not found for the given id: ${spmId1}`);
    const smp2 = await tx.query.shape_page_marchers.findFirst({
        where: eq(schema.shape_page_marchers.id, spmId2),
    });
    assert(smp2, `ShapePageMarcher not found for the given id: ${spmId2}`);

    assert(
        smp1.shape_page_id === smp2.shape_page_id,
        `ShapePageMarchers must be on the same shape page to be swapped`,
    );

    // Ensure both position_order values are not null
    assert(
        smp1.position_order !== null && smp1.position_order !== undefined,
        `ShapePageMarcher ${spmId1} has null or undefined position_order`,
    );
    assert(
        smp2.position_order !== null && smp2.position_order !== undefined,
        `ShapePageMarcher ${spmId2} has null or undefined position_order`,
    );

    // Find a temporary position order that is not already taken to prevent a unique constraint violation
    const maxPositionOrder = await tx.query.shape_page_marchers.findFirst({
        where: eq(schema.shape_page_marchers.shape_page_id, smp1.shape_page_id),
        orderBy: desc(schema.shape_page_marchers.position_order),
    });
    assert(
        maxPositionOrder,
        `No max position order found for the given shapePageId: ${smp1.shape_page_id}`,
    );
    const tempPositionOrder = maxPositionOrder.position_order + 1;

    // Set spm1 to the temporary position order
    await tx
        .update(schema.shape_page_marchers)
        .set({
            position_order: tempPositionOrder,
        })
        .where(eq(schema.shape_page_marchers.id, spmId1));
    // Set spm2 to the original spm1 position order
    const updatedSmp2 = await tx
        .update(schema.shape_page_marchers)
        .set({
            position_order: smp1.position_order,
        })
        .where(eq(schema.shape_page_marchers.id, spmId2))
        .returning()
        .get();
    // Set spm1 to the original spm2 position order
    const updatedSmp1 = await tx
        .update(schema.shape_page_marchers)
        .set({
            position_order: smp2.position_order,
        })
        .where(eq(schema.shape_page_marchers.id, spmId1))
        .returning()
        .get();

    return [updatedSmp1, updatedSmp2];
}

/**
 * Flattens the position_order values for all ShapePageMarcher records associated with the given shapePageId.
 * This ensures that the position_order values are sequential and contiguous.
 * If it fails, an error is thrown
 *
 * @param db The database instance
 * @param shapePageId The ID of the ShapePage associated with the ShapePageMarchers to be flattened
 * @returns void
 */
async function _flattenOrder({
    tx,
    shapePageId,
}: {
    tx: DbTransaction;
    shapePageId: number;
}): Promise<void> {
    const allSpmsByShapePage = await tx.query.shape_page_marchers.findMany({
        where: eq(schema.shape_page_marchers.shape_page_id, shapePageId),
    });
    if (!allSpmsByShapePage || allSpmsByShapePage.length === 0) {
        console.warn("No ShapePageMarchers found for the given shapePageId");
        return;
    }

    // Sort SPMs by position_order
    const sortedSpms = allSpmsByShapePage.sort(
        (a, b) => a.position_order - b.position_order,
    );

    // Create array of modified SPMs with incremental position_order values
    const modifiedSpms: Pick<
        DatabaseShapePageMarcher,
        "id" | "position_order"
    >[] = [];
    sortedSpms.forEach((spm, index) => {
        const newIndex = index;
        if (spm.position_order !== newIndex) {
            modifiedSpms.push({
                id: spm.id,
                position_order: index + 1,
            });
        }
    });

    for (const spm of modifiedSpms) {
        await tx
            .update(schema.shape_page_marchers)
            .set(spm)
            .where(eq(schema.shape_page_marchers.id, spm.id))
            .get();
    }
}

/**
 * Creates new shapePageMarchers in the database
 * @param tx The database transaction
 * @param args Array of NewShapePageMarcherArgs containing name and optional notes
 * @param force If a marcher is already assigned to a shapePage on the same page, delete that shapePage to allow the new SPM to be created
 * @returns DatabaseShapePageMarcher[] containing the created ShapePageMarchers
 */
// eslint-disable-next-line max-lines-per-function
export async function createShapePageMarchersInTransaction({
    newItems,
    tx,
    force = false,
}: {
    newItems: NewShapePageMarcherArgs[];
    tx: DbTransaction;
    force?: boolean;
}): Promise<DatabaseShapePageMarcher[]> {
    if (newItems.length === 0) {
        console.log("No new shape page marchers to create");
        return [];
    }

    const createdSpmIds: Set<number> = new Set();
    for (const newItem of newItems) {
        const existingSpm = await tx.query.shape_page_marchers.findFirst({
            where: and(
                eq(
                    schema.shape_page_marchers.shape_page_id,
                    newItem.shape_page_id,
                ),
                eq(schema.shape_page_marchers.marcher_id, newItem.marcher_id),
            ),
        });

        // If there is an existing item, increment the position_order of all items with a position_order greater than or equal to the existing item's position_order
        if (existingSpm)
            await _incrementPositionOrder({
                tx,
                shapePageId: newItem.shape_page_id,
                positionOrder: newItem.position_order,
            });

        const shapePage = await tx.query.shape_pages.findFirst({
            where: eq(schema.shape_pages.id, newItem.shape_page_id),
        });
        assert(
            shapePage,
            `ShapePage not found for the given shapePageId: ${newItem.shape_page_id}`,
        );

        const shapePagesForThisPage = await tx.query.shape_pages.findMany({
            where: eq(schema.shape_pages.page_id, shapePage.page_id),
        });

        // Check if a shape page marcher already exists for this marcher and page
        const shapePageIds = new Set(shapePagesForThisPage.map((sp) => sp.id));
        let shapePageMarchersForThisMarcher =
            await _getShapePageMarchersByMarcherIds({
                tx,
                marcherIds: new Set([newItem.marcher_id]),
            });

        if (force) {
            const conflictingShapePageIds = shapePageMarchersForThisMarcher
                .filter((spm) => shapePageIds.has(spm.shape_page_id))
                .map((spm) => spm.shape_page_id);
            console.debug(
                `Deleting conflicting shape pages:`,
                conflictingShapePageIds,
            );
            assert(
                conflictingShapePageIds.length === 0,
                `Conflicting shape page ids found for the given marcherId: ${newItem.marcher_id}`,
            );

            await deleteShapePagesInTransaction({
                tx,
                itemIds: new Set(conflictingShapePageIds),
            });

            // Re-fetch the shapePageMarchers for this marcher to ensure they are up to date after deletion
            shapePageMarchersForThisMarcher =
                await _getShapePageMarchersByMarcherIds({
                    tx,
                    marcherIds: new Set([newItem.marcher_id]),
                });
        }

        // Even if force is true, still do this check to prevent erroneous shape page creation
        const marcherAndPageCombinationExists =
            shapePageMarchersForThisMarcher.some((spm) =>
                shapePageIds.has(spm.shape_page_id),
            );

        assert(
            !marcherAndPageCombinationExists,
            `ShapePageMarcher with marcher_id ${newItem.marcher_id} and page_id ${shapePage.page_id} already exists`,
        );

        const createdSpm = await tx
            .insert(schema.shape_page_marchers)
            .values(newItem)
            .returning({ id: schema.shape_page_marchers.id })
            .get();
        createdSpmIds.add(createdSpm.id);
    }

    const createdSpms = await tx.query.shape_page_marchers.findMany({
        where: inArray(
            schema.shape_page_marchers.id,
            Array.from(createdSpmIds),
        ),
    });
    return createdSpms.map(
        realDatabaseShapePageMarcherToDatabaseShapePageMarcher,
    );
}

export const createShapePageMarchers = async ({
    newItems,
    tx,
}: {
    newItems: NewShapePageMarcherArgs[];
    tx: DbTransaction;
}): Promise<DatabaseShapePageMarcher[]> => {
    const createdItems = await transactionWithHistory(
        db,
        "createShapePageMarchers",
        async (tx) => {
            return await createShapePageMarchersInTransaction({
                newItems,
                tx,
            });
        },
    );

    return createdItems.map(
        realDatabaseShapePageMarcherToDatabaseShapePageMarcher,
    );
};

/**
 * Updates existing shape page marchers in the database.
 */
export async function updateShapePageMarchers({
    db,
    modifiedItems,
}: {
    db: DbConnection;
    modifiedItems: ModifiedShapePageMarcherArgs[];
}): Promise<DatabaseShapePageMarcher[]> {
    const transactionResult = await transactionWithHistory(
        db,
        "updateShapePageMarchers",
        async (tx) => {
            return await updateShapePageMarchersInTransaction({
                modifiedItems,
                tx,
            });
        },
    );
    return transactionResult;
}

/**
 * Updates existing shapePageMarchers in the database.
 *
 * When updating an item's position_order, the position_order of the item is incremented by 1 for all items with a position_order greater than or equal to the updated item's position_order.
 * E.g. [a:1,b:2,c:3,d:4,e:5] when updating c to position_order 5 becomes [a:1,b:2,d:4,c:5,e:6]
 *
 * @param tx The database transaction
 * @param modifiedItems Array of ModifiedShapePageMarcherArgs containing id and optional name/notes updates
 * @returns DatabaseShapePageMarcher[] containing the updated ShapePageMarchers
 */
export const updateShapePageMarchersInTransaction = async ({
    modifiedItems,
    tx,
}: {
    modifiedItems: ModifiedShapePageMarcherArgs[];
    tx: DbTransaction;
}): Promise<DatabaseShapePageMarcher[]> => {
    const realModifiedItems = modifiedItems.map(
        modifiedShapePageMarcherArgsToRealModifiedShapePageMarcherArgs,
    );
    const updatedSpmIds = new Set<number>();

    for (const updatedItem of realModifiedItems) {
        // If the position_order is being updated, increment the position_order of all items with a position_order greater than or equal to the updated item's position_order
        if (updatedItem.position_order !== undefined) {
            const itemToUpdate = await tx.query.shape_page_marchers.findFirst({
                where: eq(schema.shape_page_marchers.id, updatedItem.id),
            });
            assert(
                itemToUpdate,
                `ShapePageMarcher not found for the given id: ${updatedItem.id}`,
            );
            // Check if there is an item with the same position_order and shape_page_id
            const existingItemAtPosition =
                await tx.query.shape_page_marchers.findFirst({
                    where: and(
                        eq(
                            schema.shape_page_marchers.shape_page_id,
                            itemToUpdate.shape_page_id,
                        ),
                        eq(
                            schema.shape_page_marchers.position_order,
                            updatedItem.position_order,
                        ),
                    ),
                    columns: {
                        id: true,
                        position_order: true,
                    },
                });

            // If there is an existing item, increment the position_order of all items with a position_order greater than or equal to the existing item's position_order
            if (existingItemAtPosition)
                // Throws an error if the incrementPositionOrder function fails
                await _incrementPositionOrder({
                    tx,
                    shapePageId: itemToUpdate.shape_page_id,
                    positionOrder: updatedItem.position_order,
                });
        }

        // Update the item
        await tx
            .update(schema.shape_page_marchers)
            .set(updatedItem)
            .where(eq(schema.shape_page_marchers.id, updatedItem.id))
            .returning({ id: schema.shape_page_marchers.id })
            .get();
    }

    const updatedItems = await tx.query.shape_page_marchers.findMany({
        where: inArray(
            schema.shape_page_marchers.id,
            Array.from(updatedSpmIds),
        ),
    });

    // Flatten the order of the shape page marchers
    // Make a set so that we don't have to iterate over the same shape page ids multiple times
    const shapePageIdsThatWereModified = new Set<number>(
        updatedItems.map((spm) => spm.shape_page_id),
    );
    for (const shapePageId of shapePageIdsThatWereModified)
        await _flattenOrder({ tx, shapePageId });

    return updatedItems.map(
        realDatabaseShapePageMarcherToDatabaseShapePageMarcher,
    );
};

/**
 * Deletes shape page marchers from the database.
 */
export async function deleteShapePageMarchers({
    itemIds,
    db,
}: {
    itemIds: Set<number>;
    db: DbConnection;
}): Promise<DatabaseShapePageMarcher[]> {
    if (itemIds.size === 0) return [];

    const response = await transactionWithHistory(
        db,
        "deleteShapePageMarchers",
        async (tx) => {
            return await deleteShapePageMarchersInTransaction({
                itemIds,
                tx,
            });
        },
    );
    return response;
}

export const deleteShapePageMarchersInTransaction = async ({
    itemIds,
    tx,
}: {
    itemIds: Set<number>;
    tx: DbTransaction;
}): Promise<DatabaseShapePageMarcher[]> => {
    const deletedItems = await tx
        .delete(schema.shape_page_marchers)
        .where(inArray(schema.shape_page_marchers.id, Array.from(itemIds)))
        .returning();

    if (deletedItems && deletedItems.length > 0) {
        // flatten the order of the shape page marchers
        // Make a set so that we don't have to iterate over the same shape page ids multiple times

        const shapePageIdsThatWereAffected = new Set<number>(
            deletedItems.map((spm) => spm.shape_page_id),
        );
        for (const itemId of shapePageIdsThatWereAffected)
            await _flattenOrder({
                tx,
                shapePageId: itemId,
            });
    }

    return deletedItems.map(
        realDatabaseShapePageMarcherToDatabaseShapePageMarcher,
    );
};
