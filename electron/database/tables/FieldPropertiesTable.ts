import FieldProperties from "../../../src/global/classes/FieldProperties";
import Constants from "../../../src/global/Constants";
import * as History from "../database.history";
import Database from "better-sqlite3";
import { DatabaseResponse } from "../DatabaseActions";

/* ======================== Field Properties ======================== */
/**
 * Gets the field properties from the database.
 *
 * @param db
 * @returns
 */
export function getFieldProperties({
    db,
}: {
    db: Database.Database;
}): DatabaseResponse<FieldProperties> {
    const stmt = db.prepare(
        `SELECT * FROM ${Constants.FieldPropertiesTableName}`,
    );
    const result = stmt.get({});
    const jsonData = (result as any).json_data;
    const fieldProperties = JSON.parse(jsonData) as FieldProperties;
    return { data: fieldProperties, success: true };
}

export function getFieldPropertiesJson({
    db,
}: {
    db: Database.Database;
}): DatabaseResponse<string> {
    const stmt = db.prepare(
        `SELECT json_data FROM ${Constants.FieldPropertiesTableName}`,
    );
    const result = stmt.get({});
    const jsonData = (result as { json_data: string }).json_data;
    return { data: jsonData, success: true };
}

/**
 * Updates the field properties in the database.
 *
 * @param fieldProperties The new field properties
 * @returns {success: boolean, result?: FieldProperties, error?: string}
 */
export function updateFieldProperties({
    fieldProperties,
    db,
}: {
    fieldProperties: FieldProperties | string;
    db: Database.Database;
}): DatabaseResponse<FieldProperties | null> {
    let output: DatabaseResponse<FieldProperties | null>;

    try {
        History.incrementUndoGroup(db);
        const stmt = db.prepare(`
            UPDATE ${Constants.FieldPropertiesTableName}
            SET json_data = @json_data
            WHERE id = 1
        `);
        if (typeof fieldProperties === "string") {
            stmt.run({ json_data: fieldProperties });
        } else {
            stmt.run({ json_data: JSON.stringify(fieldProperties) });
        }
        const newFieldProperties = getFieldProperties({ db }).data;
        output = { success: true, data: newFieldProperties };
    } catch (error: any) {
        console.error(error);
        output = {
            success: false,
            data: null,
            error: { message: error.message, stack: error.stack },
        };
    } finally {
        History.incrementUndoGroup(db);
    }
    return output;
}
