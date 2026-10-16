// Types for instanced-marchers.js (om-pose). Hand-written; keep in step with the .js.
import type {
    AnimationClip,
    Bone,
    BufferGeometry,
    DataTexture,
    InstancedMesh,
    Material,
    Matrix4,
    Object3D,
    Skeleton,
    Vector3,
} from "three";

type Three = typeof import("three");

export interface BakedRow {
    /** First texture row. */
    row: number;
    /** Samples per loop of the clip. */
    frames: number;
    /** Counts per loop of the clip. */
    counts: number;
}
/** The leg turn's bones and measures (see LEG TURN in the .js); null off a v4 skeleton. */
export interface LegTurn {
    /** Per bone: 1 turns with the legs, 2 the waist (DEF-spine.002), 0 carried. */
    classes: number[];
    root: number;
    pelvis: number;
    upper: number;
    upperHead: Vector3;
    hipLine: Vector3;
    /** Hip width / shoulder width. */
    waist: number;
}
export function legTurnSetup(
    THREE: Three,
    bones: readonly Bone[],
    inv: readonly Matrix4[],
    bindInv: Matrix4,
): LegTurn | null;
/** A private copy of `root`'s hierarchy at the origin, bones re-linked. */
export function cloneRig<T extends Object3D>(THREE: Three, root: T): T;

export interface Bake {
    texture: DataTexture;
    rows: Record<string, BakedRow>;
    bones: number;
    rowsPerColumn: number;
    bytes: number;
    turn: unknown;
}

export function bakeClips(
    THREE: Three,
    root: Object3D,
    clips: Record<string, AnimationClip>,
    opts?: { samplesPerCount?: number; maxRows?: number },
): Bake;
export function instancedSkinning<M extends Material>(
    THREE: Three,
    material: M,
    bake: Bake,
): M;
export function instancedGeometry(
    THREE: Three,
    source: BufferGeometry,
    n: number,
): BufferGeometry;
export function disposeInstancedGeometry(g: BufferGeometry): void;

export interface MarcherClip {
    row: BakedRow;
    row2?: BakedRow | null;
    weight?: number;
    /** Phase in counts: -c0 * rate to start the clip at its time 0 at count c0. */
    phase?: number;
    rate?: number;
    /** sRGB as a number. */
    skin?: number;
    /** Leg turn in radians, or [from, to, u0, u1] eased over the clip. */
    legYaw?: number | [number, number, number, number];
}
export function writeMarcher(
    mesh: InstancedMesh,
    i: number,
    clip: MarcherClip,
): void;

/** Instance matrix for a marcher at field (x, z) facing `heading` (radians about +Y, 0 = +Z), at scale h. */
export function writeMatrix(
    array: ArrayLike<number> & { [i: number]: number },
    i: number,
    x: number,
    z: number,
    heading: number,
    h?: number,
): void;

export const BLOCK_BODY: unknown[];
export function blockGeometry(
    THREE: Three,
    skeleton: Skeleton,
    boxes?: unknown[],
): BufferGeometry;
