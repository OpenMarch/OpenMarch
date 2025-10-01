import { eq, inArray, and } from "drizzle-orm";
import {
    createShapePageMarchersInTransaction,
    createShapesInTransaction,
    DbConnection,
    DbTransaction,
    deleteShapesInTransaction,
    getShapesWithNoShapePages,
    marcherPagesByPageId,
    ModifiedMarcherPageArgs,
    transactionWithHistory,
    updateMarcherPagesInTransaction,
} from "@/db-functions";
import { schema } from "@/global/database/db";
import { assert } from "@/utilities/utils";

type MarcherCoordinates = {
    marcher_id: number;
    x: number;
    y: number;
};

/** How a shape page is represented in the database */
export interface DatabaseShapePage {
    id: number;
    shape_id: number;
    page_id: number;
    svg_path: string;
    created_at: string;
    updated_at: string;
    notes: string | null;
}

export interface ShapePage extends DatabaseShapePage {}

// Only do this if it's needed to convert the real database values to something else
// I.e. integer -> boolean in sqlite
type RealDatabaseShapePage = typeof schema.shape_pages.$inferSelect;

export const realDatabaseShapePageToDatabaseShapePage = (
    item: RealDatabaseShapePage,
): DatabaseShapePage => {
    return {
        ...item,
        // Add any necessary transformations
    };
};

export interface NewShapePageArgs {
    marcher_coordinates: MarcherCoordinates[];
    shape_id?: number;
    page_id: number;
    svg_path: string;
    notes?: string | null;
}

export interface ModifiedShapePageArgs {
    marcher_coordinates?: MarcherCoordinates[];
    id: number;
    svg_path?: string;
    notes?: string | null;
}

interface RealModifiedShapePageArgs extends ModifiedShapePageArgs {}

const modifiedShapePageArgsToRealModifiedShapePageArgs = (
    args: ModifiedShapePageArgs,
): RealModifiedShapePageArgs => {
    return {
        ...args,
        // Add any necessary transformations
    };
};

/**
 * Gets all shape pages from the database.
 */
export async function getShapePages({
    db,
}: {
    db: DbConnection;
}): Promise<DatabaseShapePage[]> {
    const result = await db.query.shape_pages.findMany();
    return result.map(realDatabaseShapePageToDatabaseShapePage);
}

/**
 * Gets a single shape page by ID.
 */
export async function getShapePageById({
    db,
    id,
}: {
    db: DbConnection;
    id: number;
}): Promise<DatabaseShapePage | undefined> {
    const result = await db.query.shape_pages.findFirst({
        where: eq(schema.shape_pages.id, id),
    });
    return result
        ? realDatabaseShapePageToDatabaseShapePage(result)
        : undefined;
}

/**
 * Gets shape pages by page ID.
 */
export async function getShapePagesByPageId({
    db,
    pageId,
}: {
    db: DbConnection;
    pageId: number;
}): Promise<DatabaseShapePage[]> {
    const result = await db.query.shape_pages.findMany({
        where: eq(schema.shape_pages.page_id, pageId),
    });
    return result.map(realDatabaseShapePageToDatabaseShapePage);
}

/**
 * Updates the MarcherPages associated with the provided ShapePage.
 * @param db The database instance
 * @param shapePage The ShapePage for which to update the associated MarcherPages
 * @throws Error if there is an issue retrieving the ShapePageMarchers or updating the MarcherPages
 */
export async function _updateChildMarcherPages({
    tx,
    pageId,
    marcherCoordinates,
}: {
    tx: DbTransaction;
    pageId: number;
    marcherCoordinates: {
        marcher_id: number;
        x: number;
        y: number;
    }[];
}) {
    const marcherPageUpdates: ModifiedMarcherPageArgs[] =
        marcherCoordinates.map((coordinate) => {
            return {
                marcher_id: coordinate.marcher_id,
                page_id: pageId,
                x: coordinate.x,
                y: coordinate.y,
            };
        });

    await updateMarcherPagesInTransaction({
        tx,
        modifiedMarcherPages: marcherPageUpdates,
    });
}

/**
 * Creates new shape pages in the database.
 */
export async function createShapePages({
    newItems,
    db,
}: {
    newItems: NewShapePageArgs[];
    db: DbConnection;
}): Promise<DatabaseShapePage[]> {
    if (newItems.length === 0) {
        console.log("No new shape pages to create");
        return [];
    }

    const transactionResult = await transactionWithHistory(
        db,
        "createShapePages",
        async (tx) => {
            return await createShapePagesInTransaction({
                newItems,
                tx,
            });
        },
    );
    return transactionResult;
}

