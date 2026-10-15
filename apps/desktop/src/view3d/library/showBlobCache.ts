/**
 * Reading the show's embedded Library bytes (props-spec.md section 2, "In the show"; C1.11).
 *
 * The item table loads at open; blobs are read lazily by hash, for the current or a nearby
 * moment, through a small in-memory cache. Rendering never reads originals.
 */
import { RENDER_ROLES, type RenderRole } from "./protocol";

/** Default budget: enough for the display textures and models of a few nearby moments. */
export const SHOW_BLOB_CACHE_BYTES = 64 * 1024 * 1024;

export interface ShowBlobCache {
    /** The blob's bytes, or undefined when the show doesn't have it. */
    get(hash: string): Promise<Uint8Array | undefined>;
    /** Bytes held now. */
    cachedBytes(): number;
    /** Forgets every blob, such as when another show opens. */
    clear(): void;
}

/**
 * A least-recently-used cache of blobs, bounded by bytes. Callers asking for the same blob at
 * once share one read. A blob over the whole budget is handed back but not kept, and a missing
 * blob or a failed read isn't remembered.
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
                const current = read(hash).finally(() => {
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

/**
 * The blob hash of a part rendering may read, or undefined when the Version has no such part.
 * Throws for any other role: an Artwork's original is embedded for export and "Add to my
 * Library", never for drawing (D-12).
 */
export function renderPartHash(
    item: { parts: Readonly<Record<string, string>> },
    role: RenderRole,
): string | undefined {
    if (!(RENDER_ROLES as readonly string[]).includes(role)) {
        throw new Error(`Rendering can't read the ${role} part`);
    }
    return item.parts[role];
}
