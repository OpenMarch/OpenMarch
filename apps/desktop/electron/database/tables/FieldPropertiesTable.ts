import { FieldProperties } from "@openmarch/core/field";
import Constants from "../../../src/global/Constants";
import * as History from "../database.history";
import Database from "better-sqlite3";
import { DatabaseResponse } from "../DatabaseActions";
import * as fs from "fs";

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

/**
 * Updates the field properties image in the database.
 *
 * @param imagePath The path to the image file to be stored in the database.
 * @param db The database instance.
 * @returns A DatabaseResponse containing the updated image path or null on failure.
 */
export function updateFieldPropertiesImage({
    imagePath,
    db,
}: {
    imagePath: string;
    db: Database.Database;
}): DatabaseResponse<string | null> {
    let output: DatabaseResponse<string | null>;

    try {
        History.incrementUndoGroup(db);
        const imageBlob = fs.readFileSync(imagePath);
        const stmt = db.prepare(`
            UPDATE ${Constants.FieldPropertiesTableName}
            SET image = @image_blob
            WHERE id = 1
        `);
        stmt.run({ image_blob: imageBlob });
        output = { success: true, data: imagePath };
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

export function getFieldPropertiesImage({
    db,
}: {
    db: Database.Database;
}): DatabaseResponse<Buffer | null> {
    let output: DatabaseResponse<Buffer | null>;

    try {
        const stmt = db.prepare(`
            SELECT image FROM ${Constants.FieldPropertiesTableName}
            WHERE id = 1
        `);
        const result = stmt.get({}) as { image: Buffer };
        output = {
            data: result.image,
            success: true,
        };
    } catch (error: any) {
        console.error(error);
        output = {
            success: false,
            data: null,
            error: { message: error.message, stack: error.stack },
        };
    }
    return output;
}

/**
 * Deletes the field properties image from the database.
 *
 * @param db The database instance.
 * @returns A DatabaseResponse containing null on success, or an error object on failure.
 */
export function deleteFieldPropertiesImage({
    db,
}: {
    db: Database.Database;
}): DatabaseResponse<null> {
    let output: DatabaseResponse<null>;

    try {
        History.incrementUndoGroup(db);
        db.prepare(
            `
            UPDATE ${Constants.FieldPropertiesTableName}
            SET image = NULL
            WHERE id = 1`,
        ).run();

        output = { success: true, data: null };
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
