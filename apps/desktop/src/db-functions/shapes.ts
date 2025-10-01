import { eq, inArray, isNull } from "drizzle-orm";
import {
    DbConnection,
    DbTransaction,
    transactionWithHistory,
} from "@/db-functions";
import { schema } from "@/global/database/db";

/** How a shape is represented in the database */
export interface DatabaseShape {
    id: number;
    name: string | null;
    created_at: string;
    updated_at: string;
    notes: string | null;
}

// Only do this if it's needed to convert the real database values to something else
// I.e. integer -> boolean in sqlite
type RealDatabaseShape = typeof schema.shapes.$inferSelect;

export const realDatabaseShapeToDatabaseShape = (
    item: RealDatabaseShape,
): DatabaseShape => {
    return {
        ...item,
        // Add any necessary transformations
    };
};

export interface NewShapeArgs {
    name?: string | null;
    notes?: string | null;
}

interface RealNewShapeArgs {
    name?: string | null;
    notes?: string | null;
}

const newShapeArgsToRealNewShapeArgs = (
    args: NewShapeArgs,
): RealNewShapeArgs => {
    return {
        ...args,
        // Add any necessary transformations
    };
};

export interface ModifiedShapeArgs {
    id: number;
    name?: string | null;
    notes?: string | null;
}

interface RealModifiedShapeArgs {
    id: number;
    name?: string | null;
    notes?: string | null;
}

const modifiedShapeArgsToRealModifiedShapeArgs = (
    args: ModifiedShapeArgs,
): RealModifiedShapeArgs => {
    return {
        ...args,
        // Add any necessary transformations
    };
};

/**
 * Gets all shapes from the database.
 */
export async function getShapes({
    db,
}: {
    db: DbConnection;
}): Promise<DatabaseShape[]> {
    const result = await db.query.shapes.findMany();
    return result.map(realDatabaseShapeToDatabaseShape);
}

/**
 * Gets a single shape by ID.
 */
export async function getShapeById({
    db,
    id,
}: {
    db: DbConnection;
    id: number;
}): Promise<DatabaseShape | undefined> {
    const result = await db.query.shapes.findFirst({
        where: eq(schema.shapes.id, id),
    });
    return result ? realDatabaseShapeToDatabaseShape(result) : undefined;
}

/**
 * Creates new shapes in the database.
 */
export async function createShapes({
    newItems,
    db,
}: {
    newItems: NewShapeArgs[];
    db: DbConnection;
}): Promise<DatabaseShape[]> {
    if (newItems.length === 0) {
        console.log("No new shapes to create");
        return [];
    }

    const transactionResult = await transactionWithHistory(
        db,
        "createShapes",
        async (tx) => {
            return await createShapesInTransaction({
                newItems,
                tx,
            });
        },
    );
    return transactionResult;
}

export const createShapesInTransaction = async ({
    newItems,
    tx,
}: {
    newItems: NewShapeArgs[];
    tx: DbTransaction;
}): Promise<DatabaseShape[]> => {
    const createdItems = await tx
        .insert(schema.shapes)
        .values(newItems.map(newShapeArgsToRealNewShapeArgs))
        .returning();

    return createdItems.map(realDatabaseShapeToDatabaseShape);
};

/**
 * Updates existing shapes in the database.
 */
export async function updateShapes({
    db,
    modifiedItems,
}: {
    db: DbConnection;
    modifiedItems: ModifiedShapeArgs[];
}): Promise<DatabaseShape[]> {
    const transactionResult = await transactionWithHistory(
        db,
        "updateShapes",
        async (tx) => {
            return await updateShapesInTransaction({
                modifiedItems,
                tx,
            });
        },
    );
    return transactionResult;
}

export const updateShapesInTransaction = async ({
    modifiedItems,
    tx,
}: {
    modifiedItems: ModifiedShapeArgs[];
    tx: DbTransaction;
}): Promise<DatabaseShape[]> => {
    const updatedItems: DatabaseShape[] = [];
    const realModifiedItems = modifiedItems.map(
        modifiedShapeArgsToRealModifiedShapeArgs,
    );

    for (const modifiedItem of realModifiedItems) {
        const { id, ...updateData } = modifiedItem;
        const updatedItem = await tx
            .update(schema.shapes)
            .set(updateData)
            .where(eq(schema.shapes.id, id))
            .returning()
            .get();
        updatedItems.push(realDatabaseShapeToDatabaseShape(updatedItem));
    }

    return updatedItems;
};

/**
 * Deletes shapes from the database.
 */
export async function deleteShapes({
    itemIds,
    db,
}: {
    itemIds: Set<number>;
    db: DbConnection;
}): Promise<DatabaseShape[]> {
    if (itemIds.size === 0) return [];

    const response = await transactionWithHistory(
        db,
        "deleteShapes",
        async (tx) => {
            return await deleteShapesInTransaction({
                itemIds,
                tx,
            });
        },
    );
    return response;
}

export const deleteShapesInTransaction = async ({
    itemIds,
    tx,
}: {
    itemIds: Set<number>;
    tx: DbTransaction;
}): Promise<DatabaseShape[]> => {
    const deletedItems = await tx
        .delete(schema.shapes)
        .where(inArray(schema.shapes.id, Array.from(itemIds)))
        .returning();

    return deletedItems.map(realDatabaseShapeToDatabaseShape);
};

/**
 * Gets all shapes that have no shape pages referencing them
 *
 * @param tx The database transaction
 * @returns DatabaseResponse containing the shapes with no shape pages referencing them
 */
export async function getShapesWithNoShapePages({
    tx,
}: {
    tx: DbTransaction;
}): Promise<DatabaseShape[]> {
    const shapes = await tx.select().from(schema.shapes).all();
    const usedShapeIdsResult = await tx
        .selectDistinct({ shape_id: schema.shape_pages.shape_id })
        .from(schema.shape_pages)
        .all();
    const usedShapeIds = new Set(usedShapeIdsResult.map((s) => s.shape_id));
    const shapesWithNoShapePages = shapes.filter(
        (s) => !usedShapeIds.has(s.id),
    );
    return shapesWithNoShapePages;
}
