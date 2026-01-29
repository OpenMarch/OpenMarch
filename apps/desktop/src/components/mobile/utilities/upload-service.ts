import { DB } from "electron/database/db";
import { toCompressedOpenMarchBytes } from "./dots-to-om";
import { workspaceSettingsSchema } from "@/settings/workspaceSettings";
import { apiPostFormData } from "@/auth/api-client";

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
 * Params: show_data (file), set_active (optional boolean), title (optional string).
 */
async function createRevisionOnServer({
    productionId,
    data,
    setActive = true,
    title,
}: {
    productionId: string;
    data: Uint8Array;
    setActive?: boolean;
    title?: string;
}): Promise<UploadResult> {
    const formData = new FormData();
    // Copy into ArrayBuffer so Blob accepts it (avoids Uint8Array<ArrayBufferLike> vs BlobPart)
    const buffer = new ArrayBuffer(data.length);
    new Uint8Array(buffer).set(data);
    const blob = new Blob([buffer], { type: "application/gzip" });
    formData.append("show_data", blob, SHOW_DATA_FILENAME);
    formData.append("set_active", setActive ? "true" : "false");
    if (title != null && title.trim() !== "") {
        formData.append("title", title.trim());
    }

    const path = `/v1/productions/${productionId}/revisions`;
    try {
        await apiPostFormData(path, formData);
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        return {
            success: false,
            error: `Upload failed: ${errorMessage}`,
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
 * @param title Optional revision title to send to the server
 * @param onProgress Optional callback to receive progress updates
 * @returns UploadResult indicating success or failure
 */
export async function uploadDatabaseToServer(
    dbConnection: DB,
    title?: string,
): Promise<UploadResult> {
    try {
        const productionId = await getOtmProductionId(dbConnection);
        if (!productionId) {
            throw new Error(
                "No OTM production linked. Set OTM production in workspace settings.",
            );
        }

        const omzBytes = await toCompressedOpenMarchBytes(dbConnection);

        const result = await createRevisionOnServer({
            productionId,
            data: omzBytes,
            setActive: true,
            title,
        });

        if (!result.success) {
            throw new Error(result.error || "Upload failed");
        }

        return result;
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        throw new Error(`Upload failed: ${errorMessage}`);
    }
}
