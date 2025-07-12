import Constants from "../../../src/global/Constants";
import * as History from "../database.history";
import Database from "better-sqlite3";
import * as DbActions from "../DatabaseActions";

/** How a production note is represented in the database */
export interface DatabaseProductionNote {
    /** Unique identifier for the production note */
    id: number;
    /** The page ID this note belongs to */
    page_id: number;
    /** The content of the note */
    content: string;
    /** Whether the note is published (saved and visible) */
    is_published: boolean;
    /** The order of the note within the page (for sorting) */
    order_index: number;
    /** Timestamp of when the note was created */
    created_at: string;
    /** Timestamp of when the note was last updated */
    updated_at: string;
}

interface RealDatabaseProductionNote {
    /** Unique identifier for the production note */
    id: number;
    /** The page ID this note belongs to */
    page_id: number;
    /** The content of the note */
    content: string;
    /** Whether the note is published (saved and visible) */
    is_published: 0 | 1;
    /** The order of the note within the page (for sorting) */
    order_index: number;
    /** Timestamp of when the note was created */
    created_at: string;
    /** Timestamp of when the note was last updated */
    updated_at: string;
}

const realDatabaseProductionNoteToDatabaseProductionNote = (
    note: RealDatabaseProductionNote,
): DatabaseProductionNote => {
    return {
        ...note,
        is_published: note.is_published === 1,
    };
};

export interface NewProductionNoteArgs {
    page_id: number;
    content: string;
    is_published?: boolean;
    order_index?: number;
}

interface RealNewProductionNoteArgs {
    page_id: number;
    content: string;
    is_published?: 0 | 1;
    order_index?: number;
}

const newProductionNoteArgsToRealNewProductionNoteArgs = (
    args: NewProductionNoteArgs,
): RealNewProductionNoteArgs => {
    return {
        ...args,
        is_published: args.is_published ? 1 : 0,
    };
};

export interface ModifiedProductionNoteArgs {
    id: number;
    content?: string;
    is_published?: boolean;
    order_index?: number;
}

interface RealModifiedProductionNoteArgs {
    id: number;
    content?: string;
    is_published?: 0 | 1;
    order_index?: number;
}

const modifiedProductionNoteArgsToRealModifiedProductionNoteArgs = (
    args: ModifiedProductionNoteArgs,
): RealModifiedProductionNoteArgs => {
    return {
        ...args,
        ...(args.is_published === undefined
            ? {}
            : { is_published: (args.is_published ? 1 : 0) as 0 | 1 }),
    } as RealModifiedProductionNoteArgs;
};

/**
 * Gets all production notes for a specific page.
 *
 * @param db The database connection
 * @param pageId The ID of the page to get notes for
 * @returns List of production notes for the page
 */
export function getProductionNotesByPage({
    db,
    pageId,
}: {
    db: Database.Database;
    pageId: number;
}): DbActions.DatabaseResponse<DatabaseProductionNote[]> {
    const query = `SELECT * FROM "${Constants.ProductionNotesTableName}" WHERE page_id = ? ORDER BY order_index ASC, created_at ASC`;
    const stmt = db.prepare(query);

    try {
        const notes = stmt.all(pageId) as RealDatabaseProductionNote[];
        return {
            success: true,
            data: notes.map(realDatabaseProductionNoteToDatabaseProductionNote),
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

/**
 * Gets all production notes in the database.
 *
 * @param db The database connection
 * @returns List of all production notes
 */
export function getAllProductionNotes({
    db,
}: {
    db: Database.Database;
}): DbActions.DatabaseResponse<DatabaseProductionNote[]> {
    const response = DbActions.getAllItems<RealDatabaseProductionNote>({
        tableName: Constants.ProductionNotesTableName,
        db,
    });
    return {
        success: response.success,
        data: response.data.map(
            realDatabaseProductionNoteToDatabaseProductionNote,
        ),
    };
}

/**
 * Create one or many new production notes.
 *
 * @param newNotes The new production notes to create.
 * @returns The response from the database.
 */
export function createProductionNotes({
    newNotes,
    db,
}: {
    newNotes: NewProductionNoteArgs[];
    db: Database.Database;
}): DbActions.DatabaseResponse<DatabaseProductionNote[]> {
    if (newNotes.length === 0) {
        console.log("No new production notes to create");
        return {
            success: true,
            data: [],
        };
    }

    // Set order_index if not provided
    const notesWithOrder = newNotes.map((note, index) => ({
        ...note,
        order_index: note.order_index ?? index,
    }));

    const response = DbActions.createItems<
        RealDatabaseProductionNote,
        RealNewProductionNoteArgs
    >({
        db,
        tableName: Constants.ProductionNotesTableName,
        items: notesWithOrder.map(
            newProductionNoteArgsToRealNewProductionNoteArgs,
        ),
        functionName: "createProductionNotes",
        useNextUndoGroup: true,
    });

    return {
        ...response,
        data: response.data.map(
            realDatabaseProductionNoteToDatabaseProductionNote,
        ),
    };
}

/**
 * Update a list of production notes with the given values.
 *
 * @param modifiedNotes Array of ModifiedProductionNoteArgs objects
 * @returns DatabaseResponse
 */
export function updateProductionNotes({
    db,
    modifiedNotes,
}: {
    db: Database.Database;
    modifiedNotes: ModifiedProductionNoteArgs[];
}): DbActions.DatabaseResponse<DatabaseProductionNote[]> {
    const realModifiedNotes = modifiedNotes.map(
        modifiedProductionNoteArgsToRealModifiedProductionNoteArgs,
    );

    const response = DbActions.updateItems<
        RealDatabaseProductionNote,
        RealModifiedProductionNoteArgs
    >({
        db,
        items: realModifiedNotes,
        tableName: Constants.ProductionNotesTableName,
        printHeaders: false,
        useNextUndoGroup: true,
    });

    return {
        ...response,
        data: response.data.map(
            realDatabaseProductionNoteToDatabaseProductionNote,
        ),
    };
}

/**
 * Deletes production notes with the given ids from the database.
 *
 * @param noteIds Set of note IDs to delete
 * @returns DatabaseResponse with the deleted notes
 */
export function deleteProductionNotes({
    noteIds,
    db,
}: {
    noteIds: Set<number>;
    db: Database.Database;
}): DbActions.DatabaseResponse<DatabaseProductionNote[]> {
    const response = DbActions.deleteItems<RealDatabaseProductionNote>({
        db,
        ids: noteIds,
        functionName: "deleteProductionNotes",
        tableName: Constants.ProductionNotesTableName,
        printHeaders: false,
        useNextUndoGroup: true,
    });

    return {
        ...response,
        data: response.data.map(
            realDatabaseProductionNoteToDatabaseProductionNote,
        ),
    };
}
