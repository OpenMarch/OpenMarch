/**
 * Measuring a glTF-Transform document: bounds, triangles, draw calls,
 * textures, joints and influences (ADR 0002 D-13, "measure").
 */
import {
    ImageUtils,
    type Document,
    type Material,
    type Mesh,
    type Node,
    type Primitive,
    type Scene,
} from "@gltf-transform/core";
import { Matrix4, Vector3 } from "three";
import type { ModelMeasurements, Vec3 } from "./types";

/** Triangles a primitive draws (lines and points draw none). */
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

export function meshTriangles(mesh: Mesh): number {
    return mesh
        .listPrimitives()
        .reduce((sum, p) => sum + primitiveTriangles(p), 0);
}

/** Every node under a scene, parents before children. */
export function sceneNodes(scene: Scene): Node[] {
    const out: Node[] = [];
    const visit = (node: Node) => {
        out.push(node);
        node.listChildren().forEach(visit);
    };
    scene.listChildren().forEach(visit);
    return out;
}

export function worldMatrix(node: Node): Matrix4 {
    return new Matrix4().fromArray(node.getWorldMatrix());
}

/**
 * World-space bounds over every vertex. A skinned mesh's node transform is
 * ignored, as the glTF spec says, so its bind-pose vertices count as is.
 */
export function measureBounds(
    scene: Scene,
): { min: Vec3; max: Vec3; size: Vec3 } | null {
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    const v = new Vector3();
    for (const node of sceneNodes(scene)) {
        const mesh = node.getMesh();
        if (!mesh) continue;
        const m = node.getSkin() ? new Matrix4() : worldMatrix(node);
        for (const prim of mesh.listPrimitives()) {
            const pos = prim.getAttribute("POSITION");
            if (!pos) continue;
            const el: number[] = [];
            for (let i = 0; i < pos.getCount(); i++) {
                pos.getElement(i, el);
                v.set(el[0], el[1], el[2]).applyMatrix4(m);
                min.min(v);
                max.max(v);
            }
        }
    }
    if (!isFinite(min.x)) return null;
    return {
        min: min.toArray() as Vec3,
        max: max.toArray() as Vec3,
        size: max.clone().sub(min).toArray() as Vec3,
    };
}

export function measureDocument(
    doc: Document,
    scene: Scene,
    trianglesByFit: Record<string, number> | null = null,
): ModelMeasurements {
    let triangles = 0;
    let drawCalls = 0;
    for (const node of sceneNodes(scene)) {
        const mesh = node.getMesh();
        if (!mesh) continue;
        triangles += meshTriangles(mesh);
        drawCalls += mesh.listPrimitives().length;
    }

    const textures = doc
        .getRoot()
        .listTextures()
        .map((t, i) => {
            const image = t.getImage();
            const mimeType = t.getMimeType();
            const size = image ? ImageUtils.getSize(image, mimeType) : null;
            return {
                name: t.getName() || t.getURI() || `texture ${i}`,
                width: size?.[0] ?? 0,
                height: size?.[1] ?? 0,
                mimeType,
            };
        });

    const joints = new Set<string>();
    for (const skin of doc.getRoot().listSkins()) {
        skin.listJoints().forEach((j) => joints.add(j.getName()));
    }

    let maxInfluences = 0;
    for (const mesh of doc.getRoot().listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
            maxInfluences = Math.max(maxInfluences, primitiveInfluences(prim));
        }
    }

    return {
        bounds: measureBounds(scene),
        triangles,
        trianglesByFit,
        drawCalls,
        textures,
        joints: [...joints],
        maxInfluences,
    };
}

/** The most non-zero joint weights any vertex of a primitive has. */
export function primitiveInfluences(prim: Primitive): number {
    const sets = prim
        .listSemantics()
        .filter((s) => /^WEIGHTS_\d+$/.test(s))
        .map((s) => prim.getAttribute(s)!);
    if (sets.length === 0) return 0;
    let max = 0;
    const el: number[] = [];
    const count = sets[0].getCount();
    for (let i = 0; i < count; i++) {
        let n = 0;
        for (const set of sets) {
            set.getElement(i, el);
            n += el.filter((w) => w > 0).length;
        }
        max = Math.max(max, n);
    }
    return max;
}

/** Where a material is drawn: its geometry's world bounds and surface area. */
export interface MaterialExtent {
    size: Vec3 | null;
    /** Total triangle area, in the scene's units squared. */
    area: number;
    /** Every primitive using it has UV0 (false when none does). */
    hasUVs: boolean;
}

/**
 * Measures each material where the scene draws it, as `measureBounds` does
 * (a skinned mesh in its bind pose). Area counts `TRIANGLES` primitives.
 */
export function measureMaterials(
    scene: Scene,
    materials: readonly Material[],
): MaterialExtent[] {
    const acc = materials.map(() => ({
        min: new Vector3(Infinity, Infinity, Infinity),
        max: new Vector3(-Infinity, -Infinity, -Infinity),
        area: 0,
        prims: 0,
        withUVs: 0,
    }));
    const index = new Map(materials.map((m, i) => [m, i]));
    const v = new Vector3();
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    const el: number[] = [];
    for (const node of sceneNodes(scene)) {
        const mesh = node.getMesh();
        if (!mesh) continue;
        const m = node.getSkin() ? new Matrix4() : worldMatrix(node);
        for (const prim of mesh.listPrimitives()) {
            const material = prim.getMaterial();
            const i = material ? index.get(material) : undefined;
            const pos = prim.getAttribute("POSITION");
            if (i === undefined || !pos) continue;
            const out = acc[i];
            out.prims++;
            if (prim.getAttribute("TEXCOORD_0")) out.withUVs++;
            const world: Vector3[] = [];
            for (let k = 0; k < pos.getCount(); k++) {
                pos.getElement(k, el);
                v.set(el[0], el[1], el[2]).applyMatrix4(m);
                world.push(v.clone());
                out.min.min(v);
                out.max.max(v);
            }
            if (prim.getMode() !== 4) continue;
            const indices = prim.getIndices();
            const count = indices?.getCount() ?? world.length;
            const at = (k: number) => (indices ? indices.getScalar(k) : k);
            for (let k = 0; k + 2 < count; k += 3) {
                a.copy(world[at(k)]);
                b.copy(world[at(k + 1)]).sub(a);
                c.copy(world[at(k + 2)]).sub(a);
                out.area += b.cross(c).length() / 2;
            }
        }
    }
    return acc.map((x) => ({
        size: isFinite(x.min.x)
            ? (x.max.clone().sub(x.min).toArray() as Vec3)
            : null,
        area: x.area,
        hasUVs: x.prims > 0 && x.withUVs === x.prims,
    }));
}
