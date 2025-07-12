import { FieldProperties } from "@openmarch/core/field";
import Constants from "../../../src/global/Constants";
import * as History from "../database.history";
import Database from "better-sqlite3";
import { DatabaseResponse } from "../DatabaseActions";
import * as fs from "fs";

/* ======================== Field Properties ======================== */
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
