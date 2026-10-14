// cspell:words ibms
/**
 * Rigged Garments (ADR 0002 D-13; props-spec.md section 2, "Rigged
 * Garments"; research `gltf-import` section 4). A Garment joins om-pose's
 * shared bake, with no extra bake rows, only when:
 *
 * 1. its skin uses exactly the 23 v4 joints (remapped to v4 order by name),
 * 2. its rest pose matches v4's inverse bind matrices within tolerance,
 * 3. it has at most 4 influences per vertex (more are renormalized to 4),
 * 4. its skinned mesh nodes have their transforms applied,
 * 5. its positions are not quantized, and
 * 6. every skinned primitive carries `_PART` paint.
 *
 * Any other rig is rejected, never given its own bake. A mesh marks its fit
 * with `extras.openmarch.fit: "<body type>"` (the Starter kit add-on writes
 * exactly this; owner decision Q36, 2026-10-11); an untagged mesh is the
 * median fit, which is required (ticket 09). An unknown body type is
 * rejected; a body type on more than one mesh is noted.
 */
import {
    Accessor,
    type Document,
    type mat4,
    type Node,
    type Primitive,
    type Scene,
    type Skin,
} from "@gltf-transform/core";
import { Matrix4, Quaternion, Vector3 } from "three";
import { sceneNodes, worldMatrix } from "./measure";
import {
    GARMENT_BODY_TYPES,
    MAX_INFLUENCES,
    MEDIAN_BODY_TYPE,
    REST_POSE_TOLERANCE,
} from "./rules";
import type { NoteRow, Rejection } from "./types";
import { V4_INVERSE_BIND_MATRICES, V4_JOINT_NAMES } from "./v4-skeleton";

const V4_INDEX = new Map<string, number>(
    V4_JOINT_NAMES.map((name, i) => [name, i]),
);

/** v4 joint rest transforms in model space: the inverse of each IBM. */
const V4_REST = V4_INVERSE_BIND_MATRICES.map((ibm) =>
    new Matrix4().fromArray([...ibm]).invert(),
);

export interface GarmentCheck {
    rejections: Rejection[];
    notes: NoteRow[];
    /** Skinned mesh nodes by fit (body type). */
    nodesByFit: Map<string, Node[]>;
}

const IDENTITY = new Matrix4();

function nearlyIdentity(m: Matrix4, eps = 1e-5): boolean {
    return m.elements.every(
        (v, i) => Math.abs(v - IDENTITY.elements[i]) <= eps,
    );
}

/**
 * Checks a Garment before anything is changed. `conversion` is the unit
 * conversion and Y-up rotation the review applies, so a garment exported in
 * centimeters or Z-up is compared after converting.
 *
 * @param fitOf the declared fit of a mesh node, if any
 */
export function checkGarment(
    scene: Scene,
    conversion: Matrix4,
    fitOf: (node: Node) => string | undefined,
): GarmentCheck {
    const meshNodes = sceneNodes(scene).filter((n) => n.getMesh());
    const skinned = meshNodes.filter((n) => n.getSkin());
    // A mesh with no skin rejects the whole Garment (owner decision Q37,
    // 2026-10-11): it would float in place while the body moves.
    if (skinned.length === 0 || skinned.length !== meshNodes.length) {
        return {
            rejections: [{ code: "garmentNotRigged" }],
            notes: [],
            nodesByFit: new Map(),
        };
    }
    const skins = [...new Set(skinned.map((n) => n.getSkin()!))];
    const rejections: Rejection[] = [];

    // 4. Transforms applied.
    const unapplied = skinned
        .filter((n) => !nearlyIdentity(worldMatrix(n)))
        .map((n) => n.getName() || "(unnamed)");
    if (unapplied.length) {
        rejections.push({
            code: "garmentTransformsNotApplied",
            nodes: unapplied,
        });
    }
    // 1, then 2 (only meaningful on the v4 joints).
    const joints = checkJoints(skins);
    rejections.push(...(joints ?? checkRestPose(skins, conversion)));
    // 5 and 6.
    rejections.push(...checkPrimitives(skinned));

    const fits = groupFits(skinned, fitOf);
    return {
        rejections: [...rejections, ...fits.rejections],
        notes: fits.notes,
        nodesByFit: fits.nodesByFit,
    };
}

