import { eq } from "drizzle-orm";
import { DbConnection, DbTransaction } from "./types";
import { schema } from "@/global/database/db";
import { transactionWithHistory, createAllUndoTriggers } from "./history";
import {
    giveNewMarchersHomesInTransaction,
    removeDeletedMarchersFromTimelinesInTransaction,
} from "./timelineMarchers";
import { deleteEmptySetCuesInTransaction } from "./cues";

type DatabaseMarcher = typeof schema.marchers.$inferSelect;

/**
 * Defines the required/available fields of a new marcher.
 */
export interface NewMarcherArgs {
    name?: string | null;
    section: string;
    drill_prefix: string;
    drill_order: number;
    year?: string | null;
    notes?: string | null;
}

/**
 * Defines the editable fields of a marcher.
 */
export interface ModifiedMarcherArgs {
    /**
     * The id of the marcher to update.
     */
    id: number;
    name?: string | null;
    section?: string;
    drill_prefix?: string;
    drill_order?: number;
    year?: string | null;
    notes?: string | null;
}

const undoTriggersReadyMap = new WeakMap<DbConnection, Promise<void>>();

const ensureUndoTriggers = async (db: DbConnection) => {
    let undoTriggersReady = undoTriggersReadyMap.get(db);
    if (!undoTriggersReady) {
        undoTriggersReady = createAllUndoTriggers(db).catch((error) => {
            undoTriggersReadyMap.delete(db);
            throw error;
        });
        undoTriggersReadyMap.set(db, undoTriggersReady);
    }
    await undoTriggersReady;
};

/**
 * @param db The database connection, or undefined to create a new connection
 * @returns An array of all marchers in the database
 */
export async function getMarchers({
    db,
}: {
    db: DbConnection;
}): Promise<DatabaseMarcher[]> {
    const response = await db.select().from(schema.marchers);
    return response;
}

export async function createMarchersInTransaction({
    newMarchers,
    tx,
}: {
    newMarchers: NewMarcherArgs[];
    tx: DbTransaction;
}): Promise<DatabaseMarcher[]> {
    if (newMarchers.length === 0) {
        return [];
    }

    const createdMarchers = await tx
        .insert(schema.marchers)
        .values(newMarchers)
        .returning();

    if (!createdMarchers) {
        throw new Error("Failed to create marchers");
    }

    return createdMarchers;
}

/**
 * Creates a list of marchers with the given values.
 *
 * THIS SHOULD ALWAYS BE CALLED RATHER THAN 'db.insert' DIRECTLY.
 *
 *
 * The new marchers also get a home in the same edit and no moves, so they stand at home until
 * moved (`giveNewMarchersHomesInTransaction`, P7.3 and UI-9).
 *
 * @param newMarchers Array of NewMarcherArgs containing the marcher data to create
 * @param db The database connection
 * @returns Promise<DatabaseMarcher[]> Array of created marchers
 */
export async function createMarchers({
    newMarchers,
    db,
}: {
    newMarchers: NewMarcherArgs[];
    db: DbConnection;
}): Promise<DatabaseMarcher[]> {
    await ensureUndoTriggers(db);
    const transactionResult = await transactionWithHistory(
        db,
        "createMarchers",
        async (tx) => {
            const created = await createMarchersInTransaction({
                newMarchers,
                tx,
            });
            await giveNewMarchersHomesInTransaction({
                tx,
                marcherIds: created.map((m) => m.id),
            });
            return created;
        },
    );
    return transactionResult;
}

const updateMarchersInTransaction = async ({
    modifiedMarchers,
    tx,
}: {
    modifiedMarchers: ModifiedMarcherArgs[];
    tx: DbTransaction;
}): Promise<DatabaseMarcher[]> => {
    const updatedMarchers: DatabaseMarcher[] = [];
    for (const modifiedMarcher of modifiedMarchers) {
        const { id, ...updateData } = modifiedMarcher;
        const updatedMarcher = await tx
            .update(schema.marchers)
            .set(updateData)
            .where(eq(schema.marchers.id, id))
            .returning()
            .get();
        updatedMarchers.push(updatedMarcher);
    }
    return updatedMarchers;
};

/**
 * Update a list of marchers with the given values.
 *
 * @param modifiedMarchers Array of ModifiedMarcherArgs that contain the id of the
 *                    marcher to update and the values to update it with
 * @param db The database connection
 * @returns Promise<DatabaseMarcher[]> Array of updated marchers
 */
export async function updateMarchers({
    modifiedMarchers,
    db,
}: {
    modifiedMarchers: ModifiedMarcherArgs[];
    db: DbConnection;
}): Promise<DatabaseMarcher[]> {
    await ensureUndoTriggers(db);
    const updateResponse = await transactionWithHistory(
        db,
        "updateMarchers",
        async (tx) => {
            return await updateMarchersInTransaction({
                modifiedMarchers,
                tx,
            });
        },
    );
    return updateResponse;
}

const deleteMarchersInTransaction = async ({
    marcherIds,
    tx,
}: {
    marcherIds: Set<number>;
    tx: DbTransaction;
}): Promise<DatabaseMarcher[]> => {
    const deletedMarchers: DatabaseMarcher[] = [];
    for (const marcherId of marcherIds) {
        const deletedMarcher = await tx
            .delete(schema.marchers)
            .where(eq(schema.marchers.id, marcherId))
            .returning()
            .get();
        if (deletedMarcher) deletedMarchers.push(deletedMarcher);
        else
            console.warn(
                `Marcher with id ${marcherId} not found. Ignoring deletion`,
            );
    }
    // The marchers left their hand-picked sets through the cascade; a set left empty deletes
    // its cue in the same edit (ADR 0004 D-2)
    if (deletedMarchers.length > 0)
        await deleteEmptySetCuesInTransaction({ tx });
    return deletedMarchers;
};

/**
 * Deletes the marchers with the given ids and all of their marcherPages.
 * CAUTION - This will also delete all of the marcherPages associated with the marchers.
 *
 * In timeline mode (the file's flag, read inside the edit), the marchers' assignments are deleted
 * first, with their own one-slot transitions (timelines stay, UI-9), and the slots they leave in
 * shared transitions are compacted where that moves no one, in the same edit
 * (`removeDeletedMarchersFromTimelinesInTransaction`, P7.3 and P8.14). In page mode the
 * assignments go with the marcher through the foreign-key cascade, as before.
 *
 * @param marcherIds Set of marcher IDs to delete
 * @param db The database connection
 * @returns Promise<DatabaseMarcher[]> Array of deleted marchers
 */
export async function deleteMarchers({
    marcherIds,
    db,
}: {
    marcherIds: Set<number>;
    db: DbConnection;
}): Promise<DatabaseMarcher[]> {
    await ensureUndoTriggers(db);
    const deleteResponse = await transactionWithHistory(
        db,
        "deleteMarchers",
        async (tx) => {
            await removeDeletedMarchersFromTimelinesInTransaction({
                tx,
                marcherIds: [...marcherIds],
            });
            return await deleteMarchersInTransaction({
                marcherIds,
                tx,
            });
        },
    );
    return deleteResponse;
}
