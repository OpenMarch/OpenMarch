// cspell:words premultiplying EXIF
/**
 * Decoding and encoding images for the model import (fork #998). The worker uses the browser's
 * own codecs (`createImageBitmap` and `OffscreenCanvas`, no `sharp`, as spike #995 measured);
 * tests in Node pass a stand-in.
 */

export interface ImageCodec {
    /** The image shrunk to `width` × `height`, in its own format (PNG keeps its alpha). */
    resize(
        bytes: Uint8Array,
        mimeType: string,
        width: number,
        height: number,
    ): Promise<Uint8Array>;
    /** The image's average color, RGBA from 0 to 1, as stored (sRGB for a color texture) */
    averageColor(
        bytes: Uint8Array,
        mimeType: string,
    ): Promise<[number, number, number, number]>;
}

const asBlob = (bytes: Uint8Array, type: string) =>
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type });

/** The browser's codecs, in a worker or a page. */
export const browserImageCodec: ImageCodec = {
    async resize(bytes, mimeType, width, height) {
        // No color conversion or premultiplying: normal, roughness and metal maps are data, not
        // colors, and alpha must survive as stored
        const bitmap = await createImageBitmap(asBlob(bytes, mimeType), {
            resizeWidth: width,
            resizeHeight: height,
            resizeQuality: "high",
            premultiplyAlpha: "none",
            colorSpaceConversion: "none",
            // The size came from the header, which ignores EXIF orientation; so does glTF
            imageOrientation: "none",
        });
        try {
            const canvas = new OffscreenCanvas(width, height);
            const context = canvas.getContext("2d");
            if (!context) throw new Error("no 2D canvas in this worker");
            context.drawImage(bitmap, 0, 0);
            const blob = await canvas.convertToBlob({
                type: mimeType,
                quality: mimeType === "image/png" ? undefined : 0.9,
            });
            if (blob.type !== mimeType)
                throw new Error(`can't write ${mimeType} here`);
            return new Uint8Array(await blob.arrayBuffer());
        } finally {
            bitmap.close();
        }
    },
    async averageColor(bytes, mimeType) {
        const bitmap = await createImageBitmap(asBlob(bytes, mimeType), {
            resizeWidth: 4,
            resizeHeight: 4,
            resizeQuality: "medium",
            premultiplyAlpha: "none",
            colorSpaceConversion: "none",
            imageOrientation: "none",
        });
        try {
            const canvas = new OffscreenCanvas(4, 4);
            const context = canvas.getContext("2d");
            if (!context) throw new Error("no 2D canvas in this worker");
            context.drawImage(bitmap, 0, 0);
            const { data } = context.getImageData(0, 0, 4, 4);
            const sum = [0, 0, 0, 0];
            for (let i = 0; i < data.length; i++) sum[i % 4] += data[i];
            const n = (data.length / 4) * 255;
            return [sum[0] / n, sum[1] / n, sum[2] / n, sum[3] / n];
        } finally {
            bitmap.close();
        }
    },
};