/** 1. Exactly the v4 joints; `null` when they are. */
function checkJoints(skins: Skin[]): Rejection[] | null {
    const missing = new Set<string>();
    const unexpected = new Set<string>();
    for (const skin of skins) {
        const names = skin.listJoints().map((j) => j.getName());
        const set = new Set(names);
        for (const name of V4_JOINT_NAMES) {
            if (!set.has(name)) missing.add(name);
        }
        for (const name of names) {
            if (!V4_INDEX.has(name)) unexpected.add(name);
        }
        if (set.size !== names.length) unexpected.add("(duplicate joints)");
    }
    if (!missing.size && !unexpected.size) return null;
    return [
        {
            code: "garmentJointsNotV4",
            missing: [...missing],
            unexpected: [...unexpected],
        },
    ];
}

/**
 * 2. The rest pose, compared after the conversion: a joint's rest position
 * moves with the conversion and its orientation rotates, but its frame keeps
 * unit scale.
 */
function checkRestPose(skins: Skin[], conversion: Matrix4): Rejection[] {
    const scale = new Vector3();
    conversion.decompose(new Vector3(), new Quaternion(), scale);
    const unscale = new Matrix4().makeScale(
        1 / scale.x,
        1 / scale.y,
        1 / scale.z,
    );
    const off: { name: string; translationM: number; rotation: number }[] = [];
    const el: number[] = [];
    for (const skin of skins) {
        const ibms = skin.getInverseBindMatrices();
        skin.listJoints().forEach((joint, i) => {
            const name = joint.getName();
            const rest = ibms
                ? new Matrix4().fromArray(ibms.getElement(i, el)).invert()
                : new Matrix4();
            const a = conversion
                .clone()
                .multiply(rest)
                .multiply(unscale).elements;
            const b = V4_REST[V4_INDEX.get(name)!].elements;
            const translationM = Math.hypot(
                a[12] - b[12],
                a[13] - b[13],
                a[14] - b[14],
            );
            let rotation = 0;
            for (const k of [0, 1, 2, 4, 5, 6, 8, 9, 10]) {
                rotation = Math.max(rotation, Math.abs(a[k] - b[k]));
            }
            if (
                translationM > REST_POSE_TOLERANCE.translationM ||
                rotation > REST_POSE_TOLERANCE.rotation
            ) {
                off.push({ name, translationM, rotation });
            }
        });
    }
    if (!off.length) return [];
    off.sort(
        (x, y) => y.translationM - x.translationM || y.rotation - x.rotation,
    );
    return [{ code: "garmentRestPoseMismatch", joints: off }];
}

/** 5 and 6. No quantized positions; `_PART` paint everywhere. */
function checkPrimitives(skinned: Node[]): Rejection[] {
    const quantized = new Set<string>();
    const unpainted = new Set<string>();
    for (const node of skinned) {
        const mesh = node.getMesh()!;
        const name = mesh.getName() || "(unnamed)";
        for (const prim of mesh.listPrimitives()) {
            const pos = prim.getAttribute("POSITION");
            if (
                pos &&
                pos.getComponentType() !== Accessor.ComponentType.FLOAT
            ) {
                quantized.add(name);
            }
            if (!prim.getAttribute("_PART")) unpainted.add(name);
        }
    }
    const out: Rejection[] = [];
    if (quantized.size) {
        out.push({ code: "garmentQuantized", meshes: [...quantized] });
    }
    if (unpainted.size) {
        out.push({ code: "garmentNoPartPaint", meshes: [...unpainted] });
    }
    return out;
}

/**
 * Fits by body type (`extras.openmarch.fit`; an untagged mesh is the median
 * fit). An unknown body type is rejected and the median is required; a body
 * type claimed by more than one mesh node is noted, and absent ones are noted.
 */
