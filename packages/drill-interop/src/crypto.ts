/**
 * Per-set coordinate blocks are stored as an AES-128-CBC ciphertext, Base64
 * encoded. The source tool ships a single fixed key/IV pair (the scheme is
 * obfuscation, not secret-per-file), which we reproduce here so the coordinates
 * can be read back for interoperability.
 *
 * We use the Web Crypto API so the reader runs unchanged in Node and in a
 * browser/Electron renderer (which has no access to `node:crypto`).
 */
const KEY_BASE64 = "pPc2H/OrnOmTW7LOCnSkBQ==";
const IV_BASE64 = "GHdnz7UQwnmCMM5Qy0Gu0w==";

function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

const IV = base64ToBytes(IV_BASE64);

let keyPromise: Promise<CryptoKey> | undefined;
function getKey(): Promise<CryptoKey> {
    keyPromise ??= crypto.subtle.importKey(
        "raw",
        base64ToBytes(KEY_BASE64),
        { name: "AES-CBC" },
        false,
        ["decrypt"],
    );
    return keyPromise;
}

/**
 * Decodes a coordinate block into its plaintext record string.
 *
 * Newer documents Base64-encode an AES-128-CBC ciphertext; older ones may store
 * the record string directly. We attempt to decrypt and fall back to the raw
 * value when the input is not valid ciphertext.
 */
export async function decodeCoordinateBlock(encoded: string): Promise<string> {
    const trimmed = encoded.trim();
    try {
        const cipherBytes = base64ToBytes(trimmed);
        if (cipherBytes.length === 0 || cipherBytes.length % 16 !== 0) {
            return trimmed;
        }
        const plaintext = await crypto.subtle.decrypt(
            { name: "AES-CBC", iv: IV },
            await getKey(),
            cipherBytes,
        );
        return String.fromCharCode(...new Uint8Array(plaintext));
    } catch {
        return trimmed;
    }
}
