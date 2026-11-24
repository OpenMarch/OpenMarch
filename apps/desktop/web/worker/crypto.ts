/**
 * Stands in for `node:crypto` in the worker. Drizzle's migrator stores the
 * SHA-256 of each migration it applies in the show file, and needs it
 * synchronously, which Web Crypto can't do. `@noble/hashes` computes the
 * same digest Node does, so a show migrated on the web matches one migrated
 * on desktop.
 */
import { sha256 } from "@noble/hashes/sha2.js";

const toHex = (bytes: Uint8Array) =>
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export function createHash(algorithm: string) {
    if (algorithm.toLowerCase() !== "sha256")
        throw new Error(`createHash: ${algorithm} isn't available on the web`);
    const chunks: Uint8Array[] = [];
    const hash = {
        update(data: string | Uint8Array) {
            chunks.push(
                typeof data === "string"
                    ? new TextEncoder().encode(data)
                    : data,
            );
            return hash;
        },
        digest(encoding?: string) {
            const all = new Uint8Array(
                chunks.reduce((n, chunk) => n + chunk.length, 0),
            );
            let at = 0;
            for (const chunk of chunks) {
                all.set(chunk, at);
                at += chunk.length;
            }
            const digest = sha256(all);
            if (encoding === "hex") return toHex(digest);
            if (encoding === undefined) return digest;
            throw new Error(`digest: ${encoding} encoding isn't supported`);
        },
    };
    return hash;
}

export const randomUUID = () => globalThis.crypto.randomUUID();

const nodeCrypto = { createHash, randomUUID };
export default nodeCrypto;
