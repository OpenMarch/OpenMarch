import { authenticatedFetch } from "./api-client";
import { workspaceSettingsSchema } from "../../../src/settings/workspaceSettings";
import { DB } from "electron/database/db";
import { toCompressedOpenMarchBytes } from "./dots-to-om";

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

const getOtmProductionId = async (db: DB): Promise<string | undefined> => {
    const workspaceSettings = await db.query.workspace_settings.findFirst({
        columns: {
            json_data: true,
        },
    });
    if (workspaceSettings == null) return undefined;

    const workspaceSettingsJson = workspaceSettingsSchema.parse(
        JSON.parse(workspaceSettings.json_data),
    );
    return workspaceSettingsJson.otmProductionId;
};

const SHOW_DATA_FILENAME = "show_data.gz";

/**
 * Creates a production revision on the server (om-online API).
 * POST /api/editor/v1/productions/:production_id/revisions
 * Params: show_data (file), set_active (optional boolean).
 */
async function createRevisionOnServer({
    productionId,
    data,
    setActive = true,
    onProgress,
}: {
    productionId: string;
    data: Uint8Array;
    setActive?: boolean;
    onProgress?: UploadProgressCallback;
}): Promise<UploadResult> {
    onProgress?.({
        status: "progress",
        message: "Uploading file...",
        progress: 0,
    });

    const formData = new FormData();
    // Copy into ArrayBuffer so Blob accepts it (avoids Uint8Array<ArrayBufferLike> vs BlobPart)
    const buffer = new ArrayBuffer(data.length);
    new Uint8Array(buffer).set(data);
    const blob = new Blob([buffer], { type: "application/gzip" });
    formData.append("show_data", blob, SHOW_DATA_FILENAME);
    formData.append("set_active", setActive ? "true" : "false");

    onProgress?.({
        status: "progress",
        message: "Connecting to server...",
        progress: 10,
    });

    const path = `api/editor/v1/productions/${productionId}/revisions`;
    let response: Response;
    try {
        response = await authenticatedFetch(path, {
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
        message: "Revision created successfully",
    };
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
    dbConnection: DB,
    onProgress?: UploadProgressCallback,
): Promise<UploadResult> {
    try {
        const productionId = await getOtmProductionId(dbConnection);
        if (!productionId) {
            const errorResult: UploadResult = {
                success: false,
                error: "No OTM production linked. Set OTM production in workspace settings.",
            };
            onProgress?.({ status: "error", error: errorResult.error });
            return errorResult;
        }

        onProgress?.({
            status: "progress",
            message: "Reading file...",
            progress: 30,
        });
        const omzBytes = await toCompressedOpenMarchBytes(dbConnection);

        const result = await createRevisionOnServer({
            productionId,
            data: omzBytes,
            setActive: true,
            onProgress,
        });

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
    }
}