export const createShapePagesInTransaction = async ({
    newItems,
    tx,
}: {
    newItems: NewShapePageArgs[];
    tx: DbTransaction;
}): Promise<DatabaseShapePage[]> => {
    const output: DatabaseShapePage[] = [];
    for (const newShapePage of newItems) {
        let shapeIdToUse = newShapePage.shape_id;

        // If no shape_id is provided, create a new shape
        if (shapeIdToUse === undefined) {
            const createdShapeResponse = await createShapesInTransaction({
                tx,
                newItems: [{}],
            });
            assert(createdShapeResponse.length === 1, "Failed to create shape");
            shapeIdToUse = createdShapeResponse[0].id;
        }

        // Create the ShapePage
        const { marcher_coordinates, ...shapePageToCreate } = {
            ...newShapePage,
            shape_id: shapeIdToUse,
        };
        const createdShapePage = await tx
            .insert(schema.shape_pages)
            .values(shapePageToCreate)
            .returning()
            .get();
        assert(createdShapePage, "Failed to create shape page");
        output.push(realDatabaseShapePageToDatabaseShapePage(createdShapePage));

        // Create needed ShapePageMarchers
        const marcherIds = newShapePage.marcher_coordinates.map(
            (coordinate) => coordinate.marcher_id,
        );
        const spmsToCreate = marcherIds.map((marcher_id, i) => {
            return {
                shape_page_id: createdShapePage.id,
                marcher_id,
                position_order: i,
            };
        });
        await createShapePageMarchersInTransaction({
            tx,
            newItems: spmsToCreate,
        });

        // Update MarcherPages with new coordinates
        await _updateChildMarcherPages({
            tx,
            pageId: newShapePage.page_id,
            marcherCoordinates: newShapePage.marcher_coordinates,
        });
    }

    return output;
};
/**
 * Updates existing shape pages in the database.
 */
export async function updateShapePages({
    db,
    modifiedItems,
}: {
    db: DbConnection;
    modifiedItems: ModifiedShapePageArgs[];
}): Promise<DatabaseShapePage[]> {
    const transactionResult = await transactionWithHistory(
        db,
        "updateShapePages",
        async (tx) => {
            return await updateShapePagesInTransaction({
                modifiedItems,
                tx,
            });
        },
    );
    return transactionResult;
}

export const updateShapePagesInTransaction = async ({
    modifiedItems,
    tx,
}: {
    modifiedItems: ModifiedShapePageArgs[];
    tx: DbTransaction;
}): Promise<DatabaseShapePage[]> => {
    const realModifiedItems = modifiedItems.map(
        modifiedShapePageArgsToRealModifiedShapePageArgs,
    );
    const updatedShapePageIds = new Set<number>();

    for (const updatedShapePage of realModifiedItems) {
        const { marcher_coordinates, ...updatedShapePageToUse } =
            updatedShapePage;
        // Update the ShapePage in the database
        await tx
            .update(schema.shape_pages)
            .set(updatedShapePageToUse)
            .where(eq(schema.shape_pages.id, updatedShapePage.id));
        updatedShapePageIds.add(updatedShapePage.id);

        // If the SVG path was updated, update the MarcherShapes that are associated with this ShapePage
        if (updatedShapePage.svg_path !== undefined) {
            if (!updatedShapePage.marcher_coordinates) {
                throw new Error(
                    "New SVG path was set but no marcher coordinates were provided.",
                );
            }
            const thisShapePage = await tx.query.shape_pages.findFirst({
                where: eq(schema.shape_pages.id, updatedShapePage.id),
                columns: {
                    id: true,
                    page_id: true,
                },
            });
            assert(
                thisShapePage,
                `Failed to get this ShapePage with id ${updatedShapePage.id}`,
            );
            await _updateChildMarcherPages({
                tx,
                pageId: thisShapePage.page_id,
                marcherCoordinates: updatedShapePage.marcher_coordinates,
            });
        }
    }

    const allModifiedShapePages = await tx.query.shape_pages.findMany({
        where: inArray(schema.shape_pages.id, Array.from(updatedShapePageIds)),
    });

    return allModifiedShapePages.map(realDatabaseShapePageToDatabaseShapePage);
};

/**
 * Deletes shape pages from the database.
 */
export async function deleteShapePages({
    itemIds,
    db,
}: {
    itemIds: Set<number>;
    db: DbConnection;
}): Promise<DatabaseShapePage[]> {
    if (itemIds.size === 0) return [];

    const response = await transactionWithHistory(
        db,
        "deleteShapePages",
        async (tx) => {
            return await deleteShapePagesInTransaction({
                itemIds,
                tx,
            });
        },
    );
    return response;
}

