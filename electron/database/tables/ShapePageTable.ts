import Constants from "../../../src/global/Constants";
import Database from "better-sqlite3";
import * as DbActions from "../DatabaseActions";
import { DatabaseResponse } from "../DatabaseActions";
import * as History from "../database.history";

export interface ShapePage {
    id: number;
    shape_id: number;
    page_id: number;
    svg_path: string;
    created_at: string;
    updated_at: string;
    notes: string | null;
}

export interface NewShapePageArgs {
    shape_id: number;
    page_id: number;
    svg_path: string;
    notes?: string | null;
}

export interface ModifiedShapePageArgs {
    id: number;
    svg_path?: string;
    notes?: string | null;
}

/**
 * Creates the ShapePage table in the database with columns for id, name, timestamps, and notes.
 * Also sets up undo triggers for history tracking.
 * @param db The database instance
 */
export function createShapePageTable(db: Database.Database) {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS "${Constants.ShapePageTableName}" (
                "id"            INTEGER PRIMARY KEY,
                "shape_id"      INTEGER NOT NULL REFERENCES "${Constants.ShapeTableName}" ("id"),
                "page_id"       INTEGER NOT NULL REFERENCES "${Constants.PageTableName}" ("id"),
                "svg_path"      TEXT NOT NULL,
                "created_at"    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updated_at"    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "notes"         TEXT,
                UNIQUE (shape_id, page_id)
            );
        `);
        History.createUndoTriggers(db, Constants.ShapePageTableName);
    } catch (error) {
        throw new Error(
            `Failed to create ${Constants.ShapePageTableName} table: ${error}`,
        );
    }
}
/**
 * Retrieves all ShapePages from the database
 * @param db The database instance
 * @returns DatabaseResponse containing an array of ShapePage objects
 */
export function getShapePages({
    db,
}: {
    db: Database.Database;
}): DatabaseResponse<ShapePage[]> {
    return DbActions.getAllItems<ShapePage>({
        db,
        tableName: Constants.ShapePageTableName,
    });
}

/**
 * Creates new ShapePages in the database
 *
 * @param db The database instance
 * @param args Array of NewShapePageArgs containing name and optional notes
 * @returns DatabaseResponse containing the created Shape objects
 */
export function createShapePages({
    db,
    args,
}: {
    db: Database.Database;
    args: NewShapePageArgs[];
}): DatabaseResponse<ShapePage[]> {
    return DbActions.createItems<ShapePage, NewShapePageArgs>({
        db,
        tableName: Constants.ShapePageTableName,
        items: args,
    });
}

/**
 * Updates existing ShapePages in the database
 * @param db The database instance
 * @param args Array of ModifiedShapePageArgs containing id and optional name/notes updates
 * @returns DatabaseResponse containing the updated Shape objects
 */
export function updateShapePages({
    db,
    args,
}: {
    db: Database.Database;
    args: ModifiedShapePageArgs[];
}): DatabaseResponse<ShapePage[]> {
    return DbActions.updateItems<ShapePage, ModifiedShapePageArgs>({
        db,
        tableName: Constants.ShapePageTableName,
        items: args,
    });
}

/**
 * Deletes ShapePages from the database by their IDs
 *
 * @param db The database instance
 * @param ids Set of ShapePage IDs to delete
 * @returns DatabaseResponse containing the deleted Shape objects
 */
export function deleteShapePages({
    db,
    ids,
}: {
    db: Database.Database;
    ids: Set<number>;
}): DatabaseResponse<ShapePage[]> {
    return DbActions.deleteItems<ShapePage>({
        db,
        tableName: Constants.ShapePageTableName,
        ids,
    });
}
