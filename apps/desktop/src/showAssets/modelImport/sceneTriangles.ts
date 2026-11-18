/**
 * Measuring a glTF-Transform document as it would draw (fork #998): triangles, world-space
 * triangles with their material, and the stand point.
 */
import type {
    Document,
    Material,
    Node,
    Primitive,
    Scene,
} from "@gltf-transform/core";

/** Triangles a primitive draws (lines and points draw none) */
export function primitiveTriangles(prim: Primitive): number {
    const count =
        prim.getIndices()?.getCount() ??
        prim.getAttribute("POSITION")?.getCount() ??
        0;
    switch (prim.getMode()) {
        case 4: // TRIANGLES
            return Math.floor(count / 3);
        case 5: // TRIANGLE_STRIP
        case 6: // TRIANGLE_FAN
            return Math.max(0, count - 2);
        default:
            return 0;
    }
}

/** Every node under a scene, parents before children */
export function sceneNodes(scene: Scene): Node[] {
    const out: Node[] = [];
    const visit = (node: Node) => {
        out.push(node);
        node.listChildren().forEach(visit);
    };
    scene.listChildren().forEach(visit);
    return out;
}

/** Triangles the scene draws: a mesh used by two nodes counts twice. */
export function sceneTriangles(scene: Scene): number {
    let total = 0;
    for (const node of sceneNodes(scene))
        for (const prim of node.getMesh()?.listPrimitives() ?? [])
            total += primitiveTriangles(prim);
    return total;
}

/** The scene the document draws: its default scene, else its first. */
export function sceneOf(doc: Document): Scene {
    const root = doc.getRoot();
    const scene = root.getDefaultScene() ?? root.listScenes()[0];
    if (!scene) throw new Error("the document has no scene");
    return scene;
}

export interface WorldTriangle {
    /** `[ax, ay, az, bx, by, bz, cx, cy, cz]`, in the scene's meters */
    positions: number[];
    material: Material | null;
}

/** Every `TRIANGLES` triangle the scene draws, in world space. */
export function worldTriangles(scene: Scene): WorldTriangle[] {
    const out: WorldTriangle[] = [];
    const el: number[] = [];
    for (const node of sceneNodes(scene)) {
        const mesh = node.getMesh();
        if (!mesh) continue;
        const m = node.getWorldMatrix();
        for (const prim of mesh.listPrimitives()) {
            if (prim.getMode() !== 4) continue;
            const position = prim.getAttribute("POSITION");
            if (!position) continue;
            const count = position.getCount();
            const world = new Float64Array(count * 3);
            for (let i = 0; i < count; i++) {
                position.getElement(i, el);
                const [x, y, z] = el;
                world[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
                world[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
                world[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
            }
            const indices = prim.getIndices();
            const n = indices ? indices.getCount() : count;
            const at = (k: number) => (indices ? indices.getScalar(k) : k);
            const material = prim.getMaterial();
            for (let k = 0; k + 2 < n; k += 3) {
                const positions: number[] = [];
                for (let v = 0; v < 3; v++) {
                    const i = at(k + v);
                    positions.push(
                        world[i * 3],
                        world[i * 3 + 1],
                        world[i * 3 + 2],
                    );
                }
                out.push({ positions, material });
            }
        }
    }
    return out;
}

/**
 * The highest surface straight above `[x, z]` (m), or null when nothing covers that point from
 * above.
 */
export function topAt(
    triangles: readonly WorldTriangle[],
    x: number,
    z: number,
): number | null {
    let top: number | null = null;
    for (const { positions: t } of triangles) {
        const [ax, ay, az, bx, by, bz, cx, cy, cz] = t;
        const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
        if (Math.abs(area) < 1e-12) continue; // edge-on from above
        const w0 = ((bx - x) * (cz - z) - (cx - x) * (bz - z)) / area;
        const w1 = ((cx - x) * (az - z) - (ax - x) * (cz - z)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-9 || w1 < -1e-9 || w2 < -1e-9) continue;
        const y = w0 * ay + w1 * by + w2 * cy;
        if (top === null || y > top) top = y;
    }
    return top;
}
