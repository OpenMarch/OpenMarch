import Database from "better-sqlite3";
import * as DbActions from "../DatabaseActions";
import Constants from "../../../src/global/Constants";

/**
 * Represents a measure in the database.
 * @property {number} id - The unique identifier for the measure.
 * @property {number} start_beat - The ID of the beat where this measure starts.
 * @property {string | null} rehearsal_mark - Optional rehearsal mark for the measure.
 * @property {string | null} notes - Optional human-readable notes about the measure.
 * @property {string} created_at - The timestamp when the measure was created.
 * @property {string} updated_at - The timestamp when the measure was last updated.
 */
export interface DatabaseMeasure {
    id: number;
    /** The ID of the beat where this measure starts */
    start_beat: number;
    /** Optional rehearsal mark for the measure */
    rehearsal_mark: string | null;
    /** Human readable notes about the measure */
    notes: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * Represents the arguments for creating a new measure in the database.
 * @property {number} start_beat - The ID of the beat where this measure starts.
 * @property {string | null} [rehearsal_mark] - Optional rehearsal mark for the measure.
 * @property {string | null} [notes] - Optional human-readable notes about the measure.
 */
export interface NewMeasureArgs {
    start_beat: number;
    rehearsal_mark?: string | null;
    notes?: string | null;
}

/**
 * Represents the arguments for modifying an existing measure in the database.
 * @property {number} id - The unique identifier for the measure to be modified.
 * @property {number} [start_beat] - The new ID of the beat where this measure starts.
 * @property {string | null} [rehearsal_mark] - The new optional rehearsal mark for the measure.
 * @property {string | null} [notes] - The new optional human-readable notes about the measure.
 */
export interface ModifiedMeasureArgs {
    id: number;
    start_beat?: number;
    rehearsal_mark?: string | null;
    notes?: string | null;
}

/**
 * Retrieves all measures from the database.
 * @param {Database.Database} db - The database instance to use.
 * @returns {DbActions.DatabaseResponse<DatabaseMeasure[]>} - The response containing the list of measures.
 */
export function getMeasures({
    db,
}: {
    db: Database.Database;
}): DbActions.DatabaseResponse<DatabaseMeasure[]> {
    return DbActions.getAllItems<DatabaseMeasure>({
        tableName: Constants.MeasureTableName,
        db,
    });
}

/**
 * Retrieves a measure by its ID from the database.
 * @param {Object} params - The parameters for retrieving the measure.
 * @param {number} params.id - The ID of the measure to retrieve.
 * @param {Database.Database} params.db - The database instance to use.
 * @returns {DbActions.DatabaseResponse<DatabaseMeasure | undefined>} - The response containing the measure or undefined if not found.
 */
export function getMeasureById({
    db,
    id,
}: {
    db: Database.Database;
    id: number;
}): DbActions.DatabaseResponse<DatabaseMeasure | undefined> {
    return DbActions.getItem<DatabaseMeasure>({
        tableName: Constants.MeasureTableName,
        db,
        id,
    });
}

/**
 * Creates new measures in the database.
 *
 * @param {Object} params - The parameters for creating new measures.
 * @param {NewMeasureArgs[]} params.newMeasures - The new measures to create.
 * @param {Database.Database} params.db - The database instance to use.
 * @returns {DbActions.DatabaseResponse<DatabaseMeasure[]>} - The response containing the list of created measures.
 */
export function createMeasures({
    newMeasures,
    db,
}: {
    newMeasures: NewMeasureArgs[];
    db: Database.Database;
}): DbActions.DatabaseResponse<DatabaseMeasure[]> {
    return DbActions.createItems<DatabaseMeasure, NewMeasureArgs>({
        db,
        tableName: Constants.MeasureTableName,
        items: newMeasures,
        useNextUndoGroup: true,
        functionName: "createMeasures",
    });
}

/**
 * Updates measures in the database.
 *
 * @param db - The database instance.
 * @param modifiedMeasures - An array of modified measure arguments.
 * @returns A database response containing the updated measures.
 */
export function updateMeasures({
    db,
    modifiedMeasures,
}: {
    db: Database.Database;
    modifiedMeasures: ModifiedMeasureArgs[];
}): DbActions.DatabaseResponse<DatabaseMeasure[]> {
    return DbActions.updateItems<DatabaseMeasure, ModifiedMeasureArgs>({
        db,
        tableName: Constants.MeasureTableName,
        items: modifiedMeasures,
        useNextUndoGroup: true,
        functionName: "updateMeasures",
    });
}

/**
 * Deletes measures from the database.
 *
 * @param db - The database instance.
 * @param ids - The set of IDs of the measures to delete.
 * @returns A database response containing the deleted measures.
 */
export function deleteMeasures({
    db,
    measureIds,
}: {
    db: Database.Database;
    measureIds: Set<number>;
}): DbActions.DatabaseResponse<DatabaseMeasure[]> {
    return DbActions.deleteItems<DatabaseMeasure>({
        db,
        tableName: Constants.MeasureTableName,
        ids: measureIds,
        useNextUndoGroup: true,
        functionName: "deleteMeasures",
    });
}

/**
 * Retrieves measures by beat ID from the database.
 * @param {Object} params - The parameters for retrieving the measures.
 * @param {number} params.beatId - The ID of the beat to retrieve measures for.
 * @param {Database.Database} params.db - The database instance to use.
 * @returns {DbActions.DatabaseResponse<DatabaseMeasure[]>} - The response containing the measures.
 */
export function getMeasuresByBeatId({
    db,
    beatId,
}: {
    db: Database.Database;
    beatId: number;
}): DbActions.DatabaseResponse<DatabaseMeasure[]> {
    try {
        const measures = db
            .prepare(
                `SELECT * FROM ${Constants.MeasureTableName} WHERE start_beat = ?`,
            )
            .all(beatId) as DatabaseMeasure[];

        return {
            success: true,
            data: measures,
        };
    } catch (error: any) {
        return {
            success: false,
            error: {
                message: error.message,
                stack: error.stack,
            },
            data: [],
        };
    }
}
