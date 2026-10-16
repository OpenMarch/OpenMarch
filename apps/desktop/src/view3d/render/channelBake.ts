/**
 * The per-channel bake (performer-behavior.md section 8.3): every row a
 * sample of every bone's skinning matrix, laid out by `bakeLayout`.
 *
 * - **Feet** rows are the planner's clips, sampled as they come (arms and
 *   all), as om-pose's `bakeClips` did.
 * - **Horn/Equipment** rows are arm poses on the rest body: a hold (one
 *   sample) or a transition between two holds (the arm bones slerped,
 *   eased). The compose pass re-anchors them to the chest the Feet or Body
 *   channel moves, so one hold row serves every clip.
 * - **Body** rows are clips, like Feet (none ship yet).
 *
 * Each row also carries a **prop bone** after the skeleton's bones: the
 * right hand's matrix times a grip. On Feet and Body rows the grip is the
 * identity; on a Horn row it is the hold's grip (`ArmHold.grip`), eased
 * between the two grips on a transition. Instruments skin to it.
 *
 * The leg turn's per-row data sits in the bottom row of `root`'s matrix, as
 * om-pose stores it (LEG TURN in `instanced-marchers.js`).
 */
import * as THREE from "three";
import { cloneRig, legTurnSetup, type LegTurn } from "./instanced-marchers.js";
import {
    bakeLayout,
    rowTexel,
    SAMPLES_PER_COUNT,
    type BakeEntry,
    type BakeLayout,
    type ChannelRow,
} from "./bakeLayout";

/** Clips are keyed on a 120 bpm clock: one count is 0.5 s. */
const BAKED_COUNT_S = 0.5;

/** Samples in a transition row: one count's worth, stretched by its rate. */
export const TRANSITION_FRAMES = SAMPLES_PER_COUNT;

/** An arm pose for the Horn/Equipment channel. */
export interface ArmHold {
    /** Local quaternion per arm bone (sanitized names, as GLTFLoader gives). */
    local: ReadonlyMap<string, THREE.Quaternion>;
    /** The prop bone relative to the right hand's skinning matrix. */
    grip: THREE.Matrix4;
}

export interface HornRowSpec {
    name: string;
    from: ArmHold;
    /** A transition's end; a hold row has none. */
    to?: ArmHold;
    /** Samples in the row; a hold has 1, a transition {@link TRANSITION_FRAMES}. */
    frames?: number;
    /**
     * A prop leaving the hand (a toss): the prop bone's matrix in body space
     * at each point `u` (0 to 1) of the row, in place of the hand times the
     * grip. Play the row with `propInBody` so the compose pass doesn't move
     * it with the chest.
     */
    propPath?: (u: number) => THREE.Matrix4;
}

export interface ChannelBakeSpec {
    feet: Readonly<Record<string, THREE.AnimationClip>>;
    horn?: readonly HornRowSpec[];
    body?: Readonly<Record<string, THREE.AnimationClip>>;
}

export interface ChannelBake {
    texture: THREE.DataTexture;
    layout: BakeLayout;
    rows: Record<string, ChannelRow>;
    /** Bones per row: the skeleton's plus the prop bone. */
    bones: number;
    /** The prop bone's index in a row (the skeleton's bone count). */
    propBone: number;
    rowsPerColumn: number;
    bytes: number;
    turn: LegTurn | null;
    /** Bone names per index (dots dropped), the prop bone last as "prop". */
    boneNames: string[];
}

const smooth = (u: number) => u * u * (3 - 2 * u);

const framesOf = (clip: THREE.AnimationClip) =>
    Math.round((clip.duration / BAKED_COUNT_S) * SAMPLES_PER_COUNT);

