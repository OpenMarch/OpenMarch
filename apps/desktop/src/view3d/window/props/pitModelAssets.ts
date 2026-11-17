/**
 * Loads the front ensemble's models in the 3D View window (docs/3d/instruments.md §6).
 *
 * Vite emits each GLB as its own file (`?url`), so nothing is fetched until a show uses a model,
 * and each file loads once for the window's lifetime: every item drawn as the same model shares
 * its geometry and materials. A model that fails to load is remembered, logged once, and drawn
 * as a block from then on (`usePitModelFailures`).
 */
// cspell:ignore gltf
import { useSyncExternalStore } from "react";
import type { BufferGeometry, Material, Mesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Detail } from "@/view3d/core/instruments/model";
import { pitAssetFile } from "@/view3d/core/pit/pitModels";

const pitUrls = import.meta.glob<string>("../../assets/pit/*.glb", {
    query: "?url",
    import: "default",
    eager: true,
});

const urlOf = (file: string): string | null => {
    const key = Object.keys(pitUrls).find((k) => k.endsWith(`/${file}`));
    return key ? pitUrls[key] : null;
};

/** One part of a model (one draw call): its geometry in the model's own frame. */
export interface PitPart {
    geometry: BufferGeometry;
    material: Material | Material[];
}

const loads = new Map<string, Promise<PitPart[]>>();

async function loadFile(file: string): Promise<PitPart[]> {
    const url = urlOf(file);
    if (!url) throw new Error(`no bundled asset ${file}`);
    const gltf = await new GLTFLoader().loadAsync(url);
    gltf.scene.updateMatrixWorld(true);
    const parts: PitPart[] = [];
    gltf.scene.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        // Bake the node's place in the model, so an instance's matrix is the item's alone
        const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        mesh.geometry.dispose();
        parts.push({ geometry, material: mesh.material });
    });
    if (parts.length === 0) throw new Error(`${file} has no meshes`);
    return parts;
}

/** A model's detailed or distant version, loaded once. */
export function loadPitModel(name: string, detail: Detail): Promise<PitPart[]> {
    const file = pitAssetFile(name, detail);
    let load = loads.get(file);
    if (!load) {
        load = loadFile(file);
        loads.set(file, load);
    }
    return load;
}

let failures: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

/** Remembers that a model can't be drawn, logging it the first time. */
export function markPitModelFailed(name: string, error: unknown): void {
    if (failures.has(name)) return;
    // eslint-disable-next-line no-console -- a broken built-in asset is worth one line
    console.warn(
        `3D View: pit model ${name} failed to load; drawing a block`,
        error,
    );
    failures = new Set([...failures, name]);
    listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

/** The models that failed to load, by name: their items draw as blocks. */
export const usePitModelFailures = (): ReadonlySet<string> =>
    useSyncExternalStore(subscribe, () => failures);

const unknownLogged = new Set<string>();

/** Logs, once per id, an item model id this app has no model for: it draws as a block. */
export function logUnknownPitModel(modelId: string): void {
    if (unknownLogged.has(modelId)) return;
    unknownLogged.add(modelId);
    // eslint-disable-next-line no-console -- an unknown model id is worth one line
    console.warn(`3D View: no built-in model ${modelId}; drawing a block`);
}
