/**
 * TEMPORARY (see ../README.md). Stands in for `node:crypto` in the web build.
 * Drizzle's migrator stores a hash of each migration it applies; the app
 * compares migrations by time, never by hash, so any stable digest will do.
 */
export function createHash(_algorithm: string) {
    let text = "";
    const hash = {
        update(data: string) {
            text += data;
            return hash;
        },
        digest(_encoding?: string) {
            let h1 = 0xdeadbeef;
            let h2 = 0x41c6ce57;
            for (let i = 0; i < text.length; i++) {
                const c = text.charCodeAt(i);
                h1 = Math.imul(h1 ^ c, 2654435761);
                h2 = Math.imul(h2 ^ c, 1597334677);
            }
            return (
                (h1 >>> 0).toString(16).padStart(8, "0") +
                (h2 >>> 0).toString(16).padStart(8, "0")
            );
        },
    };
    return hash;
}

export const randomUUID = () => globalThis.crypto.randomUUID();

export function randomBytes(size: number) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(size));
    return Object.assign(bytes, {
        toString: (encoding?: string) =>
            encoding === "hex"
                ? Array.from(bytes, (b) =>
                      b.toString(16).padStart(2, "0"),
                  ).join("")
                : String.fromCharCode(...bytes),
    });
}

const nodeCrypto = { createHash, randomUUID, randomBytes };
export default nodeCrypto;
