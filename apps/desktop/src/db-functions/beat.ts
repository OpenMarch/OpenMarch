import { eq, gt, asc, desc, inArray } from "drizzle-orm";
import {
    DbConnection,
    DbTransaction,
    transactionWithHistory,
} from "@/db-functions";
import { schema } from "@/global/database/db";

export const FIRST_BEAT_ID = 0;

/** How a beat is represented in the database */
export interface DatabaseBeat {
    /** Unique identifier for the beat */
    id: number;
    /** Duration of the beat in seconds */
    duration: number;
    /** Whether the beat should be included in a measure */
    include_in_measure: boolean;
    /** Optional notes or description for the beat */
    notes: string | null;
    /** Position of the beat in the sequence */
    position: number;
    /** Timestamp when the beat was created */
    created_at: string;
    /** Timestamp when the beat was last updated */
    updated_at: string;
}

type RealDatabaseBeat = typeof schema.beats.$inferSelect;

export const realDatabaseBeatToDatabaseBeat = (
    beat: RealDatabaseBeat,
): DatabaseBeat => {
    return {
        ...beat,
        include_in_measure: beat.include_in_measure === 1,
    };
};

export interface NewBeatArgs {
    duration: number;
    include_in_measure: boolean;
    notes?: string | null;
}

interface RealNewBeatArgs {
    duration: number;
    include_in_measure: 0 | 1;
    notes?: string | null;
    position: number;
}

const newBeatArgsToRealNewBeatArgs = (
    args: NewBeatArgs,
    position: number,
): RealNewBeatArgs => {
    return {
        ...args,
        include_in_measure: args.include_in_measure ? 1 : 0,
        position,
    };
};

export interface ModifiedBeatArgs {
    id: number;
    duration?: number;
    include_in_measure?: boolean;
    notes?: string | null;
    position?: number;
}

interface RealModifiedBeatArgs {
    id: number;
    duration?: number;
    include_in_measure?: 0 | 1;
    notes?: string | null;
    position?: number;
}

const modifiedBeatArgsToRealModifiedBeatArgs = (
    args: ModifiedBeatArgs,
): RealModifiedBeatArgs => {
    return {
        ...args,
        ...(args.include_in_measure === undefined
            ? {}
            : {
                  include_in_measure: (args.include_in_measure ? 1 : 0) as
                      | 0
                      | 1,
              }),
    } as RealModifiedBeatArgs;
};

/**
 * Gets all beats from the database.
 *
 * @param db The database connection
 * @returns List of all beats
 */
export async function getBeats({
    db,
}: {
    db: DbConnection;
}): Promise<DatabaseBeat[]> {
    const result = await db.query.beats.findMany({
        orderBy: asc(schema.beats.position),
    });
    return result.map(realDatabaseBeatToDatabaseBeat);
}

/**
 * Gets a single beat by its ID.
 *
 * @param db The database connection
 * @param beatId The ID of the beat to retrieve
 * @returns The beat or undefined if not found
 */
export async function getBeat({
    db,
    beatId,
}: {
    db: DbConnection;
    beatId: number;
}): Promise<DatabaseBeat | undefined> {
    const result = await db.query.beats.findFirst({
        where: eq(schema.beats.id, beatId),
    });
    return result ? realDatabaseBeatToDatabaseBeat(result) : undefined;
}

/**
 * Gets the first or last beat from the database.
 *
 * @param db The database connection
 * @param isFirstBeat True to get the first beat, false to get the last beat
 * @returns The beat or null if no beats exist
 */
export async function getFirstOrLastBeat({
    db,
    isFirstBeat,
}: {
    db: DbConnection;
    isFirstBeat: boolean;
}): Promise<DatabaseBeat | null> {
    const result = await db.query.beats.findFirst({
        orderBy: isFirstBeat
            ? asc(schema.beats.position)
            : desc(schema.beats.position),
    });
    return result ? realDatabaseBeatToDatabaseBeat(result) : null;
}

/**
 * Shifts all beats that are on or after the specified starting position by the given shift amount.
 *
 * @param db The database connection
 * @param startingPosition The starting position of the beats to shift
 * @param shiftAmount The amount to shift the beats by
 * @returns List of updated beats
 */