function groupFits(
    skinned: Node[],
    fitOf: (node: Node) => string | undefined,
): GarmentCheck {
    const notes: NoteRow[] = [];
    const known = new Set<string>(GARMENT_BODY_TYPES);
    const nodesByFit = new Map<string, Node[]>();
    const unknown: { node: string; fit: string }[] = [];
    for (const node of skinned) {
        const fit = fitOf(node) ?? MEDIAN_BODY_TYPE;
        if (!known.has(fit)) {
            unknown.push({ node: node.getName() || "(unnamed)", fit });
            continue;
        }
        nodesByFit.set(fit, [...(nodesByFit.get(fit) ?? []), node]);
    }
    const rejections: Rejection[] = [];
    if (unknown.length) {
        rejections.push({ code: "garmentUnknownFit", meshes: unknown });
    }
    if (!nodesByFit.has(MEDIAN_BODY_TYPE)) {
        rejections.push({
            code: "garmentNoMedianFit",
            fits: [...nodesByFit.keys()],
        });
    }
    const duplicates = GARMENT_BODY_TYPES.flatMap((bodyType) => {
        const nodes = nodesByFit.get(bodyType) ?? [];
        return nodes.length > 1
            ? [
                  {
                      bodyType,
                      nodes: nodes.map((n) => n.getName() || "(unnamed)"),
                  },
              ]
            : [];
    });
    if (duplicates.length) {
        notes.push({ code: "duplicateFits", fits: duplicates });
    }
    if (rejections.length) return { rejections, notes, nodesByFit };
    const absent = GARMENT_BODY_TYPES.filter((t) => !nodesByFit.has(t));
    if (absent.length) notes.push({ code: "missingFits", bodyTypes: absent });
    return { rejections: [], notes, nodesByFit };
}

/**
 * Normalizes a Garment that passed `checkGarment`:
 *
 * - converts the bind-pose geometry by `conversion`,
 * - remaps `JOINTS_0` to v4 joint order and stores v4's exact inverse bind
 *   matrices, so the GLB rides the shared bake unchanged,
 * - rebuilds the joint nodes' rest transforms from v4, so a plain
 *   `GLTFLoader` preview shows the bind pose, and
 * - keeps the 4 strongest influences per vertex, renormalized.
 *
 * @returns how many vertices had their influences renormalized
 */
export function normalizeGarment(
    doc: Document,
    scene: Scene,
    conversion: Matrix4,
): { renormalized: number } {
    const skinnedNodes = sceneNodes(scene).filter((n) => n.getSkin());
    const skins = [...new Set(skinnedNodes.map((n) => n.getSkin()!))];
    const meshes = [...new Set(skinnedNodes.map((n) => n.getMesh()!))];

    // Geometry: convert once per mesh (normals rotate with it).
    if (!nearlyIdentity(conversion, 0)) {
        for (const mesh of meshes) {
            mesh.listPrimitives().forEach((p) =>
                transformPositions(p, conversion),
            );
        }
    }

    // Joint order: each primitive's JOINTS_0 is remapped from its skin's order.
    const remapOf = new Map(
        skins.map((skin) => [
            skin,
            skin.listJoints().map((j) => V4_INDEX.get(j.getName())!),
        ]),
    );
    let renormalized = 0;
    const seen = new Set<Primitive>();
    for (const node of skinnedNodes) {
        const remap = remapOf.get(node.getSkin()!)!;
        for (const prim of node.getMesh()!.listPrimitives()) {
            if (seen.has(prim)) continue;
            seen.add(prim);
            renormalized += reduceInfluences(doc, prim, remap);
        }
    }

    // One v4 skin: v4 joint nodes in v4 order with v4's matrices.
    const target = skins[0];
    const nodeByName = new Map<string, Node>();
    for (const skin of skins) {
        for (const j of skin.listJoints()) {
            if (!nodeByName.has(j.getName())) nodeByName.set(j.getName(), j);
        }
    }
    for (const j of [...target.listJoints()]) target.removeJoint(j);
    V4_JOINT_NAMES.forEach((name) => target.addJoint(nodeByName.get(name)!));
    const ibm = doc
        .createAccessor("v4InverseBindMatrices")
        .setType("MAT4")
        .setArray(new Float32Array(V4_INVERSE_BIND_MATRICES.flat()))
        .setBuffer(doc.getRoot().listBuffers()[0] ?? doc.createBuffer());
    target.getInverseBindMatrices()?.dispose();
    target.setInverseBindMatrices(ibm).setSkeleton(null);
    for (const node of skinnedNodes) node.setSkin(target);
    for (const skin of skins.slice(1)) skin.dispose();

    // Joint rest transforms from v4, parents first.
    const world = new Map<Node, Matrix4>();
    const restOf = (node: Node): Matrix4 => {
        const cached = world.get(node);
        if (cached) return cached;
        const index = V4_INDEX.get(node.getName());
        const parent = node.getParentNode();
        let m: Matrix4;
        if (index !== undefined && target.listJoints()[index] === node) {
            m = V4_REST[index].clone();
            const parentWorld = parent ? restOf(parent) : new Matrix4();
            const local = parentWorld.clone().invert().multiply(m);
            node.setMatrix(local.toArray() as mat4);
        } else {
            m = worldMatrix(node);
        }
        world.set(node, m);
        return m;
    };
    target.listJoints().forEach(restOf);

    return { renormalized };
}

