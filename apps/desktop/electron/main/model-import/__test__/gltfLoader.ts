// cspell:words meshopt
/**
 * Loads a GLB with three's bare `GLTFLoader` (no Draco, KTX2 or meshopt
 * decoders), the way the 3D View does, to prove normalized output needs
 * nothing more. Node has no DOM images, so textures decode through a stub
 * `createImageBitmap`; geometry, materials and skins are real.
 */
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

export async function loadWithBareGltfLoader(
    glb: Uint8Array,
): Promise<{ gltf: GLTF; warnings: string[]; errors: string[] }> {
    const g = globalThis as Record<string, unknown>;
    g.self ??= globalThis;
    g.createImageBitmap ??= async () => ({
        width: 1,
        height: 1,
        close() {},
    });
    const warnings: string[] = [];
    const errors: string[] = [];
    const { warn, error } = console;
    console.warn = (...args: unknown[]) => {
        warnings.push(args.map(String).join(" "));
    };
    console.error = (...args: unknown[]) => {
        errors.push(args.map(String).join(" "));
    };
    try {
        const { GLTFLoader } =
            await import("three/examples/jsm/loaders/GLTFLoader.js");
        const loader = new GLTFLoader();
        const buffer = glb.buffer.slice(
            glb.byteOffset,
            glb.byteOffset + glb.byteLength,
        ) as ArrayBuffer;
        const gltf = await loader.parseAsync(buffer, "");
        return { gltf, warnings, errors };
    } finally {
        console.warn = warn;
        console.error = error;
    }
}
