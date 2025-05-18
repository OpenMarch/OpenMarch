import Constants from "../../../src/global/Constants";
import Database from "better-sqlite3";
import * as DbActions from "../DatabaseActions";

/**
 * This table is for random utility data that doesn't fit in any other table.
 *
 * last_page_counts: The counts of the last page in the show. If null, the last page goes to the end of the piece.
 */

/** The ID for the utility record - there's only one row in this table */
export const UTILITY_RECORD_ID = 0;

/** How utility data is represented in the database */
export type ModifiedUtilityRecord = {
    /** The counts of the last page in the show */
    last_page_counts?: number | null;
};
export type UtilityRecord = {
    /** Always 0 for the single utility record */
    id: number;
    /** The counts of the last page in the show */
    last_page_counts: number;
};

/**
 * Gets the utility record from the database.
 *
 * @param db The database connection
 * @returns The utility record or null if it doesn't exist
 */
export function getUtilityRecord({
    db,
}: {
    db: Database.Database;
}): DbActions.DatabaseResponse<UtilityRecord> {
    const response = DbActions.getItem<UtilityRecord>({
        tableName: Constants.UtilityTableName,
        db,
        id: UTILITY_RECORD_ID,
    });
    if (!response.success || !response.data)
        throw new Error("Utility record not found");
    return response as DbActions.DatabaseResponse<UtilityRecord>;
}

/**
 * Updates the last beat in the utility record.
 *
 * @param db The database connection
 * @param lastBeat The new last beat ID
 * @returns The updated utility record
 */
export function updateUtilityRecord({
    db,
    utilityRecord,
    useNextUndoGroup,
}: {
    db: Database.Database;
    utilityRecord: ModifiedUtilityRecord;
    useNextUndoGroup: boolean;
}): DbActions.DatabaseResponse<UtilityRecord> {
    const response = DbActions.updateItems<
        UtilityRecord,
        ModifiedUtilityRecord & { id: number }
    >({
        db,
        items: [{ ...utilityRecord, id: UTILITY_RECORD_ID }],
        tableName: Constants.UtilityTableName,
        functionName: "updateUtilityRecord",
        useNextUndoGroup,
    });

    return {
        success: response.success,
        data: response.data[0],
        error: response.error,
    };
}
