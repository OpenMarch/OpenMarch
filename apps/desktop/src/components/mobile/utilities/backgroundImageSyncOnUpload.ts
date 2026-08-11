/**
 * Utilities for syncing the local background image when uploading a revision
 * to the server (source checksum matching, upload if different or missing).
 */

export type BackgroundImageDrawType = "fill" | "fit";

export type BackgroundImageSyncResult = {
    localChecksum: string;
    imageData: Uint8Array;
    localDrawType: BackgroundImageDrawType;
    needsUpload: boolean;
    needsDrawTypePatch: boolean;
};

/**
 * Prepares the background image sync result: compute local source checksum and determine if upload is needed.
 * Returns null when there is no local image.
 *
 * @param localImage - Local background image bytes (from getFieldPropertiesImage) or null
 * @param serverSourceChecksum - Production's background_image_source_checksum (string or null)
 * @param localDrawType - Local imageFillOrFit from field properties
 * @param serverDrawType - Production's background_image_draw_type (string or null)
 * @param computeChecksum - Async checksum function (e.g. AudioFile.computeChecksum) - SHA256 hex
 */
export async function prepareBackgroundImageSyncResult(
    localImage: Uint8Array | null,
    serverSourceChecksum: string | null,
    localDrawType: BackgroundImageDrawType,
    serverDrawType: BackgroundImageDrawType | null,
    computeChecksum: (data: ArrayBuffer | Uint8Array) => Promise<string>,
): Promise<BackgroundImageSyncResult | null> {
    if (localImage == null || localImage.length === 0) return null;
    const localChecksum = await computeChecksum(localImage);
    const needsUpload =
        serverSourceChecksum == null || serverSourceChecksum !== localChecksum;
    const needsDrawTypePatch =
        !needsUpload &&
        serverSourceChecksum != null &&
        serverDrawType !== localDrawType;
    return {
        localChecksum,
        imageData: localImage,
        localDrawType,
        needsUpload,
        needsDrawTypePatch,
    };
}

const DEFAULT_BACKGROUND_IMAGE_FILENAME = "background.png";

/**
 * Builds FormData for uploading the background image to the production background_image endpoint.
 * Uses key "file" to match the server param.
 */
export function buildBackgroundImageFormData(
    imageData: Uint8Array,
    drawType: BackgroundImageDrawType,
    filename: string = DEFAULT_BACKGROUND_IMAGE_FILENAME,
): FormData {
    const buffer = new ArrayBuffer(imageData.length);
    new Uint8Array(buffer).set(imageData);
    const blob = new Blob([buffer], { type: "image/png" });
    const formData = new FormData();
    formData.append("file", blob, filename);
    formData.append("background_image_draw_type", drawType);
    return formData;
}
