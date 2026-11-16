// cspell:words basisu precheck Precheck
/**
 * The checks that run before anything is decoded (ADR 0010 amendment 2026-11-15, "crash
 * isolation"): required extensions, the triangle count the JSON declares, and each image's size
 * from its header. The import worker is a thread in the editor's renderer, so a file that would
 * need gigabytes to decode must be refused from its numbers alone.
 */
import { imageBytes, type OpenedModel, type RawGltf } from "./files";
import { readImageHeader, type ImageHeader } from "./imageSize";
import {
    ALLOWED_REQUIRED_EXTENSIONS,
    MAX_IMAGE_EDGE,
    MAX_IMAGE_PIXELS,
    MAX_MESHOPT_DECODED_BYTES,
    TRIANGLE_CAP,
    TRIANGLE_REFUSE_FACTOR,
} from "./rules";
import type { Refusal } from "./types";

type JsonList = Record<string, unknown>[];

const list = (v: unknown): JsonList =>
    Array.isArray(v) ? (v as JsonList) : [];
const items = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const stringList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((e): e is string => typeof e === "string") : [];

export interface Precheck {
    refusals: Refusal[];
    /** Triangles as the JSON declares them, counting every node that draws a mesh */
    declaredTriangles: number;
    /** Each image's header, by image index; null for one with no readable header */
    images: (ImageHeader | null)[];
}

export function precheck(model: OpenedModel): Precheck {
    const refusals: Refusal[] = [];
    const disallowed = stringList(model.json.extensionsRequired).filter(
        (e) => !ALLOWED_REQUIRED_EXTENSIONS.has(e),
    );
    if (disallowed.length)
        refusals.push({ code: "requiredExtension", extensions: disallowed });

    const declaredTriangles = declaredTrianglesOf(model.json);
    const limit = TRIANGLE_CAP * TRIANGLE_REFUSE_FACTOR;
    if (declaredTriangles > limit)
        refusals.push({
            code: "tooManyTriangles",
            triangles: declaredTriangles,
            cap: TRIANGLE_CAP,
            limit,
        });

    // Meshopt views decode to `count × byteStride` bytes each, read straight from the JSON,
    // whether or not anything uses them
    const meshoptBytes = list(model.json.bufferViews).reduce((n, view) => {
        const ext = (view.extensions as Record<string, unknown> | undefined)?.[
            "EXT_meshopt_compression"
        ] as { count?: unknown; byteStride?: unknown } | undefined;
        if (!ext) return n;
        const count = typeof ext.count === "number" ? ext.count : 0;
        const stride = typeof ext.byteStride === "number" ? ext.byteStride : 0;
        return n + count * stride;
    }, 0);
    if (meshoptBytes > MAX_MESHOPT_DECODED_BYTES)
        refusals.push({
            code: "tooLarge",
            bytes: meshoptBytes,
            limit: MAX_MESHOPT_DECODED_BYTES,
        });

    const images = list(model.json.images).map((image, index) => {
        const name =
            (typeof image.name === "string" && image.name) ||
            (typeof image.uri === "string" && !image.uri.startsWith("data:")
                ? image.uri
                : `image ${index + 1}`);
        const bytes = imageBytes(model, index);
        const header = bytes ? readImageHeader(bytes) : null;
        if (!header) {
            refusals.push({ code: "imageUnreadable", image: name });
            return null;
        }
        if (
            Math.max(header.width, header.height) > MAX_IMAGE_EDGE ||
            header.width * header.height > MAX_IMAGE_PIXELS
        )
            refusals.push({
                code: "imageTooLarge",
                image: name,
                width: header.width,
                height: header.height,
                limit: MAX_IMAGE_EDGE,
            });
        return header;
    });
    return { refusals, declaredTriangles, images };
}

/**
 * Triangles the scene would draw, from accessor counts alone: each node with a mesh counts that
 * mesh again, times its `EXT_mesh_gpu_instancing` instances. Draco and meshopt files declare
 * their decoded counts, so this holds for them too.
 */
export function declaredTrianglesOf(json: RawGltf): number {
    const accessors = list(json.accessors);
    const meshes = list(json.meshes);
    const nodes = list(json.nodes);
    const count = (index: unknown) =>
        typeof index === "number" && typeof accessors[index]?.count === "number"
            ? (accessors[index].count as number)
            : 0;
    const meshTriangles = (index: unknown): number => {
        if (typeof index !== "number" || !meshes[index]) return 0;
        let total = 0;
        for (const prim of list(meshes[index].primitives)) {
            const attributes = (prim.attributes ?? {}) as Record<
                string,
                unknown
            >;
            const n =
                prim.indices !== undefined
                    ? count(prim.indices)
                    : count(attributes.POSITION);
            const mode = typeof prim.mode === "number" ? prim.mode : 4;
            if (mode === 4) total += Math.floor(n / 3);
            else if (mode === 5 || mode === 6) total += Math.max(0, n - 2);
        }
        return total;
    };
    const instances = (node: Record<string, unknown>): number => {
        const ext = (node.extensions as Record<string, unknown> | undefined)?.[
            "EXT_mesh_gpu_instancing"
        ] as { attributes?: Record<string, unknown> } | undefined;
        const first = ext?.attributes && Object.values(ext.attributes)[0];
        return first === undefined ? 1 : Math.max(1, count(first));
    };

    const scenes = list(json.scenes);
    const sceneIndex = typeof json.scene === "number" ? json.scene : 0;
    const roots: unknown[] = scenes[sceneIndex]
        ? items(scenes[sceneIndex].nodes)
        : nodes.map((_, i) => i);
    let total = 0;
    const seen = new Set<number>();
    const visit = (index: unknown) => {
        // A cycle or a repeated child is the validator's to report; count each node once here
        if (typeof index !== "number" || seen.has(index) || !nodes[index])
            return;
        seen.add(index);
        const node = nodes[index];
        total += meshTriangles(node.mesh) * instances(node);
        for (const child of items(node.children)) visit(child);
    };
    roots.forEach(visit);
    return total;
}
