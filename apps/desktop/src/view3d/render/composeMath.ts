// cspell:ignore GLSL
/**
 * The compose step on the CPU (performer-behavior.md section 8.3): one
 * performer's final skinning matrices from its channel state. It is the
 * reference the GPU pass (`composer.ts`) is written to match, line for
 * line, and the fallback when the GPU can't render to a float texture.
 *
 * Per bone, by its channel:
 *
 * - **Feet**: the Feet row at the clock, lerped between samples and blended
 *   with a second clip at its weight (om-pose's step-size blend).
 * - **Body**: the Body row re-anchored to the waist the Feet move:
 *   `waistFeet · waistBody⁻¹ · bone`. With no Body row, the Feet.
 * - **Horn/Equipment**: the Horn row re-anchored to the chest the Body (or
 *   Feet) moves: `chest · chestHorn⁻¹ · bone`. With no Horn row, the Body.
 *   The prop bone is a Horn bone; in body space (a toss) it skips the
 *   re-anchoring and plays its row's own matrix.
 *
 * Then the leg turn, per bone by its turn class, as om-pose's shader sums
 * it per class (LEG TURN in `instanced-marchers.js`). Pure: no three.js.
 */
import { STATE_TEXELS } from "./channelState";

/** The bake's matrices: a column of four texels per bone, rows wrapping into columns. */
export interface AnimSource {
    data: Float32Array;
    width: number;
    rowsPerColumn: number;
}

export const CHANNEL_FEET = 0;
export const CHANNEL_BODY = 1;
export const CHANNEL_HORN = 2;

export interface ComposeSetup {
    /** Bones per row and per composed performer, the prop bone included. */
    bones: number;
    /** Per bone: CHANNEL_FEET, CHANNEL_BODY or CHANNEL_HORN. */
    channel: ArrayLike<number>;
    /** Per bone: 1 turns with the legs, 2 the waist, 0 carried. */
    turnClass: ArrayLike<number>;
    /** The Body chain's anchor (DEF-spine.002, the waist). */
    anchorBody: number;
    /** The Horn chain's anchor (DEF-spine.003, the chest). */
    anchorHorn: number;
    propBone: number;
    /** The leg turn's data bone and hip/shoulder width ratio; null off a v4 skeleton. */
    turn: { root: number; waist: number } | null;
}

/** GLSL's mod: never negative for a positive divisor. */
export const glslMod = (x: number, y: number) => x - y * Math.floor(x / y);

