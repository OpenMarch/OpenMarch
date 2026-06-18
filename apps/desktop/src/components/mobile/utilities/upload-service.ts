import type { DB } from "@/global/database/db";
import { toCompressedOpenMarchBytes } from "./dots-to-om";
import { workspaceSettingsSchema } from "@/settings/workspaceSettings";
import { postApiEditorV1ProductionsProductionIdRevisions } from "@/api/generated/production-revisions/production-revisions";
import { _createSectionMappings } from "./create-section-mappings";
import { FieldProperties, rgbaToString } from "@openmarch/core";

type RevisionCanvasColors = {
    canvas_background_color: string;
    canvas_primary_stroke: string;
    canvas_secondary_stroke: string;
    canvas_grid_stroke: string;
    canvas_performer_text_color: string;
};

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

const getRevisionCanvasColors = async (
    db: DB,
): Promise<RevisionCanvasColors> => {
    const fieldPropertiesRow = await db.query.field_properties.findFirst({
        columns: {
            json_data: true,
        },
    });
    if (fieldPropertiesRow == null) {
        throw new Error("Field properties not found");
    }

    const fieldProperties = new FieldProperties(
        JSON.parse(fieldPropertiesRow.json_data),
    );
    const { theme } = fieldProperties;

    console.log("theme", theme);

    return {
        canvas_background_color: rgbaToString(theme.background),
        canvas_primary_stroke: rgbaToString(theme.primaryStroke),
        canvas_secondary_stroke: rgbaToString(theme.secondaryStroke),
        canvas_grid_stroke: rgbaToString(theme.tertiaryStroke),
        canvas_performer_text_color: rgbaToString(theme.defaultMarcher.label),
    };
};

/**
 * Creates a production revision on the server (om-online API).
 * POST /api/editor/v1/productions/:production_id/revisions
 */
async function createRevisionOnServer({
    productionId,
    data,
    setActive = true,
    title,
    canvasColors,
    labels,
    prefixMap,
}: {
    productionId: number;
    data: Uint8Array;
    setActive?: boolean;
    title?: string;
    canvasColors: RevisionCanvasColors;
    labels: string[];
    prefixMap: Record<string, string>;
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
                labels,
                prefix_map: JSON.stringify(prefixMap),
                ...canvasColors,
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

        const marchers = await dbConnection.query.marchers.findMany({
            columns: {
                section: true,
                drill_prefix: true,
                drill_order: true,
            },
        });
        const performerLabels = marchers.map(
            (marcher) => `${marcher.drill_prefix}${marcher.drill_order}`,
        );
        const sectionMappings = _createSectionMappings(marchers);
        const canvasColors = await getRevisionCanvasColors(dbConnection);

        const omzBytes = await toCompressedOpenMarchBytes(dbConnection);

        const revisionUploadResult = await createRevisionOnServer({
            productionId,
            data: omzBytes,
            setActive: true,
            title,
            canvasColors,
            labels: performerLabels,
            prefixMap: sectionMappings,
        });

        if (!revisionUploadResult.success) {
            throw new Error(revisionUploadResult.error || "Upload failed");
        }

        return revisionUploadResult;
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        throw new Error(`Upload failed: ${errorMessage}`);
    }
}
