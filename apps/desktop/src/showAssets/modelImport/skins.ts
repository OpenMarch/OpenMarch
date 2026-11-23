/**
 * A rigged model, frozen standing still (#1168): each skinned mesh is posed as its skeleton
 * stands with no animation playing, its skin and joint data then go, and the props draw it like
 * any other model. Before this, a rigged model was refused, and the refusal asked the user to
 * do exactly this by hand in Blender.
 *
 * Skinning as glTF defines it: a vertex lands at Σ wᵢ · (joint world matrix · inverse bind
 * matrix) · v, ignoring the skinned node's own transform. The posed vertices are in world space,
 * so the frozen node moves to the scene root with no transform of its own.
 */
import type {
    Accessor,
    Document,
    Node,
    Primitive,
    Scene,
} from "@gltf-transform/core";
import { sceneNodes } from "./sceneTriangles";

/** A 4 × 4 matrix, column-major as glTF writes it */
type Mat4 = number[];

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** a × b */
function multiply(a: readonly number[], b: readonly number[]): Mat4 {
    const out = new Array<number>(16);
    for (let col = 0; col < 4; col++)
        for (let row = 0; row < 4; row++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
            out[col * 4 + row] = sum;
        }
    return out;
}

/**
 * Freezes every skinned mesh in `scene`. Returns how many meshes were frozen, or null when one
 * can't be (its joints or weights are missing or don't match its skin), for the caller to refuse.
 */
export function freezeSkins(doc: Document, scene: Scene): number | null {
    const skinned = sceneNodes(scene).filter((n) => n.getSkin() && n.getMesh());
    if (skinned.length === 0) return 0;
    for (const node of skinned) if (!canFreeze(node)) return null;
    for (const node of skinned) freezeNode(doc, scene, node);
    for (const skin of doc.getRoot().listSkins()) skin.dispose();
    return skinned.length;
}

function canFreeze(node: Node): boolean {
    const joints = node.getSkin()!.listJoints().length;
    return node
        .getMesh()!
        .listPrimitives()
        .every((prim) => {
            const position = prim.getAttribute("POSITION");
            if (!position || !prim.getAttribute("JOINTS_0")) return false;
            // Every set the pose blends: its joints in range, one per vertex with a weight
            return INFLUENCE_SETS.every((set) => {
                const joint = prim.getAttribute(`JOINTS_${set}`);
                const weight = prim.getAttribute(`WEIGHTS_${set}`);
                if (!joint) return true;
                if (!weight) return false;
                if (
                    joint.getCount() !== position.getCount() ||
                    weight.getCount() !== position.getCount()
                )
                    return false;
                const el: number[] = [];
                for (let i = 0; i < joint.getCount(); i++) {
                    joint.getElement(i, el);
                    if (el.some((j) => j >= joints)) return false;
                }
                return true;
            });
        });
}

/** The joint and weight sets the pose blends, four influences each */
const INFLUENCE_SETS = [0, 1];

function freezeNode(doc: Document, scene: Scene, node: Node): void {
    const skin = node.getSkin()!;
    const joints = skin.listJoints();
    const inverseBind = skin.getInverseBindMatrices();
    // Each joint's world matrix × its inverse bind matrix: the pose, one matrix per joint
    const pose = joints.map((joint, i) =>
        multiply(
            joint.getWorldMatrix(),
            inverseBind ? inverseBind.getElement(i, []) : IDENTITY,
        ),
    );
    // The mesh and its primitives may be shared with another node, skinned or not: pose a
    // copy of each (a mesh's clone shares its primitives)
    const mesh = node.getMesh()!.clone();
    const posed: Posed = new Map();
    for (const prim of mesh.listPrimitives()) {
        const copy = prim.clone();
        mesh.removePrimitive(prim).addPrimitive(copy);
        freezePrimitive(doc, copy, pose, posed);
    }
    node.setMesh(mesh).setSkin(null);
    // Children keep where they were in the world, read before the node moves
    for (const child of node.listChildren()) {
        const world = child.getWorldMatrix();
        node.removeChild(child);
        child.setMatrix(world);
        scene.addChild(child);
    }
    // Its posed vertices are in world space
    node.setMatrix(IDENTITY as Parameters<Node["setMatrix"]>[0]);
    node.getParentNode()?.removeChild(node);
    if (!scene.listChildren().includes(node)) scene.addChild(node);
}

const SKIN_SEMANTICS = INFLUENCE_SETS.flatMap((set) => [
    `JOINTS_${set}`,
    `WEIGHTS_${set}`,
]);

