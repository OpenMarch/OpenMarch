import { eq, inArray, and } from "drizzle-orm";
import {
    DbConnection,
    DbTransaction,
    transactionWithHistory,
} from "@/db-functions";
import { schema } from "@/global/database/db";

const { measures } = schema;

/** How a measure is represented in the database */
export interface DatabaseMeasure {
    id: number;
    start_beat: number;
    rehearsal_mark: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

// Only do this if it's needed to convert the real database values to something else
// I.e. integer -> boolean in sqlite
type RealDatabaseMeasure = typeof schema.measures.$inferSelect;

export const realDatabaseMeasureToDatabaseMeasure = (
    item: RealDatabaseMeasure,
): DatabaseMeasure => {
    return {
        ...item,
        // Add any necessary transformations
    };
};

export interface NewMeasureArgs {
    start_beat: number;
    rehearsal_mark?: string | null;
    notes?: string | null;
}

interface RealNewMeasureArgs {
    start_beat: number;
    rehearsal_mark?: string | null;
    notes?: string | null;
}

const newMeasureArgsToRealNewMeasureArgs = (
    args: NewMeasureArgs,
): RealNewMeasureArgs => {
    return {
        ...args,
        // Add any necessary transformations
    };
};

export interface ModifiedMeasureArgs {
    id: number;
    start_beat?: number;
    rehearsal_mark?: string | null;
    notes?: string | null;
}

interface RealModifiedMeasureArgs {
    id: number;
    start_beat?: number;
    rehearsal_mark?: string | null;
    notes?: string | null;
}

const modifiedMeasureArgsToRealModifiedMeasureArgs = (
    args: ModifiedMeasureArgs,
): RealModifiedMeasureArgs => {
    return {
        ...args,
        // Add any necessary transformations
    };
};

/**
 * Gets all measures from the database.
 */
export async function getMeasures({
    db,
}: {
    db: DbConnection;
}): Promise<DatabaseMeasure[]> {
    const result = await db.query.measures.findMany();
    return result.map(realDatabaseMeasureToDatabaseMeasure);
}

/**
 * Gets a single measure by ID.
 */
export async function getMeasureById({
    db,
    id,
}: {
    db: DbConnection;
    id: number;
}): Promise<DatabaseMeasure | undefined> {
    const result = await db.query.measures.findFirst({
        where: eq(schema.measures.id, id),
    });
    return result ? realDatabaseMeasureToDatabaseMeasure(result) : undefined;
}

/**
 * Gets measures by start beat.
 */
export async function getMeasuresByStartBeat({
    db,
    startBeat,
}: {
    db: DbConnection;
    startBeat: number;
}): Promise<DatabaseMeasure[]> {
    const result = await db.query.measures.findMany({
        where: eq(schema.measures.start_beat, startBeat),
    });
    return result.map(realDatabaseMeasureToDatabaseMeasure);
}

/**
 * Creates new measures in the database.
 */
export async function createMeasures({
    newItems,
    db,
}: {
    newItems: NewMeasureArgs[];
    db: DbConnection;
}): Promise<DatabaseMeasure[]> {
    if (newItems.length === 0) {
        console.log("No new measures to create");
        return [];
    }

    const transactionResult = await transactionWithHistory(
        db,
        "createMeasures",
        async (tx) => {
            return await createMeasuresInTransaction({
                newItems,
                tx,
            });
        },
    );
    return transactionResult;
}

export const createMeasuresInTransaction = async ({
    newItems,
    tx,
}: {
    newItems: NewMeasureArgs[];
    tx: DbTransaction;
}): Promise<DatabaseMeasure[]> => {
    const createdItems = await tx
        .insert(schema.measures)
        .values(newItems.map(newMeasureArgsToRealNewMeasureArgs))
        .returning();

    return createdItems.map(realDatabaseMeasureToDatabaseMeasure);
};

/**
 * Updates existing measures in the database.
 */
export async function updateMeasures({
    db,
    modifiedItems,
}: {
    db: DbConnection;
    modifiedItems: ModifiedMeasureArgs[];
}): Promise<DatabaseMeasure[]> {
    const transactionResult = await transactionWithHistory(
        db,
        "updateMeasures",
        async (tx) => {
            return await updateMeasuresInTransaction({
                modifiedItems,
                tx,
            });
        },
    );
    return transactionResult;
}

export const updateMeasuresInTransaction = async ({
    modifiedItems,
    tx,
}: {
    modifiedItems: ModifiedMeasureArgs[];
    tx: DbTransaction;
}): Promise<DatabaseMeasure[]> => {
    const updatedItems: DatabaseMeasure[] = [];
    const realModifiedItems = modifiedItems.map(
        modifiedMeasureArgsToRealModifiedMeasureArgs,
    );

    for (const modifiedItem of realModifiedItems) {
        const { id, ...updateData } = modifiedItem;
        const updatedItem = await tx
            .update(schema.measures)
            .set(updateData)
            .where(eq(schema.measures.id, id))
            .returning()
            .get();
        updatedItems.push(realDatabaseMeasureToDatabaseMeasure(updatedItem));
    }

    return updatedItems;
};

/**
 * Deletes measures from the database.
 */
export async function deleteMeasures({
    itemIds,
    db,
}: {
    itemIds: Set<number>;
    db: DbConnection;
}): Promise<DatabaseMeasure[]> {
    if (itemIds.size === 0) return [];

    const response = await transactionWithHistory(
        db,
        "deleteMeasures",
        async (tx) => {
            return await deleteMeasuresInTransaction({
                itemIds,
                tx,
            });
        },
    );
    return response;
}

export const deleteMeasuresInTransaction = async ({
    itemIds,
    tx,
}: {
    itemIds: Set<number>;
    tx: DbTransaction;
}): Promise<DatabaseMeasure[]> => {
    const deletedItems = await tx
        .delete(schema.measures)
        .where(inArray(schema.measures.id, Array.from(itemIds)))
        .returning();

    return deletedItems.map(realDatabaseMeasureToDatabaseMeasure);
};
