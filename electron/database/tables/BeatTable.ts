import Database from "better-sqlite3";
import * as History from "../database.history";
import * as DbActions from "../DatabaseActions";
import Constants from "@/global/Constants";

/**
 * Represents a beat in the database.
 * @property {number} id - The unique identifier for the beat.
 * @property {number} duration - The duration of the beat in seconds.
 * @property {0 | 1} include_in_measure - Whether the beat should be included in a measure (0 = false, 1 = true).
 * @property {string | null} notes - Optional human-readable notes about the beat.
 * @property {string} created_at - The timestamp when the beat was created.
 * @property {string} updated_at - The timestamp when the beat was last updated.
 */
export interface DatabaseBeat {
    id: number;
    /** Duration from this beat to the next in second. */
    duration: number;
    /** The position of this beat in the show. Integer and unique */
    position: number;
    /** Whether this beat is included in a measure. 0 = false, 1 = true. */
    include_in_measure: 0 | 1;
    /** Human readable notes. */
    notes: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * Represents the arguments for creating a new beat in the database.
 * @property {number} duration - The duration of the beat in seconds.
 * @property {boolean} include_in_measure - Whether the beat should be included in a measure.
 * @property {string | null} [notes] - Optional human-readable notes about the beat.
 */
export interface NewBeatArgs {
    duration: number;
    include_in_measure: 0 | 1;
    notes?: string | null;
}
type InternalNewBeatArgs = NewBeatArgs & { position: number };

/**
 * Represents the arguments for modifying an existing beat in the database.
 * @property {number} id - The unique identifier for the beat to be modified.
 * @property {number} [duration] - The new duration of the beat in seconds.
 * @property {0 | 1} [include_in_measure] - The new value for whether the beat should be included in a measure (0 = false, 1 = true).
 * @property {string | null} [notes] - The new optional human-readable notes about the beat.
 */
export interface ModifiedBeatArgs {
    id: number;
    duration?: number;
    include_in_measure?: 0 | 1;
    notes?: string | null;
}
type InternalModifiedBeat = ModifiedBeatArgs & { position?: number };

/**
 * Retrieves all beats from the database.
 * @param {Database.Database} db - The database instance to use.
 * @returns {DbActions.DatabaseResponse<DatabaseBeat[]>} - The response containing the list of beats.
 */
export function getBeats({
    db,
}: {
    db: Database.Database;
}): DbActions.DatabaseResponse<DatabaseBeat[]> {
    return DbActions.getAllItems<DatabaseBeat>({
        tableName: Constants.BeatsTableName,
        db,
    });
}

/**
 * Retrieves a single beat from the database by its unique identifier.
 * @param {Database.Database} db - The database instance to use.
 * @param {number} beatId - The unique identifier of the beat to retrieve.
 * @returns {DbActions.DatabaseResponse<DatabaseBeat | undefined>} - The response containing the retrieved beat, or undefined if the beat is not found.
 */
export function getBeat({
    db,
    beatId,
}: {
    db: Database.Database;
    beatId: number;
}): DbActions.DatabaseResponse<DatabaseBeat | undefined> {
    return DbActions.getItem<DatabaseBeat>({
        tableName: Constants.BeatsTableName,
        db,
        id: beatId,
    });
}

/**
 * Retrieves the first or last beat from the database. Null if no beats exist.
 * @param {Object} params - The parameters for retrieving the beat.
 * @param {boolean} params.isFirstBeat - True to retrieve the first beat, false to retrieve the last beat.
 * @param {Database.Database} params.db - The database instance to use.
 * @returns {DbActions.DatabaseResponse<DatabaseBeat | null>} - The response containing the first or last beat, or null if no beats exist.
 */
function getFirstOrLastBeat({
    db,
    isFirstBeat,
}: {
    isFirstBeat: boolean;
    db: Database.Database;
}): DbActions.DatabaseResponse<DatabaseBeat | null> {
    const allBeatsResponse = DbActions.getAllItems<DatabaseBeat>({
        tableName: Constants.BeatsTableName,
        db,
    });
    let output: DbActions.DatabaseResponse<DatabaseBeat | null>;
    if (allBeatsResponse.success) {
        const allBeats = allBeatsResponse.data;
        if (allBeats.length === 0) {
            output = {
                success: true,
                data: null,
            };
        } else {
            const beatToGet = allBeats.reduce((prev, curr) => {
                if (isFirstBeat)
                    return prev.position < curr.position ? prev : curr;
                else return prev.position > curr.position ? prev : curr;
            });
            output = {
                success: true,
                data: beatToGet,
            };
        }
    } else {
        output = {
            success: false,
            error: allBeatsResponse.error,
            data: null,
        };
    }
    return output;
}

/**
 * Shifts all beats that are on or after the specified starting position by the given shift amount.
 * @param {Object} params - The parameters for shifting the beats.
 * @param {Database.Database} params.db - The database instance to use.
 * @param {number} params.startingPosition - The starting position of the beats to shift.
 * @param {number} params.shiftAmount - The amount to shift the beats by.
 * @param {boolean} params.useNextUndoGroup - Whether to use the next undo group for the updates.
 * @returns {DbActions.DatabaseResponse<DatabaseBeat[]>} - The response containing the updated beats.
 */
export function shiftBeats({
    db,
    startingPosition,
    shiftAmount,
    useNextUndoGroup,
}: {
    db: Database.Database;
    startingPosition: number;
    shiftAmount: number;
    useNextUndoGroup: boolean;
}): DbActions.DatabaseResponse<DatabaseBeat[]> {
    const allBeatsResponse = DbActions.getAllItems<DatabaseBeat>({
        tableName: Constants.BeatsTableName,
        db,
    });
    let output: DbActions.DatabaseResponse<DatabaseBeat[]>;

    if (allBeatsResponse.success) {
        const allBeats = allBeatsResponse.data;
        // Shift all the beats that are on or after the starting position
        const beatsToShift = allBeats
            .filter((beat) => beat.position >= startingPosition)
            .map((beat) => {
                return {
                    id: beat.id,
                    position: beat.position + shiftAmount,
                };
            })
            // Reverse the order of the beats to be from last to first to prevent unique constraint violations
            .sort((a, b) => b.position - a.position);
        const updatedBeatsResponse = DbActions.updateItems<
            DatabaseBeat,
            InternalModifiedBeat
        >({
            db,
            tableName: Constants.BeatsTableName,
            items: beatsToShift,
            useNextUndoGroup,
        });
        if (updatedBeatsResponse.success) {
            output = {
                success: true,
                data: updatedBeatsResponse.data,
            };
        } else {
            output = {
                success: false,
                error: updatedBeatsResponse.error,
                data: [],
            };
        }
    } else {
        output = {
            success: false,
            error: allBeatsResponse.error,
            data: [],
        };
    }
    return output;
}

/**
 * Flattens the position order of the beats in the database.
 * This ensures that the position_order values are sequential and contiguous.
 * If it fails, an error is thrown
 *
 * @param db The database instance
 * @param shapePageId The ID of the ShapePage associated with the ShapePageMarchers to be flattened
 * @returns void
 */
export function flattenOrder({ db }: { db: Database.Database }): void {
    try {
        // Get all SPMs for the given shapePageId
        const allResponse = DbActions.getAllItems<DatabaseBeat>({
            db,
            tableName: Constants.BeatsTableName,
        });

        if (allResponse.error) {
            throw new Error(`Error getting all Beats: ${allResponse.error}`);
        }

        // Sort beats by `position`
        const sortedSpms = allResponse.data.sort(
            (a, b) => a.position - b.position,
        );

        // Create array of modified SPMs with incremental position values
        const modifiedBeats: InternalModifiedBeat[] = [];
        sortedSpms.forEach((spm, index) => {
            const newIndex = index;
            if (spm.position !== newIndex) {
                modifiedBeats.push({
                    id: spm.id,
                    position: index + 1,
                });
            }
        });

        // Update all SPMs with new position values
        const response = DbActions.updateItems<
            DatabaseBeat,
            InternalModifiedBeat
        >({
            db,
            tableName: Constants.BeatsTableName,
            items: modifiedBeats,
            printHeaders: false,
            useNextUndoGroup: false,
        });

        if (!response.success) {
            throw new Error(response.error?.message ?? "");
        }
    } catch (error: any) {
        throw new Error(`Error flattening position on beats: ${error}`);
    }
}
/**
 * Creates new beats in the database .
 *
 * @param {Object} params - The parameters for creating new beats.
 * @param {NewBeatArgs[]} params.newBeats - The new beats to create in the order they should be created.
 * @param {Database.Database} params.db - The database instance to use.
 * @param {number} [params.startingPosition] - The starting position of the beats. Existing beats after this position are pushed back. If undefined, beats are added to the end.
 * @returns {DbActions.DatabaseResponse<DatabaseBeat[]>} - The response containing the list of created beats.
 */
export function createBeats(args: {
    newBeats: NewBeatArgs[];
    startingPosition?: number;
    db: Database.Database;
}): DbActions.DatabaseResponse<DatabaseBeat[]> {
    const createdBeats: DatabaseBeat[] = [];
    let output: DbActions.DatabaseResponse<DatabaseBeat[]>;
    let actionWasPerformed = false;

    // If the starting position is undefined, get the last beat.
    const lastBeat = getFirstOrLastBeat({ db: args.db, isFirstBeat: false });
    const startingPosition =
        args.startingPosition === undefined
            ? lastBeat.data === null
                ? 0
                : lastBeat.data.position
            : args.startingPosition;

    console.log("\n=========== start createBeats ===========");
    History.incrementUndoGroup(args.db);
    try {
        // Shift all of the beats that are after the starting position back
        let curPosition = startingPosition + 1;
        if (
            lastBeat.data !== null &&
            startingPosition < lastBeat.data.position
        ) {
            shiftBeats({
                db: args.db,
                startingPosition: curPosition,
                shiftAmount: args.newBeats.length,
                useNextUndoGroup: false,
            });
        }
        const newBeats: InternalNewBeatArgs[] = args.newBeats.map((newBeat) => {
            return { ...newBeat, position: curPosition++ };
        });
        const newBeatsResponse = DbActions.createItems<
            DatabaseBeat,
            InternalNewBeatArgs
        >({
            db: args.db,
            tableName: Constants.BeatsTableName,
            items: newBeats,
            useNextUndoGroup: false,
        });
        if (!newBeatsResponse.success) {
            throw new Error(
                newBeatsResponse.error?.message || "Unable to created beats",
            );
        }
        output = {
            success: true,
            data: createdBeats,
        };
    } catch (error: any) {
        console.error("Error creating beats. Rolling back changes.", error);
        if (actionWasPerformed) {
            History.performUndo(args.db);
            History.clearMostRecentRedo(args.db);
        }
        output = {
            success: false,
            error: {
                message: error,
                stack: error.stack || "could not get stack",
            },
            data: [],
        };
    } finally {
        console.log("=========== end createBeats ===========\n");
    }
    return output;
}

/**
 * Updates beats in the database.
 *
 * @param db - The database instance.
 * @param modifiedBeats - An array of modified beat arguments.
 * @returns A database response containing the updated beats.
 */
export function updateBeats({
    db,
    modifiedBeats,
}: {
    db: Database.Database;
    modifiedBeats: ModifiedBeatArgs[];
}): DbActions.DatabaseResponse<DatabaseBeat[]> {
    console.log("\n=========== start updateBeats ===========");
    const output = DbActions.updateItems<DatabaseBeat, ModifiedBeatArgs>({
        db,
        tableName: Constants.BeatsTableName,
        items: modifiedBeats,
        useNextUndoGroup: true,
    });
    console.log("=========== end updateBeats ===========\n");
    return output;
}

/**
 * Deletes beats from the database and flattens the `position` of the remaining beats.
 *
 * @param db - The database instance.
 * @param ids - The set of IDs of the beats to delete.
 * @returns A database response containing the deleted beats.
 */
export function deleteBeats({
    db,
    beatIds,
}: {
    db: Database.Database;
    beatIds: Set<number>;
}): DbActions.DatabaseResponse<DatabaseBeat[]> {
    console.log("=========== begin deleteBeats ===========");
    let output: DbActions.DatabaseResponse<DatabaseBeat[]>;
    let actionWasPerformed = false;
    History.incrementUndoGroup(db);

    try {
        output = DbActions.deleteItems<DatabaseBeat>({
            db,
            tableName: Constants.BeatsTableName,
            ids: beatIds,
            printHeaders: false,
            useNextUndoGroup: false,
        });
        actionWasPerformed = true;

        // Flatten the order of the beats
        flattenOrder({ db });
    } catch (error: any) {
        console.error(
            "Error deleting DatabaseBeats. Rolling back changes.",
            error,
        );
        if (actionWasPerformed) {
            History.performUndo(db);
            History.clearMostRecentRedo(db);
        }
        output = {
            success: false,
            error: {
                message: error,
                stack: error.stack || "could not get stack",
            },
            data: [],
        };
    } finally {
        console.log("=========== end deleteBeats ===========\n");
    }

    return output;
}