export async function shiftBeats({
    db,
    startingPosition,
    shiftAmount,
}: {
    db: DbConnection;
    startingPosition: number;
    shiftAmount: number;
}): Promise<DatabaseBeat[]> {
    if (startingPosition <= 0) {
        throw new Error("Cannot shift beat at position <= 0");
    }
    if (startingPosition + shiftAmount <= 0) {
        throw new Error("Cannot shift beats to any position <= 0");
    }

    const transactionResult = await transactionWithHistory(
        db,
        "shiftBeats",
        async (tx) => {
            return await shiftBeatsInTransaction({
                tx,
                startingPosition,
                shiftAmount,
            });
        },
    );
    return transactionResult;
}

/**
 * Shifts beats within a transaction.
 *
 * Shifts all beats that are on or after the specified starting position by the given shift amount.
 * @param {Object} params - The parameters for shifting the beats.
 * @param {Database.Database} params.db - The database instance to use.
 * @param {number} params.startingPosition - The starting position of the beats to shift.
 * @param {number} params.shiftAmount - The amount to shift the beats by.
 */
const shiftBeatsInTransaction = async ({
    tx,
    startingPosition,
    shiftAmount,
}: {
    tx: DbTransaction;
    startingPosition: number;
    shiftAmount: number;
}): Promise<DatabaseBeat[]> => {
    // Get all beats that need to be shifted
    const beatsToShift = await tx.query.beats.findMany({
        where: gt(schema.beats.position, startingPosition - 1),
        orderBy: desc(schema.beats.position), // Reverse order to prevent unique constraint violations
    });

    const updatedBeats: DatabaseBeat[] = [];

    for (const beat of beatsToShift) {
        const newPosition = beat.position + shiftAmount;
        if (newPosition < 0) {
            throw new Error("Cannot shift beats below 0");
        }

        const updatedBeat = await tx
            .update(schema.beats)
            .set({ position: newPosition })
            .where(eq(schema.beats.id, beat.id))
            .returning()
            .get();

        updatedBeats.push(realDatabaseBeatToDatabaseBeat(updatedBeat));
    }

    return updatedBeats;
};

/**
 * Flattens the position order of the beats in the database.
 * This ensures that the position values are sequential and contiguous.
 *
 * @param db The database connection
 */
export async function flattenOrder({
    db,
}: {
    db: DbConnection;
}): Promise<void> {
    const transactionResult = await transactionWithHistory(
        db,
        "flattenOrder",
        async (tx) => {
            return await flattenOrderInTransaction({ tx });
        },
    );
    return transactionResult;
}

/**
 * Flattens beat positions within a transaction.
 */
const flattenOrderInTransaction = async ({
    tx,
}: {
    tx: DbTransaction;
}): Promise<void> => {
    // Get all beats sorted by position, excluding the first beat
    const sortedBeats = await tx.query.beats.findMany({
        where: gt(schema.beats.id, FIRST_BEAT_ID),
        orderBy: asc(schema.beats.position),
    });

    // Update beats with sequential positions
    for (let i = 0; i < sortedBeats.length; i++) {
        const beat = sortedBeats[i];
        const newPosition = i + 1;

        if (beat.position !== newPosition) {
            await tx
                .update(schema.beats)
                .set({ position: newPosition })
                .where(eq(schema.beats.id, beat.id))
                .returning();
        }
    }
};

/**
 * Creates new beats in the database.
 *
 * @param db The database connection
 * @param newBeats The new beats to create
 * @param startingPosition Optional starting position. If undefined, beats are added to the end
 * @returns List of created beats
 */
export async function createBeats({
    db,
    newBeats,
    startingPosition,
}: {
    db: DbConnection;
    newBeats: NewBeatArgs[];
    startingPosition?: number;
}): Promise<DatabaseBeat[]> {
    if (newBeats.length === 0) {
        console.log("No new beats to create");
        return [];
    }

    const transactionResult = await transactionWithHistory(
        db,
        "createBeats",
        async (tx) => {
            return await createBeatsInTransaction({
                tx,
                newBeats,
                startingPosition,
            });
        },
    );
    return transactionResult;
}

/**
 * Creates beats within a transaction.
 */
