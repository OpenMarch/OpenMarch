import { eq, gt, inArray, and, isNotNull, gte, lt } from "drizzle-orm";
import {
    createBeatsInTransaction,
    DatabaseBeat,
    DbConnection,
    DbTransaction,
    deleteBeatsInTransaction,
    NewBeatArgs,
    transactionWithHistory,
} from "@/db-functions";
import { schema } from "@/global/database/db";

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
        console.debug("No new measures to create");
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

    // Check if any of the measures actually exist before using transactionWithHistory
    const existingMeasures = await db.query.measures.findMany({
        where: inArray(schema.measures.id, Array.from(itemIds)),
    });

    if (existingMeasures.length === 0) return [];

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

/**
 * Mutation to create beats with an accompanying measure at the first created beat.
 *
 * To create multiple measures, use the quantity parameter.
 *
 * ```ts
 * // Creates one measure with two beats
 * createMeasures({
 *   beatArgs: [{ duration: 1 }, { duration: 1 }],
 *   quantity: 1,
 *   startingPosition: 1,
 * })
 *
 * // Creates four measures with two beats each, eight total beats created
 * createMeasures({
 *   beatArgs: [{ duration: 1 }, { duration: 1 }],
 *   quantity: 4,
 *   startingPosition: 1,
 * })
 * ```
 */
export const createMeasuresAndBeatsInTransaction = async ({
    beatArgs,
    startingPosition,
    quantity = 1,
    tx,
}: {
    beatArgs: Omit<NewBeatArgs, "include_in_measure">[];
    startingPosition: number;
    quantity?: number;
    tx: DbTransaction;
}): Promise<{
    createdMeasures: DatabaseMeasure[];
    createdBeats: DatabaseBeat[];
}> => {
    const allCreatedMeasures: DatabaseMeasure[] = [];
    const allCreatedBeats: DatabaseBeat[] = [];
    for (let i = 0; i < quantity; i++) {
        const newBeats = await createBeatsInTransaction({
            tx,
            newBeats: beatArgs.map((b) => ({
                ...b,
                include_in_measure: true,
            })),
            // Don't need to increment starting position, as we're creating the same number of beats each time
            startingPosition,
        });
        if (newBeats.length === 0) throw new Error("Failed to create beats");

        const firstCreatedBeat = newBeats.reduce((acc, beat) => {
            return acc.position < beat.position ? acc : beat;
        }, newBeats[0]);

        const newMeasures = await createMeasuresInTransaction({
            tx,
            newItems: [
                {
                    start_beat: firstCreatedBeat.id,
                    rehearsal_mark: null,
                    notes: null,
                },
            ],
        });
        allCreatedMeasures.push(...newMeasures);
        allCreatedBeats.push(...newBeats);
    }
    return {
        createdMeasures: allCreatedMeasures,
        createdBeats: allCreatedBeats,
    };
};

/**
 * @param db - The database connection or transaction
 * @param measureId - The ID of the measure to get the beat IDs for
 * @returns A set of beat IDs that are in the measure
 */
export const getBeatIdsByMeasureId = async ({
    db,
    measureId,
}: {
    db: DbConnection | DbTransaction;
    measureId: number;
}): Promise<Set<number>> => {
    const measureTimingObject = await db
        .select()
        .from(schema.timing_objects)
        .where(eq(schema.timing_objects.measure_id, measureId))
        .get();
    if (measureTimingObject == null)
        throw new Error(`Measure ID ${measureId} does not exist`);

    const nextMeasureTimingObject = await db
        .select()
        .from(schema.timing_objects)
        .where(
            and(
                gt(
                    schema.timing_objects.position,
                    measureTimingObject.position,
                ),
                isNotNull(schema.timing_objects.measure_id),
            ),
        )
        .get();

    // If there is no next measure, return all beats for the rest of the show
    // If there is a next measure, return all beats for the current measure up to the next measure
    const whereClauses =
        nextMeasureTimingObject == null
            ? gte(schema.beats.position, measureTimingObject.position)
            : and(
                  gte(schema.beats.position, measureTimingObject.position),
                  lt(schema.beats.position, nextMeasureTimingObject.position),
              );
    const beatIds = await db
        .select({ beat_id: schema.beats.id })
        .from(schema.beats)
        .where(whereClauses)
        .all();

    return new Set(beatIds.map((b) => b.beat_id));
};

export const deleteMeasuresAndBeatsInTransaction = async ({
    measureIds,
    tx,
}: {
    measureIds: Set<number>;
    tx: DbTransaction;
}): Promise<void> => {
    const fetchedBeatIds: number[] = [];

    for (const measureId of measureIds) {
        const beatIds = await getBeatIdsByMeasureId({
            db: tx,
            measureId,
        });
        fetchedBeatIds.push(...Array.from(beatIds));
    }
    const uniqueBeatIds = new Set(fetchedBeatIds);

    // delete measures first to avoid foreign key constraints
    await deleteMeasuresInTransaction({
        itemIds: measureIds,
        tx,
    });

    // delete beats
    await deleteBeatsInTransaction({
        beatIds: uniqueBeatIds,
        tx,
    });
};
