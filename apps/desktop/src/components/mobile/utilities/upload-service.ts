import { DB } from "electron/database/db";
import { toCompressedOpenMarchBytes } from "./dots-to-om";
import { workspaceSettingsSchema } from "@/settings/workspaceSettings";
import { postApiEditorV1ProductionsProductionIdRevisions } from "@/api/generated/production-revisions/production-revisions";
import { patchApiEditorV1EnsemblesEnsembleIdPerformerLabels } from "@/api/generated/performer-labels/performer-labels";

export type UploadResult =
    | { success: true; ensembleId: number; message: string }
    | {
          success: false;
          error: string;
      };

export interface UploadProgress {
    status: "loading" | "progress" | "error" | "success";
    message?: string;
    progress?: number; // 0-100
    error?: string;
}

export type UploadProgressCallback = (progress: UploadProgress) => void;

const getOtmProductionId = async (db: DB): Promise<number | undefined> => {
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
    productionId: number;
    data: Uint8Array;
    setActive?: boolean;
    title?: string;
}): Promise<UploadResult> {
    // Copy into ArrayBuffer so Blob accepts it (avoids Uint8Array<ArrayBufferLike> vs BlobPart)
    const buffer = new ArrayBuffer(data.length);
    new Uint8Array(buffer).set(data);
    const blob = new Blob([buffer], { type: "application/gzip" });

    let response;
    try {
        response = await postApiEditorV1ProductionsProductionIdRevisions(
            productionId,
            {
                show_data: blob,
                set_active: setActive,
                title: title?.trim() || undefined,
            },
        );
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
        ensembleId: response.revision.ensemble_id,
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

        const performerLabels = (
            await dbConnection.query.marchers.findMany({
                columns: {
                    drill_prefix: true,
                    drill_order: true,
                },
            })
        ).map((marcher) => `${marcher.drill_prefix}${marcher.drill_order}`);

        const omzBytes = await toCompressedOpenMarchBytes(dbConnection);

        const revisionUploadResult = await createRevisionOnServer({
            productionId,
            data: omzBytes,
            setActive: true,
            title,
        });

        if (!revisionUploadResult.success) {
            throw new Error(revisionUploadResult.error || "Upload failed");
        }

        await patchApiEditorV1EnsemblesEnsembleIdPerformerLabels(
            revisionUploadResult.ensembleId,
            {
                labels: performerLabels,
            },
        );

        return revisionUploadResult;
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        throw new Error(`Upload failed: ${errorMessage}`);
    }
}