export const deleteShapePagesInTransaction = async ({
    itemIds,
    tx,
}: {
    itemIds: Set<number>;
    tx: DbTransaction;
}): Promise<DatabaseShapePage[]> => {
    const deletedItems = await tx
        .delete(schema.shape_pages)
        .where(inArray(schema.shape_pages.id, Array.from(itemIds)))
        .returning();

    // Check if the shape that belonged to the deleted shapePage still has any shapePages referencing it
    const shapesWithNoShapePages = await getShapesWithNoShapePages({
        tx,
    });
    if (shapesWithNoShapePages.length > 0) {
        console.debug(
            "Deleting shapes with no shape pages:",
            shapesWithNoShapePages.map((s) => s.id),
        );
        await deleteShapesInTransaction({
            itemIds: new Set(shapesWithNoShapePages.map((s) => s.id)),
            tx,
        });
    }

    return deletedItems.map(realDatabaseShapePageToDatabaseShapePage);
};

export async function copyShapePageToPage({
    db,
    shapePageId,
    targetPageId,
}: {
    db: DbConnection;
    shapePageId: number;
    targetPageId: number;
}): Promise<DatabaseShapePage> {
    const transactionResult = await transactionWithHistory(
        db,
        "copyShapePageToPage",
        async (tx) => {
            return await copyShapePageToPageInTransaction({
                shapePageId,
                targetPageId,
                tx,
            });
        },
    );
    return transactionResult;
}

/**
 * Copies a ShapePage from one page to another.
 *
 * @param db - The database instance.
 * @param shapePageId - The ID of the ShapePage to be copied.
 * @param targetPageId - The ID of the page to copy the ShapePage to.
 * @param force - If a marcher on the target page already belongs to a shape, delete that shapePage to allow the creation of the new one.
 * @returns A DatabaseResponse containing the newly created ShapePage, or an error if the operation failed.
 */
export const copyShapePageToPageInTransaction = async ({
    shapePageId,
    targetPageId,
    tx,
}: {
    shapePageId: number;
    targetPageId: number;
    tx: DbTransaction;
}): Promise<DatabaseShapePage> => {
    const thisShapePage = await tx.query.shape_pages.findFirst({
        where: eq(schema.shape_pages.id, shapePageId),
    });
    assert(
        thisShapePage,
        `Failed to get this ShapePage with id ${shapePageId}`,
    );

    const theseSpms = await tx.query.shape_page_marchers.findMany({
        where: eq(schema.shape_page_marchers.shape_page_id, shapePageId),
    });
    const marcherIds = new Set(theseSpms.map((spm) => spm.marcher_id));
    const marcherPagesForTargetPage = await marcherPagesByPageId({
        db: tx,
        pageId: targetPageId,
    });
    const marcherPagesToUseFromTargetPage = marcherPagesForTargetPage.filter(
        (mp) => marcherIds.has(mp.marcher_id),
    );
    if (marcherPagesToUseFromTargetPage.some((mp) => mp.isLocked)) {
        throw new Error(
            `Cannot copy shape page to page because it contains locked marchers. Reasons: ${marcherPagesToUseFromTargetPage
                .map((mp) => `marcher_${mp.marcher_id}: ${mp.lockedReason}`)
                .join("\n")}`,
        );
    }
    const positionOrderByMarcherId = new Map(
        theseSpms.map((spm) => [spm.marcher_id, spm.position_order]),
    );
    const sourceMarcherPages = await tx.query.marcher_pages.findMany({
        where: and(
            eq(schema.marcher_pages.page_id, thisShapePage.page_id),
            inArray(schema.marcher_pages.marcher_id, Array.from(marcherIds)),
        ),
    });
    const marcherCoordinates: MarcherCoordinates[] = sourceMarcherPages
        .map((mp) => ({
            marcher_id: mp.marcher_id,
            x: mp.x,
            y: mp.y,
        }))
        .sort((a, b) => {
            const spmA = positionOrderByMarcherId.get(a.marcher_id);
            const spmB = positionOrderByMarcherId.get(b.marcher_id);
            if (spmA == null || spmB == null)
                throw new Error(
                    `Failed to get ShapePageMarcher for marcher ${spmA ? "" : a.marcher_id} ${spmB ? "" : b.marcher_id}`,
                );
            return spmA - spmB;
        });
    const newShapePage: NewShapePageArgs = {
        shape_id: thisShapePage.shape_id,
        page_id: targetPageId,
        marcher_coordinates: marcherCoordinates,
        svg_path: thisShapePage.svg_path,
        notes: thisShapePage.notes,
    };
    const createdShapePage = await createShapePagesInTransaction({
        newItems: [newShapePage],
        tx,
    });
    assert(
        createdShapePage.length === 1,
        `Failed to create shape page. ${createdShapePage}`,
    );

    return createdShapePage[0];
};