export const createBeatsInTransaction = async ({
    tx,
    newBeats,
    startingPosition,
}: {
    tx: DbTransaction;
    newBeats: NewBeatArgs[];
    startingPosition?: number;
}): Promise<DatabaseBeat[]> => {
    // Determine the starting position
    let currentPosition: number;

    if (startingPosition === undefined) {
        const lastBeat = await getFirstOrLastBeat({
            db: tx,
            isFirstBeat: false,
        });
        currentPosition = lastBeat ? lastBeat.position + 1 : 1;
    } else {
        currentPosition = startingPosition + 1;

        // Shift existing beats if needed
        const lastBeat = await getFirstOrLastBeat({
            db: tx,
            isFirstBeat: false,
        });
        if (lastBeat && startingPosition < lastBeat.position) {
            await shiftBeatsInTransaction({
                tx,
                startingPosition: currentPosition,
                shiftAmount: newBeats.length,
            });
        }
    }

    // Create the new beats
    const realNewBeats = newBeats.map((beat, index) =>
        newBeatArgsToRealNewBeatArgs(beat, currentPosition + index),
    );

    const createdBeats = await tx
        .insert(schema.beats)
        .values(realNewBeats)
        .returning();

    return createdBeats.map(realDatabaseBeatToDatabaseBeat);
};

/**
 * Updates beats in the database.
 *
 * @param db The database connection
 * @param modifiedBeats Array of modified beat arguments
 * @returns List of updated beats
 */
export async function updateBeats({
    db,
    modifiedBeats,
}: {
    db: DbConnection;
    modifiedBeats: ModifiedBeatArgs[];
}): Promise<DatabaseBeat[]> {
    // Filter out the first beat
    const filteredBeats = modifiedBeats.filter(
        (beat) => beat.id !== FIRST_BEAT_ID,
    );

    if (filteredBeats.length === 0) {
        console.log("No beats to update (first beat filtered out)");
        return [];
    }

    const transactionResult = await transactionWithHistory(
        db,
        "updateBeats",
        async (tx) => {
            return await updateBeatsInTransaction({
                tx,
                modifiedBeats: filteredBeats,
            });
        },
    );
    return transactionResult;
}

/**
 * Updates beats within a transaction.
 */
export const updateBeatsInTransaction = async ({
    tx,
    modifiedBeats,
}: {
    tx: DbTransaction;
    modifiedBeats: ModifiedBeatArgs[];
}): Promise<DatabaseBeat[]> => {
    const updatedBeats: DatabaseBeat[] = [];
    const realModifiedBeats = modifiedBeats.map(
        modifiedBeatArgsToRealModifiedBeatArgs,
    );

    for (const modifiedBeat of realModifiedBeats) {
        const updatedBeat = await tx
            .update(schema.beats)
            .set(modifiedBeat)
            .where(eq(schema.beats.id, modifiedBeat.id))
            .returning()
            .get();

        updatedBeats.push(realDatabaseBeatToDatabaseBeat(updatedBeat));
    }

    return updatedBeats;
};

/**
 * Deletes beats from the database and flattens the position of the remaining beats.
 *
 * @param db The database connection
 * @param beatIds Set of beat IDs to delete
 * @returns List of deleted beats
 */
export async function deleteBeats({
    db,
    beatIds,
}: {
    db: DbConnection;
    beatIds: Set<number>;
}): Promise<DatabaseBeat[]> {
    // Filter out the first beat
    beatIds.delete(FIRST_BEAT_ID);

    if (beatIds.size === 0) {
        console.log("No beats to delete (first beat filtered out)");
        return [];
    }

    const transactionResult = await transactionWithHistory(
        db,
        "deleteBeats",
        async (tx) => {
            return await deleteBeatsInTransaction({
                tx,
                beatIds,
            });
        },
    );
    return transactionResult;
}

/**
 * Deletes beats within a transaction and flattens positions.
 */
export const deleteBeatsInTransaction = async ({
    tx,
    beatIds,
}: {
    tx: DbTransaction;
    beatIds: Set<number>;
}): Promise<DatabaseBeat[]> => {
    // Delete the beats
    const deletedBeats = await tx
        .delete(schema.beats)
        .where(inArray(schema.beats.id, Array.from(beatIds)))
        .returning();

    // Flatten the order of remaining beats
    await flattenOrderInTransaction({ tx });

    return deletedBeats.map(realDatabaseBeatToDatabaseBeat);
};
