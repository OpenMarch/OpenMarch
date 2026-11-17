/**
 * Reading the show's asset bytes through memory (fork #997, ported from the parked Library's
 * `showBlobCache.ts` on `archive/pre-convergence`).
 *
 * The asset rows load with the show; bytes are read lazily by hash through a small
 * least-recently-used cache. A hash names its bytes wherever they come from, so a cached blob is
 * never stale: the cache doesn't need clearing when another show opens, only to free memory.
 */
import { sha256Hex } from "./hash";

/** Default budget: the models and textures of a few dozen props. */
export const SHOW_BLOB_CACHE_BYTES = 64 * 1024 * 1024;

export interface ShowBlobCache {
    /** The blob's bytes, or undefined when the show doesn't have it. */
    get(hash: string): Promise<Uint8Array | undefined>;
    /** Bytes held now. */
    cachedBytes(): number;
    /** Forgets every blob. */
    clear(): void;
}

/**
 * A least-recently-used cache of blobs, bounded by bytes. Callers asking for the same blob at
 * once share one read. A blob over the whole budget is handed back but not kept, and a missing
 * blob or a failed read isn't remembered.
 *
 * Bytes that don't hash to the hash they were read under are refused (undefined, with a
 * warning), so a damaged or hand-edited file draws its assets as missing rather than wrong.
 *
 * Every caller gets the same cached array: read it, never change or transfer it (transferring
 * its buffer to a worker would empty it for everyone). Copy it first, e.g. `data.slice()`.
 */
export function createShowBlobCache({
    read,
    maxBytes = SHOW_BLOB_CACHE_BYTES,
}: {
    read: (hash: string) => Promise<Uint8Array | undefined>;
    maxBytes?: number;
}): ShowBlobCache {
    // Map order is recency: the first entry is the least recently used
    const held = new Map<string, Uint8Array>();
    const pending = new Map<string, Promise<Uint8Array | undefined>>();
    let bytes = 0;
    // Bumped on clear, so a read that started before it isn't kept
    let generation = 0;

    const keep = (hash: string, data: Uint8Array) => {
        if (data.byteLength > maxBytes || held.has(hash)) return;
        held.set(hash, data);
        bytes += data.byteLength;
        for (const [oldHash, old] of held) {
            if (bytes <= maxBytes) break;
            held.delete(oldHash);
            bytes -= old.byteLength;
        }
    };

    const readChecked = async (hash: string) => {
        const data = await read(hash);
        if (!data) return undefined;
        const actual = await sha256Hex(data);
        if (actual !== hash) {
            console.warn(
                `Show asset blob ${hash} holds bytes hashing to ${actual}; treating it as missing`,
            );
            return undefined;
        }
        return data;
    };

    return {
        async get(hash) {
            const hit = held.get(hash);
            if (hit) {
                held.delete(hash);
                held.set(hash, hit);
                return hit;
            }
            const started = generation;
            let reading = pending.get(hash);
            if (!reading) {
                const current = readChecked(hash).finally(() => {
                    if (pending.get(hash) === current) pending.delete(hash);
                });
                reading = current;
                pending.set(hash, reading);
            }
            const data = await reading;
            if (data && started === generation) keep(hash, data);
            return data;
        },
        cachedBytes: () => bytes,
        clear() {
            generation++;
            held.clear();
            pending.clear();
            bytes = 0;
        },
    };
}
