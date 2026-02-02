/**
 * Utilities for syncing the local background image when uploading a revision
 * to the server (checksum matching, upload if different or missing).
 */

export type BackgroundImageSyncResult = {
    localChecksum: string;
    imageData: Uint8Array;
    needsUpload: boolean;
};

/**
 * Prepares the background image sync result: compute local checksum and determine if upload is needed.
 * Returns null when there is no local image.
 *
 * @param localImage - Local background image bytes (from getFieldPropertiesImage) or null
 * @param serverChecksum - Production's background_image_checksum (string or null)
 * @param computeChecksum - Async checksum function (e.g. AudioFile.computeChecksum) - SHA256 hex
 */
export async function prepareBackgroundImageSyncResult(
    localImage: Uint8Array | null,
    serverChecksum: string | null,
    computeChecksum: (data: ArrayBuffer | Uint8Array) => Promise<string>,
): Promise<BackgroundImageSyncResult | null> {
    if (localImage == null || localImage.length === 0) return null;
    const localChecksum = await computeChecksum(localImage);
    const needsUpload =
        serverChecksum == null || serverChecksum !== localChecksum;
    return {
        localChecksum,
        imageData: localImage,
        needsUpload,
    };
}

const DEFAULT_BACKGROUND_IMAGE_FILENAME = "background.png";

/**
 * Builds FormData for uploading the background image to the production background_image endpoint.
 * Uses key "file" to match the server param.
 */
export function buildBackgroundImageFormData(
    imageData: Uint8Array,
    filename: string = DEFAULT_BACKGROUND_IMAGE_FILENAME,
): FormData {
    const blob = new Blob([imageData], { type: "image/png" });
    const formData = new FormData();
    formData.append("file", blob, filename);
    return formData;
}