/** out = a · b, column-major 4×4 at offsets. */
export function mul4(
    a: Float32Array,
    b: Float32Array,
    out: Float32Array,
): Float32Array {
    for (let c = 0; c < 4; c++) {
        const b0 = b[c * 4],
            b1 = b[c * 4 + 1],
            b2 = b[c * 4 + 2],
            b3 = b[c * 4 + 3];
        out[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
        out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
        out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
        out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    return out;
}

/** General 4×4 inverse, column-major (three's Matrix4.invert). */
export function invert4(m: Float32Array, out: Float32Array): Float32Array {
    const [n11, n21, n31, n41, n12, n22, n32, n42] = [
        m[0],
        m[1],
        m[2],
        m[3],
        m[4],
        m[5],
        m[6],
        m[7],
    ];
    const [n13, n23, n33, n43, n14, n24, n34, n44] = [
        m[8],
        m[9],
        m[10],
        m[11],
        m[12],
        m[13],
        m[14],
        m[15],
    ];
    const t11 =
        n23 * n34 * n42 -
        n24 * n33 * n42 +
        n24 * n32 * n43 -
        n22 * n34 * n43 -
        n23 * n32 * n44 +
        n22 * n33 * n44;
    const t12 =
        n14 * n33 * n42 -
        n13 * n34 * n42 -
        n14 * n32 * n43 +
        n12 * n34 * n43 +
        n13 * n32 * n44 -
        n12 * n33 * n44;
    const t13 =
        n13 * n24 * n42 -
        n14 * n23 * n42 +
        n14 * n22 * n43 -
        n12 * n24 * n43 -
        n13 * n22 * n44 +
        n12 * n23 * n44;
    const t14 =
        n14 * n23 * n32 -
        n13 * n24 * n32 -
        n14 * n22 * n33 +
        n12 * n24 * n33 +
        n13 * n22 * n34 -
        n12 * n23 * n34;
    const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;
    if (det === 0) return out.fill(0);
    const d = 1 / det;
    out[0] = t11 * d;
    out[1] =
        (n24 * n33 * n41 -
            n23 * n34 * n41 -
            n24 * n31 * n43 +
            n21 * n34 * n43 +
            n23 * n31 * n44 -
            n21 * n33 * n44) *
        d;
    out[2] =
        (n22 * n34 * n41 -
            n24 * n32 * n41 +
            n24 * n31 * n42 -
            n21 * n34 * n42 -
            n22 * n31 * n44 +
            n21 * n32 * n44) *
        d;
    out[3] =
        (n23 * n32 * n41 -
            n22 * n33 * n41 -
            n23 * n31 * n42 +
            n21 * n33 * n42 +
            n22 * n31 * n43 -
            n21 * n32 * n43) *
        d;
    out[4] = t12 * d;
    out[5] =
        (n13 * n34 * n41 -
            n14 * n33 * n41 +
            n14 * n31 * n43 -
            n11 * n34 * n43 -
            n13 * n31 * n44 +
            n11 * n33 * n44) *
        d;
    out[6] =
        (n14 * n32 * n41 -
            n12 * n34 * n41 -
            n14 * n31 * n42 +
            n11 * n34 * n42 +
            n12 * n31 * n44 -
            n11 * n32 * n44) *
        d;
    out[7] =
        (n12 * n33 * n41 -
            n13 * n32 * n41 +
            n13 * n31 * n42 -
            n11 * n33 * n42 -
            n12 * n31 * n43 +
            n11 * n32 * n43) *
        d;
    out[8] = t13 * d;
    out[9] =
        (n14 * n23 * n41 -
            n13 * n24 * n41 -
            n14 * n21 * n43 +
            n11 * n24 * n43 +
            n13 * n21 * n44 -
            n11 * n23 * n44) *
        d;
    out[10] =
        (n12 * n24 * n41 -
            n14 * n22 * n41 +
            n14 * n21 * n42 -
            n11 * n24 * n42 -
            n12 * n21 * n44 +
            n11 * n22 * n44) *
        d;
    out[11] =
        (n13 * n22 * n41 -
            n12 * n23 * n41 -
            n13 * n21 * n42 +
            n11 * n23 * n42 +
            n12 * n21 * n43 -
            n11 * n22 * n43) *
        d;
    out[12] = t14 * d;
    out[13] =
        (n13 * n24 * n31 -
            n14 * n23 * n31 +
            n14 * n21 * n33 -
            n11 * n24 * n33 -
            n13 * n21 * n34 +
            n11 * n23 * n34) *
        d;
    out[14] =
        (n14 * n22 * n31 -
            n12 * n24 * n31 -
            n14 * n21 * n32 +
            n11 * n24 * n32 +
            n12 * n21 * n34 -
            n11 * n22 * n34) *
        d;
    out[15] =
        (n12 * n23 * n31 -
            n13 * n22 * n31 +
            n13 * n21 * n32 -
            n11 * n23 * n32 -
            n12 * n21 * n33 +
            n11 * n22 * n33) *
        d;
    return out;
}

/** Column-major yaw about +Y, as the shader's `yawMatrix`. */
function setYaw(out: Float32Array, t: number) {
    const c = Math.cos(t),
        s = Math.sin(t);
    out.fill(0);
    out[0] = c;
    out[2] = -s;
    out[5] = 1;
    out[8] = s;
    out[10] = c;
    out[15] = 1;
}

/** Two sample rows and the lerp between them. */
interface At {
    a: number;
    b: number;
    f: number;
}

const scratch = () => new Float32Array(16);
const S = {
    t: scratch(),
    t2: scratch(),
    waist: scratch(),
    spBody: scratch(),
    chest: scratch(),
    spHorn: scratch(),
    m: scratch(),
    yaw: scratch(),
    tw: scratch(),
};

/**
 * Composes slot `slot`'s bones at count clock `count` into `out` from
 * `outOffset`: `setup.bones` column-major matrices, one after another.
 */
// eslint-disable-next-line max-lines-per-function -- mirrors the GPU pass's one function
export function composeSlot(
    anim: AnimSource,
    setup: ComposeSetup,
    state: Float32Array,
    slot: number,
    count: number,
    out: Float32Array,
    outOffset: number,
): void {
    const { data, width, rowsPerColumn } = anim;
    const nb = setup.bones;
    /** Bone `bone` of row `row`, as an offset into `data`. */
    const at = (row: number, bone: number) => {
        const col = Math.floor(row / rowsPerColumn);
        return (
            ((row - col * rowsPerColumn) * width + col * nb * 4 + bone * 4) * 4
        );
    };
    const sample = (bone: number, p: At, into: Float32Array) => {
        const oa = at(p.a, bone),
            ob = at(p.b, bone),
            g = 1 - p.f;
        for (let k = 0; k < 16; k++)
            into[k] = g * data[oa + k] + p.f * data[ob + k];
        return into;
    };
    const st = state;
    const o = slot * STATE_TEXELS * 4;

    // Feet, as om-pose's shader plays an instance
    const frames = st[o + 1],
        counts = st[o + 2];
    const rate = st[o + 4],
        row2 = st[o + 5],
        bw = st[o + 6];
    const u =
        frames > 0 && counts > 0
            ? (glslMod(count * rate + st[o + 3], counts) / counts) * frames
            : 0;
    const r0 = Math.floor(u),
        fr = u - r0;
    const first = bw >= 1 ? row2 : st[o];
    const blend = bw > 0 && bw < 1;
    const feetAt: At = { a: first + r0, b: first + r0 + 1, f: fr };
    const blendAt: At = { a: row2 + r0, b: row2 + r0 + 1, f: fr };
    const feet = (bone: number, into: Float32Array) => {
        sample(bone, feetAt, into);
        if (blend) {
            sample(bone, blendAt, S.t2);
            for (let k = 0; k < 16; k++)
                into[k] = (1 - bw) * into[k] + bw * S.t2[k];
        }
        return into;
    };
    /** A Body (texel 3) or Horn (texel 5) row at the clock, or null. */
    const channelAt = (texel: number): At | null => {
        const k = o + texel * 4;
        const row = st[k];
        if (row < 0) return null;
        const cf = st[k + 1],
            cc = st[k + 2];
        let t = count * st[k + 4] + st[k + 3];
        t = st[k + 5] > 0 ? Math.min(Math.max(t, 0), cc) : glslMod(t, cc);
        const cu = (t / cc) * cf;
        const c0 = Math.min(Math.floor(cu), cf - 1);
        return { a: row + c0, b: row + c0 + 1, f: cu - c0 };
    };
    const body = channelAt(3);
    const horn = channelAt(5);
    const propInBody = st[o + 6 * 4 + 2] > 0;

    // the anchors, once per performer
    if (body) {
        feet(setup.anchorBody, S.waist);
        invert4(sample(setup.anchorBody, body, S.t), S.t2);
        mul4(S.waist, S.t2, S.spBody);
    }
    const bodyBone = (bone: number, into: Float32Array) =>
        body ? mul4(S.spBody, sample(bone, body, S.t), into) : feet(bone, into);
    if (horn) {
        bodyBone(setup.anchorHorn, S.chest);
        invert4(sample(setup.anchorHorn, horn, S.t), S.t2);
        mul4(S.chest, S.t2, S.spHorn);
    }

    // the leg turn
    const turn = setup.turn;
    const y0 = st[o + 8],
        y1 = st[o + 9],
        tu0 = st[o + 10],
        tu1 = st[o + 11];
    const te = Math.min(
        Math.max(
            (frames > 0 ? u / frames - tu0 : 0) / Math.max(tu1 - tu0, 1e-6),
            0,
        ),
        1,
    );
    const turnT =
        y0 === y1
            ? y0
            : y0 + (y1 - y0) * te * te * te * (te * (te * 6 - 15) + 10);
    const turned = !!turn && turnT !== 0;
    let hx = 0,
        hz = 0,
        thx = 0,
        thz = 0,
        waistT = 0;
    if (turned) {
        const td = (k: number) => {
            const v = (p: At) =>
                (1 - p.f) * data[at(p.a, turn.root) + k * 4 + 3] +
                p.f * data[at(p.b, turn.root) + k * 4 + 3];
            const x = v(feetAt);
            return blend ? (1 - bw) * x + bw * v(blendAt) : x;
        };
        hx = td(0);
        hz = td(1);
        const a = td(2),
            r = turn.waist;
        const c = Math.cos(turnT),
            sn = Math.sin(turnT);
        thx = c * hx + sn * hz;
        thz = -sn * hx + c * hz;
        waistT =
            Math.atan2(r * Math.sin(a + turnT), 1 + r * Math.cos(a + turnT)) -
            Math.atan2(r * Math.sin(a), 1 + r * Math.cos(a));
        setYaw(S.yaw, turnT);
        setYaw(S.tw, waistT);
    }

    for (let bone = 0; bone < nb; bone++) {
        const ch = setup.channel[bone];
        let res: Float32Array = S.m;
        if (ch === CHANNEL_FEET) feet(bone, res);
        else if (ch === CHANNEL_BODY) bodyBone(bone, res);
        else if (!horn) bodyBone(bone, res);
        else if (bone === setup.propBone && propInBody) sample(bone, horn, res);
        else mul4(S.spHorn, sample(bone, horn, S.t), res);
        if (turned) {
            const cls = setup.turnClass[bone];
            if (cls === 1) res = mul4(S.yaw, res, S.t2);
            else if (cls === 2) {
                mul4(S.tw, res, S.t2);
                const c = Math.cos(waistT),
                    sn = Math.sin(waistT);
                S.t2[12] += thx - (c * hx + sn * hz);
                S.t2[14] += thz - (-sn * hx + c * hz);
                res = S.t2;
            } else {
                res[12] += thx - hx;
                res[14] += thz - hz;
            }
        }
        out.set(res, outOffset + bone * 16);
    }
}

/**
 * The compose setup of a v4 skeleton from its bone names (dots dropped,
 * the prop bone last): Body owns DEF-spine.003 and up, Horn/Equipment the
 * shoulders, arms, hands and the prop bone, Feet the rest. The prop bone
 * turns as the right hand does.
 */
export function composeSetupOf(
    boneNames: readonly string[],
    turn: { classes: readonly number[]; root: number; waist: number } | null,
): ComposeSetup {
    const find = (n: string) => {
        const i = boneNames.indexOf(n);
        if (i < 0) throw new Error(`composeSetupOf: no ${n} bone`);
        return i;
    };
    const propBone = find("prop");
    const handR = find("DEF-handR");
    const channel = boneNames.map((n) =>
        n === "prop" || /^DEF-(shoulder|upper_arm|forearm|hand)[LR]$/.test(n)
            ? CHANNEL_HORN
            : /^DEF-spine00[3-9]$/.test(n)
              ? CHANNEL_BODY
              : CHANNEL_FEET,
    );
    const turnClass = boneNames.map((_, i) =>
        !turn
            ? 0
            : i === propBone
              ? (turn.classes[handR] ?? 0)
              : (turn.classes[i] ?? 0),
    );
    return {
        bones: boneNames.length,
        channel,
        turnClass,
        anchorBody: find("DEF-spine002"),
        anchorHorn: find("DEF-spine003"),
        propBone,
        turn: turn ? { root: turn.root, waist: turn.waist } : null,
    };
}
