/**
 * Utilities for syncing the local background image when uploading a revision
 * to the server (source checksum matching, upload if different or missing).
 */
import tolgee from "@/global/singletons/Tolgee";
import { sniffArtworkFormat } from "@om-electron/main/artwork-import/formats";

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
 * @param localImage - Local background image PNG bytes (`backgroundImagePng`) or null
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

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export const isPng = (bytes: Uint8Array) =>
    PNG_SIGNATURE.every((byte, i) => bytes[i] === byte);

/** Draws any image the browser reads into PNG bytes. */
export type PngEncoder = (bytes: Uint8Array) => Promise<Uint8Array>;

/** The browser's encoder: the image drawn on a canvas at its own size, written as a PNG. */
export const canvasPngEncoder: PngEncoder = async (bytes) => {
    const svg = sniffArtworkFormat(bytes) === "svg";
    const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], svg ? { type: "image/svg+xml" } : {}),
    );
    try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth || 300;
        canvas.height = image.naturalHeight || 150;
        const context = canvas.getContext("2d");
        if (!context)
            throw new Error(
                tolgee.t(
                    "mobileExport.settings.backgroundImage.drawFailed",
                    "The background image couldn't be drawn",
                ),
            );
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/png"),
        );
        if (!blob)
            throw new Error(
                tolgee.t(
                    "mobileExport.settings.backgroundImage.drawFailed",
                    "The background image couldn't be drawn",
                ),
            );
        return new Uint8Array(await blob.arrayBuffer());
    } finally {
        URL.revokeObjectURL(url);
    }
};

/**
 * The background image as mobile takes it, a PNG (ADR 0002 D-23: flattened at sync time). A
 * PNG goes as it is, so its checksum matches what an earlier sync uploaded; anything else (a
 * JPEG floor original, a legacy GIF) is drawn into a PNG.
 */
export async function backgroundImagePng(
    bytes: Uint8Array | null,
    encode: PngEncoder = canvasPngEncoder,
): Promise<Uint8Array | null> {
    if (bytes == null || bytes.length === 0) return null;
    return isPng(bytes) ? bytes : encode(bytes);
}

/**
 * Builds FormData for uploading the background image to the production background_image endpoint.
 * Uses key "file" to match the server param. `imageData` is a PNG (`backgroundImagePng`).
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
