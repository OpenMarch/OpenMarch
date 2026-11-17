// cspell:words IHDR VP8L VP8X KTX2
/**
 * An image's size from its header alone, so a texture too large to decode safely is refused
 * before anything decodes it (fork #998). PNG, JPEG, WebP and KTX2.
 */

export interface ImageHeader {
    mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/ktx2";
    width: number;
    height: number;
}

const startsWith = (bytes: Uint8Array, magic: readonly number[], at = 0) =>
    bytes.byteLength >= at + magic.length &&
    magic.every((b, i) => bytes[at + i] === b);

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];
const KTX2 = [
    0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
];

/** The image's type and size, or null when the header isn't one of the four or is cut short. */
export function readImageHeader(bytes: Uint8Array): ImageHeader | null {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (startsWith(bytes, PNG)) {
        // IHDR is always the first chunk
        if (bytes.byteLength < 24) return null;
        return {
            mimeType: "image/png",
            width: view.getUint32(16),
            height: view.getUint32(20),
        };
    }
    if (startsWith(bytes, [0xff, 0xd8])) return jpegHeader(bytes, view);
    if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8))
        return webpHeader(bytes, view);
    if (startsWith(bytes, KTX2)) {
        if (bytes.byteLength < 28) return null;
        return {
            mimeType: "image/ktx2",
            width: view.getUint32(20, true),
            height: Math.max(1, view.getUint32(24, true)),
        };
    }
    return null;
}

/** The first start-of-frame marker's size. */
function jpegHeader(bytes: Uint8Array, view: DataView): ImageHeader | null {
    let offset = 2;
    while (offset + 4 <= bytes.byteLength) {
        if (bytes[offset] !== 0xff) return null;
        const marker = bytes[offset + 1];
        if (marker === 0xff) {
            offset++; // fill byte
            continue;
        }
        if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
            offset += 2;
            continue;
        }
        const length = view.getUint16(offset + 2);
        // SOF0–SOF15, apart from DHT (C4), JPG (C8) and DAC (CC)
        const isFrame =
            marker >= 0xc0 &&
            marker <= 0xcf &&
            marker !== 0xc4 &&
            marker !== 0xc8 &&
            marker !== 0xcc;
        if (isFrame) {
            if (offset + 9 > bytes.byteLength) return null;
            return {
                mimeType: "image/jpeg",
                height: view.getUint16(offset + 5),
                width: view.getUint16(offset + 7),
            };
        }
        offset += 2 + length;
    }
    return null;
}

function webpHeader(bytes: Uint8Array, view: DataView): ImageHeader | null {
    if (bytes.byteLength < 30) return null;
    const chunk = String.fromCharCode(...bytes.subarray(12, 16));
    if (chunk === "VP8 ") {
        return {
            mimeType: "image/webp",
            width: view.getUint16(26, true) & 0x3fff,
            height: view.getUint16(28, true) & 0x3fff,
        };
    }
    if (chunk === "VP8L") {
        const bits = view.getUint32(21, true);
        return {
            mimeType: "image/webp",
            width: (bits & 0x3fff) + 1,
            height: ((bits >> 14) & 0x3fff) + 1,
        };
    }
    if (chunk === "VP8X") {
        const u24 = (at: number) =>
            bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
        return {
            mimeType: "image/webp",
            width: u24(24) + 1,
            height: u24(27) + 1,
        };
    }
    return null;
}