/** Applies a matrix to POSITION and its rotation to NORMAL, in place. */
function transformPositions(prim: Primitive, m: Matrix4): void {
    const normalMatrix = new Matrix4().extractRotation(m);
    const v = new Vector3();
    const el: number[] = [];
    const apply = (semantic: string, mat: Matrix4, normalize: boolean) => {
        const attr = prim.getAttribute(semantic);
        if (!attr) return;
        const copy = attr.clone();
        for (let i = 0; i < copy.getCount(); i++) {
            copy.getElement(i, el);
            v.set(el[0], el[1], el[2]).applyMatrix4(mat);
            if (normalize) v.normalize();
            copy.setElement(i, [v.x, v.y, v.z]);
        }
        prim.setAttribute(semantic, copy);
    };
    apply("POSITION", m, false);
    apply("NORMAL", normalMatrix, true);
}

/**
 * Keeps each vertex's 4 strongest influences, renormalized to sum to 1, and
 * remaps joint indices through `remap`. Drops `JOINTS_1+`/`WEIGHTS_1+`.
 *
 * @returns how many vertices changed beyond the remap
 */
function reduceInfluences(
    doc: Document,
    prim: Primitive,
    remap: number[],
): number {
    const sets: { joints: Accessor; weights: Accessor }[] = [];
    for (let s = 0; ; s++) {
        const joints = prim.getAttribute(`JOINTS_${s}`);
        const weights = prim.getAttribute(`WEIGHTS_${s}`);
        if (!joints || !weights) break;
        sets.push({ joints, weights });
    }
    if (sets.length === 0) return 0;
    const count = sets[0].joints.getCount();
    const outJoints = new Uint8Array(count * 4);
    const outWeights = new Float32Array(count * 4);
    const j: number[] = [];
    const w: number[] = [];
    let changed = 0;
    for (let i = 0; i < count; i++) {
        const pairs: [number, number][] = [];
        for (const set of sets) {
            set.joints.getElement(i, j);
            set.weights.getElement(i, w);
            for (let k = 0; k < 4; k++) {
                if (w[k] > 0) pairs.push([remap[j[k]], w[k]]);
            }
        }
        pairs.sort((a, b) => b[1] - a[1]);
        const kept = pairs.slice(0, MAX_INFLUENCES);
        const total = kept.reduce((s, p) => s + p[1], 0);
        if (pairs.length > MAX_INFLUENCES || Math.abs(total - 1) > 1e-3) {
            changed++;
        }
        kept.forEach(([joint, weight], k) => {
            outJoints[i * 4 + k] = joint;
            outWeights[i * 4 + k] = total > 0 ? weight / total : 0;
        });
        if (kept.length === 0) outWeights[i * 4] = 1; // root
    }
    const buffer = sets[0].joints.getBuffer();
    for (let s = 0; s < sets.length; s++) {
        prim.setAttribute(`JOINTS_${s}`, null);
        prim.setAttribute(`WEIGHTS_${s}`, null);
    }
    prim.setAttribute(
        "JOINTS_0",
        doc
            .createAccessor()
            .setType("VEC4")
            .setArray(outJoints)
            .setBuffer(buffer),
    );
    prim.setAttribute(
        "WEIGHTS_0",
        doc
            .createAccessor()
            .setType("VEC4")
            .setArray(outWeights)
            .setBuffer(buffer),
    );
    return changed;
}