// eslint-disable-next-line max-lines-per-function -- one sampling loop per row kind, kept together
export function bakeChannels(
    root: THREE.Object3D,
    spec: ChannelBakeSpec,
    opts: { maxRows?: number } = {},
): ChannelBake {
    const rig = cloneRig(THREE, root);
    let mesh: THREE.SkinnedMesh | undefined;
    rig.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh && !mesh)
            mesh = o as THREE.SkinnedMesh;
    });
    if (!mesh) throw new Error("bakeChannels: no skinned mesh");
    const bones = mesh.skeleton.bones;
    const inv = mesh.skeleton.boneInverses;
    const nb = bones.length;
    const prop = nb;
    const stride = nb + 1;
    const handR = bones.findIndex((b) => b.name === "DEF-handR");
    if (handR < 0) throw new Error("bakeChannels: no DEF-handR bone");

    const horn = spec.horn ?? [];
    const body = spec.body ?? {};
    const entries: BakeEntry[] = [
        ...Object.entries(spec.feet).map(([name, clip]) => ({
            name,
            channel: "feet" as const,
            frames: framesOf(clip),
        })),
        ...horn.map((h) => ({
            name: h.name,
            channel: "horn" as const,
            frames: h.frames ?? (h.to || h.propPath ? TRANSITION_FRAMES : 1),
        })),
        ...Object.entries(body).map(([name, clip]) => ({
            name,
            channel: "body" as const,
            frames: framesOf(clip),
        })),
    ];
    const layout = bakeLayout(entries, {
        bones: stride,
        maxRows: opts.maxRows,
    });
    const { width } = layout;
    const data = new Float32Array(width * layout.rowsPerColumn * 4);

    // what three's skinning shader forms per bone: bindMatrixInverse * bone world * bone inverse * bindMatrix
    const bind = mesh.bindMatrix;
    const bindInv = bind.clone().invert();
    const m = new THREE.Matrix4();
    const hand = new THREE.Matrix4();
    const grip = new THREE.Matrix4();
    const put = (row: number, bone: number, mat: THREE.Matrix4) => {
        const [x, y] = rowTexel(layout, row, bone);
        data.set(mat.elements, (y * width + x) * 4); // a column per texel
    };
    /**
     * Every bone of the rig as it stands, and the prop bone: the hand times
     * `gripAt`, or `propAt` itself (body space) when given.
     */
    const writeRow = (
        row: number,
        gripAt: THREE.Matrix4 | null,
        propAt: THREE.Matrix4 | null = null,
    ) => {
        rig.updateMatrixWorld(true);
        for (let b = 0; b < nb; b++) {
            m.multiplyMatrices(bindInv, bones[b].matrixWorld)
                .multiply(inv[b])
                .multiply(bind);
            put(row, b, m);
            if (b === handR) hand.copy(m);
        }
        put(
            row,
            prop,
            propAt ?? (gripAt ? m.multiplyMatrices(hand, gripAt) : hand),
        );
    };

    const sampleClips = (
        clips: Readonly<Record<string, THREE.AnimationClip>>,
    ) => {
        const mixer = new THREE.AnimationMixer(rig);
        for (const [name, clip] of Object.entries(clips)) {
            const r = layout.rows[name];
            const action = mixer.clipAction(clip);
            action.play();
            action.paused = true;
            for (let i = 0; i <= r.frames; i++) {
                action.time = Math.min(
                    (i / SAMPLES_PER_COUNT) * BAKED_COUNT_S,
                    clip.duration,
                );
                mixer.update(0);
                writeRow(r.row + i, null);
            }
            action.stop();
        }
        mixer.stopAllAction();
        mixer.uncacheRoot(rig);
    };
    sampleClips(spec.feet);

    // Horn rows: the rest body with the arms posed
    const rest = bones.map((b) => ({
        position: b.position.clone(),
        quaternion: b.quaternion.clone(),
        scale: b.scale.clone(),
    }));
    const pos = [new THREE.Vector3(), new THREE.Vector3()];
    const rot = [new THREE.Quaternion(), new THREE.Quaternion()];
    const scl = [new THREE.Vector3(), new THREE.Vector3()];
    const q = new THREE.Quaternion();
    for (const h of horn) {
        const r = layout.rows[h.name];
        h.from.grip.decompose(pos[0], rot[0], scl[0]);
        if (h.to) h.to.grip.decompose(pos[1], rot[1], scl[1]);
        for (let i = 0; i <= r.frames; i++) {
            const e = h.to ? smooth(i / r.frames) : 0;
            bones.forEach((b, k) => {
                b.position.copy(rest[k].position);
                b.scale.copy(rest[k].scale);
                const a = h.from.local.get(b.name);
                const z = h.to?.local.get(b.name);
                if (a && z) b.quaternion.slerpQuaternions(a, z, e);
                else b.quaternion.copy(a ?? rest[k].quaternion);
            });
            if (h.to)
                grip.compose(
                    pos[0].clone().lerp(pos[1], e),
                    q.slerpQuaternions(rot[0], rot[1], e),
                    scl[0].clone().lerp(scl[1], e),
                );
            else grip.copy(h.from.grip);
            writeRow(r.row + i, grip, h.propPath?.(i / r.frames) ?? null);
        }
    }
    bones.forEach((b, k) => {
        b.position.copy(rest[k].position);
        b.quaternion.copy(rest[k].quaternion);
        b.scale.copy(rest[k].scale);
    });
    sampleClips(body);

    const turn = legTurnSetup(THREE, bones, inv, bindInv);
    if (turn) writeTurnData(data, layout, turn);

    const texture = new THREE.DataTexture(
        data,
        width,
        layout.rowsPerColumn,
        THREE.RGBAFormat,
        THREE.FloatType,
    );
    texture.needsUpdate = true;
    return {
        texture,
        layout,
        rows: layout.rows,
        bones: stride,
        propBone: prop,
        rowsPerColumn: layout.rowsPerColumn,
        bytes: data.byteLength,
        turn,
        boneNames: [...bones.map((b) => b.name.replace(/\./g, "")), "prop"],
    };
}

/**
 * The leg turn's per-row data, in the bottom row of `root`'s matrix: where
 * the upper body's column stands (DEF-spine.003's head, x and z) and the
 * hip line's yaw (om-pose's LEG TURN).
 */
function writeTurnData(data: Float32Array, layout: BakeLayout, turn: LegTurn) {
    const w = new THREE.Matrix4();
    const m3 = new THREE.Matrix3();
    const p = new THREE.Vector3();
    const hip = new THREE.Vector3();
    const { width } = layout;
    const read = (row: number, bone: number) => {
        const [x, y] = rowTexel(layout, row, bone);
        const o = (y * width + x) * 4;
        return w.fromArray(data, o);
    };
    for (let row = 0; row < layout.total; row++) {
        p.copy(turn.upperHead).applyMatrix4(read(row, turn.upper));
        hip.copy(turn.hipLine).applyMatrix3(
            m3.setFromMatrix4(read(row, turn.pelvis)),
        );
        const [x, y] = rowTexel(layout, row, turn.root);
        const at = (k: number) => (y * width + x + k) * 4 + 3;
        data[at(0)] = p.x;
        data[at(1)] = p.z;
        data[at(2)] = Math.atan2(-hip.z, hip.x);
    }
}