/** Posed vertices by the accessors they came from, so a node's parts that share them pose once */
type Posed = Map<string, { position: Accessor; normal: Accessor | null }>;

const accessorIds = new WeakMap<Accessor, number>();
let nextAccessorId = 0;
const idOf = (accessor: Accessor | null) => {
    if (!accessor) return -1;
    let id = accessorIds.get(accessor);
    if (id === undefined) accessorIds.set(accessor, (id = nextAccessorId++));
    return id;
};

function freezePrimitive(
    doc: Document,
    prim: Primitive,
    pose: Mat4[],
    posed: Posed,
): void {
    const key = ["POSITION", "NORMAL", ...SKIN_SEMANTICS]
        .map((semantic) => idOf(prim.getAttribute(semantic)))
        .join();
    const done = posed.get(key) ?? posePrimitive(doc, prim, pose);
    posed.set(key, done);
    prim.setAttribute("POSITION", done.position);
    if (done.normal) prim.setAttribute("NORMAL", done.normal);
    for (const semantic of prim.listSemantics())
        if (/^(JOINTS|WEIGHTS)_\d+$/.test(semantic) || semantic === "TANGENT")
            prim.setAttribute(semantic, null);
}

/** A primitive's vertices and normals as the pose places them, as new accessors */
function posePrimitive(
    doc: Document,
    prim: Primitive,
    pose: Mat4[],
): { position: Accessor; normal: Accessor | null } {
    const position = prim.getAttribute("POSITION")!;
    const normal = prim.getAttribute("NORMAL");
    const joint = prim.getAttribute("JOINTS_0")!;
    const weight = prim.getAttribute("WEIGHTS_0")!;
    const extraJoint = prim.getAttribute("JOINTS_1");
    const extraWeight = prim.getAttribute("WEIGHTS_1");
    const count = position.getCount();
    const positions = new Float32Array(count * 3);
    const normals = normal ? new Float32Array(count * 3) : null;
    const m: Mat4 = new Array<number>(16).fill(0);
    const j: number[] = [];
    const w: number[] = [];
    const v: number[] = [];
    for (let i = 0; i < count; i++) {
        m.fill(0);
        let total = blend(m, pose, joint, weight, i, j, w);
        if (extraJoint && extraWeight)
            total += blend(m, pose, extraJoint, extraWeight, i, j, w);
        // Weights that don't add to 1 would shrink or grow the vertex; none at all leaves it
        // where it was bound
        if (total <= 0) IDENTITY.forEach((value, e) => (m[e] = value));
        else if (Math.abs(total - 1) > 1e-6)
            for (let e = 0; e < 16; e++) m[e] /= total;
        position.getElement(i, v);
        const [x, y, z] = v;
        positions[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
        positions[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
        positions[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        if (normal && normals) {
            normal.getElement(i, v);
            // The pose's rotation part; good enough for a still model's shading
            const nx = m[0] * v[0] + m[4] * v[1] + m[8] * v[2];
            const ny = m[1] * v[0] + m[5] * v[1] + m[9] * v[2];
            const nz = m[2] * v[0] + m[6] * v[1] + m[10] * v[2];
            const length = Math.hypot(nx, ny, nz) || 1;
            normals[i * 3] = nx / length;
            normals[i * 3 + 1] = ny / length;
            normals[i * 3 + 2] = nz / length;
        }
    }
    return {
        position: floatAccessor(doc, position, positions),
        normal: normal && normals ? floatAccessor(doc, normal, normals) : null,
    };
}

/** Adds vertex `i`'s weighted joint matrices into `out`; returns the weights' sum */
function blend(
    out: Mat4,
    pose: Mat4[],
    joint: Accessor,
    weight: Accessor,
    i: number,
    j: number[],
    w: number[],
): number {
    joint.getElement(i, j);
    weight.getElement(i, w);
    let total = 0;
    for (let k = 0; k < j.length; k++) {
        const wk = w[k];
        if (!wk) continue;
        total += wk;
        const p = pose[j[k]];
        for (let e = 0; e < 16; e++) out[e] += wk * p[e];
    }
    return total;
}

function floatAccessor(
    doc: Document,
    source: Accessor,
    array: Float32Array<ArrayBuffer>,
): Accessor {
    return doc
        .createAccessor(source.getName())
        .setType(source.getType())
        .setArray(array)
        .setBuffer(source.getBuffer());
}
