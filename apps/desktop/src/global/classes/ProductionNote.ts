import type {
    DatabaseProductionNote,
    NewProductionNoteArgs,
    ModifiedProductionNoteArgs,
} from "../../../electron/database/tables/ProductionNoteTable";
import type { DatabaseResponse } from "../../../electron/database/DatabaseActions";
import { toast } from "sonner";

interface ProductionNote {
    /** The id of the production note in the database */
    readonly id: number;
    /** The page ID this note belongs to */
    readonly pageId: number;
    /** The content of the note */
    readonly content: string;
    /** Whether the note is published (saved and visible) */
    readonly isPublished: boolean;
    /** The order of the note within the page (for sorting) */
    readonly orderIndex: number;
    /** Timestamp of when the note was created */
    readonly createdAt: string;
    /** Timestamp of when the note was last updated */
    readonly updatedAt: string;
}

export default ProductionNote;

/**
 * Converts database production notes to frontend ProductionNote objects.
 *
 * @param databaseNotes The production notes from the database
 * @returns A list of ProductionNote objects
 */
export function fromDatabaseProductionNotes(
    databaseNotes: DatabaseProductionNote[],
): ProductionNote[] {
    return databaseNotes.map((dbNote) => ({
        id: dbNote.id,
        pageId: dbNote.page_id,
        content: dbNote.content,
        isPublished: dbNote.is_published,
        orderIndex: dbNote.order_index,
        createdAt: dbNote.created_at,
        updatedAt: dbNote.updated_at,
    }));
}

/**
 * Creates one or more new production notes in the database.
 * Handles backwards compatibility by trying the new table first, then falling back to legacy system.
 *
 * @param newNotesArgs - The new production notes to be created.
 * @param fetchNotesFunction - The function to call to fetch the notes from the database.
 * @returns DatabaseResponse with the new production notes.
 */
export async function createProductionNotes(
    newNotesArgs: NewProductionNoteArgs[],
    fetchNotesFunction: () => Promise<void>,
): Promise<DatabaseResponse<DatabaseProductionNote[]>> {
    try {
        // Try to create using the new production_notes table
        const createResponse =
            await window.electron.createProductionNotes(newNotesArgs);

        if (createResponse.success) {
            await fetchNotesFunction();
            return createResponse;
        }

        // If the new table doesn't exist, fall back to legacy system
        // This would happen if the migration hasn't been applied yet
        console.warn(
            "Production notes table not available, using legacy system",
        );

        // For now, return an error since we can't create notes in the legacy system
        // In a future update, we could implement legacy note creation
        return {
            success: false,
            data: [],
            error: {
                message:
                    "Production notes table not available. Please update your database.",
            },
        };
    } catch (error) {
        console.error("Error creating production notes:", error);
        return {
            success: false,
            data: [],
            error: {
                message:
                    error instanceof Error
                        ? error.message
                        : "Failed to create production notes",
            },
        };
    }
}

/**
 * Update one or many production notes with the provided arguments.
 *
 * @param modifiedNotesArgs - The objects to update the production notes with.
 * @param fetchNotesFunction - The function to call to fetch the notes from the database.
 * @returns DatabaseResponse: { success: boolean; errorMessage?: string;}
 */
export async function updateProductionNotes(
    modifiedNotesArgs: ModifiedProductionNoteArgs[],
    fetchNotesFunction: () => Promise<void>,
) {
    const response =
        await window.electron.updateProductionNotes(modifiedNotesArgs);

    if (response.success) await fetchNotesFunction();
    return response;
}

/**
 * Deletes production notes from the database.
 *
 * @param noteIds - The ids of the production notes to delete.
 * @param fetchNotesFunction - The function to call to fetch the notes from the database.
 * @returns Response data from the server.
 */
export async function deleteProductionNotes(
    noteIds: Set<number>,
    fetchNotesFunction: () => Promise<void>,
) {
    const deleteResponse = await window.electron.deleteProductionNotes(noteIds);

    if (deleteResponse.success) await fetchNotesFunction();
    return deleteResponse;
}

/**
 * Gets production notes for a specific page.
 * Supports backwards compatibility with legacy JSON notes in pages.notes field.
 *
 * @param pageId - The ID of the page to get notes for.
 * @returns DatabaseResponse with the production notes for the page.
 */
export async function getProductionNotesByPage(
    pageId: number,
): Promise<DatabaseResponse<DatabaseProductionNote[]>> {
    try {
        // First try the new production_notes table
        const response = await window.electron.getProductionNotesByPage(pageId);

        if (response.success && response.data && response.data.length > 0) {
            return response;
        }

        // If no notes in the new table, check for legacy notes in pages.notes
        const pagesResponse = await window.electron.getPages();
        if (pagesResponse.success && pagesResponse.data) {
            const page = pagesResponse.data.find((p) => p.id === pageId);
            if (page && page.notes) {
                try {
                    const legacyNotes = JSON.parse(page.notes);
                    if (Array.isArray(legacyNotes) && legacyNotes.length > 0) {
                        // Convert legacy notes to new format
                        const convertedNotes: DatabaseProductionNote[] =
                            legacyNotes.map((note, index) => ({
                                id: -(index + 1), // Use negative IDs for legacy notes to avoid conflicts
                                page_id: pageId,
                                content:
                                    typeof note === "string"
                                        ? note
                                        : note.content || "",
                                is_published: true,
                                order_index: index,
                                created_at: new Date().toISOString(),
                                updated_at: new Date().toISOString(),
                            }));

                        return { success: true, data: convertedNotes };
                    }
                } catch (parseError) {
                    console.warn(
                        "Failed to parse legacy notes for page",
                        pageId,
                        parseError,
                    );
                }
            }
        }

        // Return empty array if no notes found in either system
        return { success: true, data: [] };
    } catch (error) {
        console.error("Error getting production notes:", error);
        return {
            success: false,
            data: [],
            error: {
                message:
                    error instanceof Error
                        ? error.message
                        : "Failed to get production notes",
            },
        };
    }
}
