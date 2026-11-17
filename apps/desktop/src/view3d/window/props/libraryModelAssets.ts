/**
 * Loads imported models in the 3D View window (fork #1000): each GLB part of a model asset, by its
 * blob hash, read from the show through the window's read-only proxy (`showAssetBlobCache`) and
 * parsed with bare `GLTFLoader` (the stored GLB is plain: ADR 0010 amendment 2026-11-15).
 *
 * Every item drawn as the same model shares one parse. Unlike the built-ins, which stay loaded for
 * the window's lifetime, an imported model is counted: when the last user lets go its geometry,
 * materials and textures leave the GPU, so a show that swaps models doesn't pile them up.
 */
// cspell:ignore gltf
import { useSyncExternalStore } from "react";
import { Texture, type Material } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { showAssetBlobCache } from "@/hooks/queries/useShowAssets";
import { partsOf, type PitPart } from "./pitModelAssets";

/** Reads a part's bytes by hash; undefined when the show doesn't have it (or it's corrupt). */
export type ReadModelBytes = (hash: string) => Promise<Uint8Array | undefined>;

let readBytes: ReadModelBytes = (hash) => showAssetBlobCache.get(hash);

/** Swaps how parts are read, for tests; null restores the show's. */
export function _setLibraryModelBytes(read: ReadModelBytes | null): void {
    readBytes = read ?? ((hash) => showAssetBlobCache.get(hash));
}

/** The error a load ends with when its last user let go before it finished */
export class LibraryModelReleased extends Error {
    constructor(hash: string) {
        super(`model part ${hash} was let go while loading`);
    }
}

interface Entry {
    users: number;
    load: Promise<PitPart[]>;
    parts: PitPart[] | null;
    released: boolean;
}

const entries = new Map<string, Entry>();

async function parse(hash: string): Promise<PitPart[]> {
    const bytes = await readBytes(hash);
    if (!bytes) throw new Error(`the show has no model part ${hash}`);
    // The cache's array is shared with every reader: parse a copy
    const gltf = await new GLTFLoader().parseAsync(bytes.slice().buffer, "");
    return partsOf(gltf.scene, `model part ${hash.slice(0, 12)}`);
}

/** Frees a model's GPU memory: its geometry, its materials and their textures. */
export function disposeParts(parts: readonly PitPart[]): void {
    const materials = new Set<Material>();
    for (const part of parts) {
        part.geometry.dispose();
        for (const material of Array.isArray(part.material)
            ? part.material
            : [part.material])
            materials.add(material);
    }
    for (const material of materials) {
        for (const value of Object.values(material))
            if (value instanceof Texture) value.dispose();
        material.dispose();
    }
}

/**
 * One GLB part of an imported model, by blob hash, held until {@link releaseLibraryModel}: the
 * first call loads it, later ones share it. Rejects with {@link LibraryModelReleased} when every
 * user let go before it loaded.
 */
export function acquireLibraryModel(hash: string): Promise<PitPart[]> {
    let entry = entries.get(hash);
    if (!entry) {
        const created: Entry = {
            users: 0,
            parts: null,
            released: false,
            load: Promise.resolve([]),
        };
        created.load = parse(hash).then((parts) => {
            if (created.released) {
                disposeParts(parts);
                throw new LibraryModelReleased(hash);
            }
            created.parts = parts;
            return parts;
        });
        entries.set(hash, created);
        entry = created;
    }
    entry.users++;
    return entry.load;
}

/** Lets go of one hold on a part; the last one frees it. */
export function releaseLibraryModel(hash: string): void {
    const entry = entries.get(hash);
    if (!entry || --entry.users > 0) return;
    entries.delete(hash);
    entry.released = true;
    if (entry.parts) disposeParts(entry.parts);
}

/** How many parts are held now, for tests. */
export const _heldLibraryModelCount = (): number => entries.size;

let drawn: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

/**
 * Says which imported models (`items.model` values) the 3D View draws as their model now: their
 * items stop drawing as blocks (`PropBlocks.tsx`). Until then, and after a failure, they draw as
 * blocks at the same footprint and height.
 */
export function setDrawnLibraryModels(values: ReadonlySet<string>): void {
    if (
        values.size === drawn.size &&
        [...values].every((value) => drawn.has(value))
    )
        return;
    drawn = values;
    listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

/** The imported models drawn as their model now (`setDrawnLibraryModels`). */
export const useDrawnLibraryModels = (): ReadonlySet<string> =>
    useSyncExternalStore(subscribe, () => drawn);
