import Constants from "../../../src/global/Constants";
import Database from "better-sqlite3";
import * as DbActions from "../DatabaseActions";
import { DatabaseResponse } from "../DatabaseActions";

export interface Shape {
    id: number;
    name: string | null;
    created_at: string;
    updated_at: string;
    notes: string | null;
}

export interface NewShapeArgs {
    name?: string | null;
    notes?: string | null;
}

export interface ModifiedShapeArgs {
    id: number;
    name?: string | null;
    notes?: string | null;
}

/**
 * Retrieves all shapes from the database
 * @param db The database instance
 * @returns DatabaseResponse containing an array of Shape objects
 */
export function getShapes({
    db,
}: {
    db: Database.Database;
}): DatabaseResponse<Shape[]> {
    return DbActions.getAllItems<Shape>({
        db,
        tableName: Constants.ShapeTableName,
    });
}

/**
 * Creates new shapes in the database
 * @param db The database instance
 * @param args Array of NewShapeArgs containing name and optional notes
 * @param isChildAction Whether the action is a child action of a parent action. NOTE, this will always use the next history group
 *  As it is expected this action will always be first.
 * @returns DatabaseResponse containing the created Shape objects
 */
export function createShapes({
    db,
    args,
    isChildAction = false,
}: {
    db: Database.Database;
    args: NewShapeArgs[];
    isChildAction?: boolean;
}): DatabaseResponse<Shape[]> {
    return DbActions.createItems<Shape, NewShapeArgs>({
        db,
        tableName: Constants.ShapeTableName,
        items: args,
        printHeaders: !isChildAction,
    });
}

/**
 * Updates existing shapes in the database
 * @param db The database instance
 * @param args Array of ModifiedShapeArgs containing id and optional name/notes updates
 * @returns DatabaseResponse containing the updated Shape objects
 */
export function updateShapes({
    db,
    args,
}: {
    db: Database.Database;
    args: ModifiedShapeArgs[];
}): DatabaseResponse<Shape[]> {
    return DbActions.updateItems<Shape, ModifiedShapeArgs>({
        db,
        tableName: Constants.ShapeTableName,
        items: args,
    });
}

/**
 * Deletes shapes from the database by their IDs
 * @param db The database instance
 * @param ids Set of shape IDs to delete
 * @returns DatabaseResponse containing the deleted Shape objects
 */
export function deleteShapes({
    db,
    ids,
}: {
    db: Database.Database;
    ids: Set<number>;
}): DatabaseResponse<Shape[]> {
    console.log("DELETING SHAPES", ids);
    return DbActions.deleteItems<Shape>({
        db,
        tableName: Constants.ShapeTableName,
        ids,
    });
}
