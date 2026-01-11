import Database from "better-sqlite3";
import * as fs from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { eq, sql } from "drizzle-orm";
import { getOrm, schema } from "../../database/db";
import * as DatabaseServices from "../../database/database.services";
import { authenticatedFetch } from "./api-client";
import { workspaceSettingsSchema } from "../../../src/settings/workspaceSettings";

export interface UploadResult {
    success: boolean;
    error?: string;
    message?: string;
}

export interface UploadProgress {
    status: "loading" | "progress" | "error" | "success";
    message?: string;
    progress?: number; // 0-100
    error?: string;
}

export type UploadProgressCallback = (progress: UploadProgress) => void;

/**
 * Validates that a database path exists and is accessible.
 */
function validateDatabasePath(dbPath: string): UploadResult | null {
    if (!dbPath || dbPath.length === 0) {
        return {
            success: false,
            error: "No database is currently open",
        };
    }

    if (!fs.existsSync(dbPath)) {
        return {
            success: false,
            error: `Database file does not exist at path: ${dbPath}`,
        };
    }

    return null;
}

/**
 * Clears sensitive data from the temporary database and vacuums it.
 */
function clearDatabaseData(orm: ReturnType<typeof getOrm>): void {
    // Clear history_undo table
    orm.delete(schema.history_undo).run();

    // Clear audio_files table
    orm.delete(schema.audio_files).run();

    // Clear field_properties.image column
    orm.update(schema.field_properties)
        .set({ image: null })
        .where(eq(schema.field_properties.id, 1))
        .run();

    // Vacuum the database
    orm.run(sql.raw("VACUUM"));
}

const getOtmIds = async (
    orm: ReturnType<typeof getOrm>,
): Promise<{
    otmEnsembleId: string | undefined;
    otmProductionId: string | undefined;
}> => {
    const workspaceSettings = await orm.query.workspace_settings.findFirst({
        columns: {
            json_data: true,
        },
    });
    if (workspaceSettings == null)
        return { otmEnsembleId: undefined, otmProductionId: undefined };

    const workspaceSettingsJson = workspaceSettingsSchema.parse(
        JSON.parse(workspaceSettings.json_data),
    );
    return {
        otmEnsembleId: workspaceSettingsJson.otmEnsembleId,
        otmProductionId: workspaceSettingsJson.otmProductionId,
    };
};

/**
 * Uploads the file buffer to the server endpoint.
 */
async function uploadFileToServer(
    fileBuffer: Buffer,
    fileName: string,
    onProgress?: UploadProgressCallback,
): Promise<UploadResult> {
    onProgress?.({
        status: "progress",
        message: "Uploading file...",
        progress: 0,
    });

    const formData = new FormData();
    // Convert Buffer to Uint8Array then to Blob for FormData compatibility
    const uint8Array = new Uint8Array(fileBuffer);
    const blob = new Blob([uint8Array], { type: "application/octet-stream" });
    formData.append("file", blob, fileName);

    onProgress?.({
        status: "progress",
        message: "Connecting to server...",
        progress: 10,
    });

    let response: Response;
    try {
        response = await authenticatedFetch("", {
            method: "POST",
            body: formData,
        });
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        return {
            success: false,
            error: `Upload failed: ${errorMessage}`,
        };
    }

    onProgress?.({
        status: "progress",
        message: "Upload complete",
        progress: 100,
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        return {
            success: false,
            error: `Upload failed with status ${response.status}: ${errorText}`,
        };
    }

    return {
        success: true,
        message: "Database uploaded successfully",
    };
}

/**
 * Prepares the database for upload by creating a temporary copy and clearing sensitive data.
 */
function prepareDatabaseForUpload(
    dbPath: string,
    tempFilePath: string,
    onProgress?: UploadProgressCallback,
): void {
    onProgress?.({
        status: "progress",
        message: "Creating temporary copy...",
        progress: 5,
    });
    fs.copyFileSync(dbPath, tempFilePath);

    onProgress?.({
        status: "progress",
        message: "Clearing sensitive data...",
        progress: 20,
    });
    const tempDb = new Database(tempFilePath);
    try {
        const orm = getOrm(tempDb);
        clearDatabaseData(orm);
    } finally {
        tempDb.close();
    }
}

/**
 * Uploads the current SQLite database file to a backend server.
 * Creates a temporary copy, clears undo_history, audio files, and image_data,
 * vacuums the database, then uploads it.
 *
 * @param onProgress Optional callback to receive progress updates
 * @returns UploadResult indicating success or failure
 */
export async function uploadDatabaseToServer(
    onProgress?: UploadProgressCallback,
): Promise<UploadResult> {
    const dbPath = DatabaseServices.getDbPath();

    onProgress?.({
        status: "loading",
        message: "Validating database...",
    });

    const validationError = validateDatabasePath(dbPath);
    if (validationError) {
        onProgress?.({
            status: "error",
            error: validationError.error,
        });
        return validationError;
    }

    const timestamp = Date.now();
    const tempFileName = `upload-temp-${timestamp}.dots`;
    const tempFilePath = join(tmpdir(), tempFileName);
    let tempFileCreated = false;

    try {
        prepareDatabaseForUpload(dbPath, tempFilePath, onProgress);
        tempFileCreated = true;

        onProgress?.({
            status: "progress",
            message: "Reading file...",
            progress: 30,
        });

        const fileBuffer = fs.readFileSync(tempFilePath);
        const result = await uploadFileToServer(
            fileBuffer,
            tempFileName,
            onProgress,
        );

        if (result.success) {
            onProgress?.({
                status: "success",
                message: result.message || "Upload successful",
            });
        } else {
            onProgress?.({
                status: "error",
                error: result.error,
            });
        }

        return result;
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        const errorResult = {
            success: false,
            error: `Upload failed: ${errorMessage}`,
        };
        onProgress?.({
            status: "error",
            error: errorResult.error,
        });
        return errorResult;
    } finally {
        if (tempFileCreated && fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
            } catch (cleanupError) {
                console.error(
                    "Failed to delete temporary file:",
                    tempFilePath,
                    cleanupError,
                );
            }
        }
    }
}
