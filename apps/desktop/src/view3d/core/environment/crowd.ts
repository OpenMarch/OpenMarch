// cspell:ignore fract beginnormal emissivemap
import {
    BufferGeometry,
    Color,
    DoubleSide,
    Float32BufferAttribute,
    InstancedBufferAttribute,
    InstancedMesh,
    Matrix4,
    DynamicDrawUsage,
    Group,
    MeshStandardMaterial,
    Quaternion,
    Vector3,
    type IUniform,
    type Object3D,
    type Vector3Tuple,
    type WebGLProgramParametersWithUniforms,
} from "three";
import type { KitCrowdOptions, SeatRow, VenueParams } from "../types";
import { createRng } from "./random";

/** One person's nominal size (design.md section 5). */
export const PERSON_WIDTH = 0.43;
export const PERSON_HEIGHT = 0.8;
export const PERSON_DEPTH = 0.3;
/** Extra height up to this many meters, per person. */
export const PERSON_HEIGHT_JITTER = 0.1;
/** Distance between neighbors along a row. */
export const PERSON_SPACING = 0.64;
/** Default people between aisles. */
export const DEFAULT_AISLE_EVERY = 18;

/** Shirt colors (hex numbers) per seat-row side. */
export type CrowdPalette = Record<SeatRow["side"], number[]>;

/**
 * `style`, `spacing`, `fill`, `shade`, `standing` and `clothes` come from the
 * kit (`KitResult.crowd`); without them the crowd is the shared blocks.
 */
export interface CrowdOptions extends KitCrowdOptions {
    /** Fraction of seats filled, 0 to 1. Default 0.6. */
    density?: number;
    /** Default `defaultCrowdPalette()` with the default team colors. */
    palette?: CrowdPalette;
    /** People between aisles along a row. Default 18. */
    aisleEvery?: number;
    /** People-wide gap at each aisle. Default 2. */
    aisleWidth?: number;
    /** "low" halves the density. Default "high". */
    quality?: "low" | "high";
    /** Seed for the deterministic layout. Default 7. */
    seed?: number;
}

export interface Crowd {
    /**
     * What the scene adds beside the seat rows (their frame): `mesh`, and for
     * the people style also `near`, so one or two draw calls.
     */
    object: Object3D;
    /**
     * One instance for everyone, in the same frame as the seat rows. The
     * people style draws them as cards, hidden where `near` draws them.
     */
    mesh: InstancedMesh;
    /**
     * The people style's full figures, for the people nearest the camera
     * (`follow`); null for the blocks.
     */
    near: InstancedMesh | null;
    /** Number of people placed (before any `clearAround`). */
    count: number;
    /**
     * Hides everyone within `radius` meters of `point` (same frame as the
     * seat rows) and shows everyone else, so the latest call wins. Call it
     * when the camera sits in a seat. Returns how many people are hidden.
     * The people style's full figures also move to `point`.
     */
    clearAround(point: Vector3Tuple, radius: number): number;
    /**
     * Gives the people nearest the camera at `point` (seat rows' frame) full
     * figures, once the camera has moved `CROWD_FOLLOW_STEP` from where they
     * were last chosen. Call it every frame; it returns true when it moved
     * them. Does nothing for the blocks.
     */
    follow(point: Vector3Tuple): boolean;
    /** Shows everyone again. */
    reset(): void;
    /** Number of people currently shown. */
    visibleCount(): number;
    dispose(): void;
}

const hex = (css: string, fallback: number): number => {
    const m = /^#([0-9a-f]{6})$/i.exec(css.trim());
    return m ? parseInt(m[1], 16) : fallback;
};

/**
 * A team color as a crowd wears it: greyer and darker, so a stand in team
 * colors doesn't fight the field or the drill.
 */
export function calmTeamColor(color: number): number {
    const c = new Color(color);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    c.setHSL(hsl.h, hsl.s * 0.34, Math.min(hsl.l, 0.3) * 0.88);
    return c.getHex();
}

/** Everyday clothes: whites, darks and a few clear colors, as before blocks. */
const STREET_CLOTHES = [
    0xffffff, 0x22252c, 0x3b5b92, 0xb04a3a, 0xd9c48a, 0x5a6e4e,
];

/** Muted head tones, picked per person in the shader. */
const HEADS = [0x8a6a55, 0x5e4737, 0x3d312a, 0x9a8c7c];

/**
 * Default shirt colors: home and away rows lean toward their team color,
 * neutral rows wear everyday clothes.
 */
export function defaultCrowdPalette(
    params?: Pick<VenueParams, "homeColor" | "awayColor">,
): CrowdPalette {
    const home = hex(params?.homeColor ?? "", 0x6442ff);
    const away = hex(params?.awayColor ?? "", 0xc23b3b);
    return {
        home: [home, home, ...STREET_CLOTHES],
        away: [away, away, ...STREET_CLOTHES],
        neutral: STREET_CLOTHES,
    };
}

/** Points along a polyline at even spacing; closed rows include the closing segment. */
function sampleRow(
    points: Vector3Tuple[],
    closed: boolean,
    spacing: number,
): { position: Vector3; tangent: Vector3 }[] {
    const out: { position: Vector3; tangent: Vector3 }[] = [];
    const n = points.length;
    if (n < 2) return out;
    const segCount = closed ? n : n - 1;
    let carry = 0;
    for (let s = 0; s < segCount; s++) {
        const a = new Vector3(...points[s]);
        const b = new Vector3(...points[(s + 1) % n]);
        const seg = b.clone().sub(a);
        const len = seg.length();
        if (len < 1e-9) continue;
        const tangent = seg.clone().divideScalar(len);
        let d = carry;
        while (d < len) {
            out.push({
                position: a.clone().addScaledVector(tangent, d),
                tangent,
            });
            d += spacing;
        }
        carry = d - len;
    }
    return out;
}

/** Closest point to `m` on a polyline, in plan view, or null if it has no points. */
function closestOnRow(row: SeatRow, m: Vector3): Vector3 | null {
    const n = row.points.length;
    if (n === 0) return null;
    const segs = row.closed ? n : Math.max(1, n - 1);
    let best: Vector3 | null = null;
    let bestD = Infinity;
    for (let s = 0; s < segs; s++) {
        const a = row.points[s];
        const b = row.points[(s + 1) % n] ?? a;
        const dx = b[0] - a[0];
        const dz = b[2] - a[2];
        const len2 = dx * dx + dz * dz;
        const t =
            len2 > 0
                ? Math.max(
                      0,
                      Math.min(
                          1,
                          ((m.x - a[0]) * dx + (m.z - a[2]) * dz) / len2,
                      ),
                  )
                : 0;
        const x = a[0] + dx * t;
        const z = a[2] + dz * t;
        const d = (x - m.x) ** 2 + (z - m.z) ** 2;
        if (d < bestD) {
            bestD = d;
            best = new Vector3(x, a[1] + (b[1] - a[1]) * t, z);
        }
    }
    return best;
}

/**
 * For each row, the sign of its left-hand normal that points the way the row
 * faces. Rows have no direction of their own, but stands rake: people face
 * the neighboring row that is lower. Rows with no neighbor nearby face the
 * middle of all the seats.
 */
function rowFacingSigns(seatRows: SeatRow[]): number[] {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const row of seatRows) {
        for (const p of row.points) {
            minX = Math.min(minX, p[0]);
            maxX = Math.max(maxX, p[0]);
            minZ = Math.min(minZ, p[2]);
            maxZ = Math.max(maxZ, p[2]);
        }
    }
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

    return seatRows.map((row, i) => {
        if (row.points.length < 2) return 1;
        const a = row.points[0];
        const b = row.points[1];
        const m = new Vector3(
            (a[0] + b[0]) / 2,
            (a[1] + b[1]) / 2,
            (a[2] + b[2]) / 2,
        );
        const tx = b[0] - a[0];
        const tz = b[2] - a[2];
        const nx = tz;
        const nz = -tx;
        let vote = 0;
        for (const j of [i - 1, i + 1, i - 2, i + 2]) {
            const other = seatRows[j];
            if (!other) continue;
            const q = closestOnRow(other, m);
            if (!q) continue;
            const reach = Math.max(row.depth, 0.6) * 3.2;
            const dx = q.x - m.x;
            const dz = q.z - m.z;
            if (dx * dx + dz * dz > reach * reach) continue;
            const dy = q.y - m.y;
            if (Math.abs(dy) < 1e-3) continue;
            const side = dx * nx + dz * nz;
            vote += Math.sign(side) * (dy < 0 ? 1 : -1);
        }
        if (vote === 0) vote = (cx - m.x) * nx + (cz - m.z) * nz;
        return vote >= 0 ? 1 : -1;
    });
}

/** One block: body 0.54 m wide and 0.46 m tall on the seat, and a small head. */
const BLOCK_HALF_WIDTH = 0.27;
const BLOCK_FRONT = 0.12;
const BLOCK_BACK = -0.2;
const BLOCK_BODY_TOP = 0.46;
/** A little below the seat, so no gap shows where the block meets it. */
const BLOCK_FOOT = -0.12;
const HEAD_HALF_WIDTH = 0.125;
const HEAD_Z = -0.04;
/** Top of the head above the seat, for a person of `PERSON_HEIGHT`. */
const BLOCK_HEIGHT = 0.76;
/** Shading baked into the block: darker at the foot, lighter on the top. */
const SHADE_FOOT = 0.72;
const SHADE_TOP_FACE = 1.12;

/**
 * The block every spectator is drawn with: front, back and top of a body, and
 * a flat head tipped back so it still has area from above (8 triangles, no
 * side faces: neighbors hide them and a two-sided body reads the same). The
 * origin is the middle of the seat, +Z is the way it faces. `aPart` is 1 on
 * the head; `aShade` multiplies the body's color.
 */
export function crowdBlockGeometry(): BufferGeometry {
    const positions: number[] = [];
    const normals: number[] = [];
    const parts: number[] = [];
    const shades: number[] = [];
    type P = readonly [number, number, number, number];
    const tri = (a: P, b: P, c: P, n: Vector3, part: number) => {
        const ab = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        const ac = new Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
        const order = ab.cross(ac).dot(n) < 0 ? [a, c, b] : [a, b, c];
        for (const p of order) {
            positions.push(p[0], p[1], p[2]);
            normals.push(n.x, n.y, n.z);
            parts.push(part);
            shades.push(p[3]);
        }
    };
    const quad = (a: P, b: P, c: P, d: P, normal: Vector3, part = 0) => {
        const n = normal.clone().normalize();
        tri(a, b, c, n, part);
        tri(a, c, d, n, part);
    };

    const w = BLOCK_HALF_WIDTH;
    const y0 = BLOCK_FOOT;
    const y1 = BLOCK_BODY_TOP;
    const f = BLOCK_FRONT;
    const b = BLOCK_BACK;
    quad(
        [-w, y0, f, SHADE_FOOT],
        [w, y0, f, SHADE_FOOT],
        [w, y1, f, 1],
        [-w, y1, f, 1],
        new Vector3(0, 0, 1),
    );
    quad(
        [w, y0, b, SHADE_FOOT],
        [-w, y0, b, SHADE_FOOT],
        [-w, y1, b, 1],
        [w, y1, b, 1],
        new Vector3(0, 0, -1),
    );
    const t = SHADE_TOP_FACE;
    quad(
        [-w, y1, f, t],
        [w, y1, f, t],
        [w, y1, b, t],
        [-w, y1, b, t],
        new Vector3(0, 1, 0),
    );

    const h = HEAD_HALF_WIDTH;
    const tip = 0.09;
    quad(
        [-h, y1 - 0.02, HEAD_Z, 1],
        [h, y1 - 0.02, HEAD_Z, 1],
        [h, BLOCK_HEIGHT, HEAD_Z - tip, 1],
        [-h, BLOCK_HEIGHT, HEAD_Z - tip, 1],
        new Vector3(0, tip, BLOCK_HEIGHT - y1),
        1,
    );

    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(positions, 3));
    g.setAttribute("normal", new Float32BufferAttribute(normals, 3));
    g.setAttribute("aPart", new Float32BufferAttribute(parts, 1));
    g.setAttribute("aShade", new Float32BufferAttribute(shades, 1));
    return g;
}

interface CrowdUniforms {
    uCrowdHead: IUniform<Color[]>;
    uCrowdMean: IUniform<Color>;
}

const CROWD_VERTEX_GLSL = /* glsl */ `
attribute float aPart;
attribute float aShade;
uniform vec3 uCrowdHead[4];
uniform vec3 uCrowdMean;
float crowdHash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
}
// 0 near the camera, 1 far away, where one person is about a pixel.
float crowdFar() {
    vec3 seat = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
    return smoothstep(45.0, 130.0, distance(seat, cameraPosition));
}
`;

const CROWD_COLOR_GLSL = /* glsl */ `
#ifdef USE_INSTANCING_COLOR
    {
        // Tone and head follow the person's place in the stand. Far away,
        // everyone drifts partway to the crowd's average so neighbors don't
        // shimmer, but the stand keeps its colors.
        float crowdH = crowdHash(instanceMatrix[3].xyz);
        float crowdFade = crowdFar();
        if (aPart > 0.5) {
            vColor.rgb = uCrowdHead[int(crowdH * 4.0)];
            vColor.rgb = mix(vColor.rgb, uCrowdMean * 1.05, crowdFade * 0.5);
        } else {
            vColor.rgb *= (0.88 + 0.24 * fract(crowdH * 5.1))
                * mix(aShade, 1.0, crowdFade);
            vColor.rgb = mix(vColor.rgb, uCrowdMean, crowdFade * 0.35);
        }
    }
#endif
`;

/** Far blocks widen until they touch, closing the bright gaps between them. */
const CROWD_WIDEN_GLSL = /* glsl */ `
    if (aPart < 0.5) transformed.x *= 1.0 + 0.3 * crowdFar();
`;

/** Softens hard shading: a little always-on fill, and normals lifted skyward. */
const FILL_GLSL = /* glsl */ `
    totalEmissiveRadiance += diffuseColor.rgb * 0.18;
`;
const LIFT_NORMAL_GLSL = /* glsl */ `
    objectNormal = normalize(objectNormal + vec3(0.0, 0.45, 0.0));
`;

function crowdMaterial(uniforms: CrowdUniforms): MeshStandardMaterial {
    const material = new MeshStandardMaterial({
        color: 0xd2d2d2,
        roughness: 0.92,
        metalness: 0,
        side: DoubleSide,
    });
    material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader =
            CROWD_VERTEX_GLSL +
            shader.vertexShader
                .replace(
                    "#include <color_vertex>",
                    `#include <color_vertex>\n${CROWD_COLOR_GLSL}`,
                )
                .replace(
                    "#include <beginnormal_vertex>",
                    `#include <beginnormal_vertex>\n${LIFT_NORMAL_GLSL}`,
                )
                .replace(
                    "#include <begin_vertex>",
                    `#include <begin_vertex>\n${CROWD_WIDEN_GLSL}`,
                );
        shader.fragmentShader = shader.fragmentShader.replace(
            "#include <emissivemap_fragment>",
            `#include <emissivemap_fragment>\n${FILL_GLSL}`,
        );
    };
    material.customProgramCacheKey = () => "crowd-block";
    return material;
}

/** Hair and hats, skin and trousers of the people style, picked per person. */
const PEOPLE_HAIR = [
    0x241a14, 0x0f0e0e, 0x4a3323, 0x8a6a3c, 0x6f6f72, 0xb9b6b0, 0x7a1f22,
    0x1b2a52,
];
const PEOPLE_SKIN = [0xa88268, 0x86604a, 0x5c4032, 0xb89a80];
const PEOPLE_LEGS = [0x1f2a3d, 0x121316, 0x6e6450, 0x33363c];

/** A standing person's hips are this far above a seat. */
export const STANDING_LIFT = 0.45;

/** Parts of a person (`aPart`): what the shader colors and poses. */
const TORSO = 0;
const HAIR = 1;
const LAP = 2;
const LEGS = 3;
const SKIN = 4;

/**
 * One spectator of the people style: a tapered torso with sloped shoulders,
 * a head, a lap (seated) and legs (standing; the shader folds away whichever
 * the pose doesn't use), and at high detail arms and separate thighs.
 * About 160 triangles at high detail and 50 at low.
 * The origin is the middle of the seat, +Z is the way the person faces.
 */
export function crowdPersonGeometry(
    detail: "low" | "high" = "high",
): BufferGeometry {
    const positions: number[] = [];
    const normals: number[] = [];
    const parts: number[] = [];
    const shades: number[] = [];
    type V = { p: Vector3; n: Vector3; shade: number };
    const tri = (a: V, b: V, c: V, part: number, center: Vector3) => {
        const face = new Vector3()
            .subVectors(b.p, a.p)
            .cross(new Vector3().subVectors(c.p, a.p));
        if (face.lengthSq() < 1e-12) return;
        const mid = new Vector3().add(a.p).add(b.p).add(c.p).divideScalar(3);
        const order = face.dot(mid.sub(center)) < 0 ? [a, c, b] : [a, b, c];
        for (const v of order) {
            positions.push(v.p.x, v.p.y, v.p.z);
            normals.push(v.n.x, v.n.y, v.n.z);
            parts.push(part);
            shades.push(v.shade);
        }
    };
    /** A flat-shaded quad whose normal points away from `center`. */
    const flat = (
        pts: [number, number, number][],
        part: number,
        center: Vector3,
        shade: number,
    ) => {
        const [a, b, c, d] = pts.map((p) => new Vector3(...p));
        const n = new Vector3()
            .subVectors(b, a)
            .cross(new Vector3().subVectors(c, a))
            .normalize();
        const mid = new Vector3().add(a).add(b).add(c).add(d).divideScalar(4);
        if (n.dot(mid.sub(center)) < 0) n.negate();
        const v = (p: Vector3): V => ({ p, n, shade });
        tri(v(a), v(b), v(c), part, center);
        tri(v(a), v(c), v(d), part, center);
    };
    interface Loop {
        y: number;
        halfW: number;
        halfD: number;
        z: number;
        shade: number;
    }
    /** A ring of `n` points, with normals pointing away from its axis. */
    const loop = (l: Loop, n: number, lift: number): V[] =>
        Array.from({ length: n }, (_, k) => {
            const a = ((k + 0.5) / n) * Math.PI * 2;
            const x = Math.cos(a) * l.halfW;
            const z = Math.sin(a) * l.halfD;
            return {
                p: new Vector3(x, l.y, l.z + z),
                n: new Vector3(x / l.halfW, lift, z / l.halfD).normalize(),
                shade: l.shade,
            };
        });
    const skin = (
        loops: V[][],
        apex: V | null,
        part: (mid: Vector3) => number,
        center: Vector3,
    ) => {
        const mid = (...vs: V[]) =>
            vs
                .reduce((m, v) => m.add(v.p), new Vector3())
                .divideScalar(vs.length);
        for (let i = 0; i + 1 < loops.length; i++) {
            const a = loops[i];
            const b = loops[i + 1];
            for (let k = 0; k < a.length; k++) {
                const j = (k + 1) % a.length;
                const what = part(mid(a[k], a[j], b[j], b[k]));
                tri(a[k], a[j], b[j], what, center);
                tri(a[k], b[j], b[k], what, center);
            }
        }
        if (apex) {
            const top = loops[loops.length - 1];
            for (let k = 0; k < top.length; k++) {
                const j = (k + 1) % top.length;
                tri(
                    top[k],
                    top[j],
                    apex,
                    part(mid(top[k], top[j], apex)),
                    center,
                );
            }
        }
    };

    const high = detail === "high";
    const n = high ? 8 : 4;
    const headN = high ? 8 : 5;
    // Torso: hips to shoulders, then in to the neck (the sloped shoulders).
    const torso: Loop[] = high
        ? [
              { y: -0.06, halfW: 0.175, halfD: 0.115, z: 0, shade: 0.62 },
              { y: 0.2, halfW: 0.17, halfD: 0.105, z: -0.012, shade: 0.86 },
              { y: 0.39, halfW: 0.232, halfD: 0.115, z: -0.035, shade: 1 },
              { y: 0.49, halfW: 0.215, halfD: 0.1, z: -0.045, shade: 1.04 },
              { y: 0.545, halfW: 0.065, halfD: 0.06, z: -0.05, shade: 0.9 },
          ]
        : [
              { y: -0.06, halfW: 0.2, halfD: 0.13, z: 0, shade: 0.66 },
              { y: 0.47, halfW: 0.25, halfD: 0.12, z: -0.04, shade: 1 },
              { y: 0.54, halfW: 0.08, halfD: 0.07, z: -0.05, shade: 0.9 },
          ];
    skin(
        torso.map((l) => loop(l, n, 0.25)),
        null,
        () => TORSO,
        new Vector3(0, 0.25, -0.02),
    );
    // Head: the face is skin, the crown and the back are hair or a hat.
    const head = new Vector3(0, 0.672, -0.05);
    const radius = new Vector3(0.086, 0.112, 0.1);
    const lat = (deg: number, shade: number): V[] => {
        const a = (deg * Math.PI) / 180;
        return loop(
            {
                y: head.y + Math.sin(a) * radius.y,
                halfW: Math.cos(a) * radius.x,
                halfD: Math.cos(a) * radius.z,
                z: head.z,
                shade,
            },
            headN,
            Math.tan(a),
        );
    };
    const crown: V = {
        p: new Vector3(head.x, head.y + radius.y, head.z),
        n: new Vector3(0, 1, 0),
        shade: 1.05,
    };
    const headPart = (mid: Vector3) =>
        mid.z > head.z + 0.03 && mid.y < head.y + 0.06 ? SKIN : HAIR;
    skin(
        high
            ? [lat(-62, 0.66), lat(-24, 0.9), lat(16, 1), lat(52, 1.03)]
            : [lat(-55, 0.75), lat(0, 0.95), lat(48, 1)],
        crown,
        headPart,
        head,
    );
    // Arms, at high detail: the upper arm at the side and the forearm
    // resting on the lap. Sleeves, so they take the shirt's color.
    if (high) {
        const armCenter = new Vector3(0, 0.3, -0.03);
        for (const sx of [-1, 1]) {
            const x0 = sx * 0.19;
            const x1 = sx * 0.275;
            flat(
                [
                    [x1, 0.17, -0.1],
                    [x1, 0.17, 0.03],
                    [x1, 0.455, 0.0],
                    [x1, 0.455, -0.1],
                ],
                TORSO,
                armCenter,
                0.86,
            );
            flat(
                [
                    [x0, 0.17, 0.03],
                    [x1, 0.17, 0.03],
                    [x1, 0.455, 0.0],
                    [x0, 0.455, 0.0],
                ],
                TORSO,
                armCenter,
                0.92,
            );
            flat(
                [
                    [x0, 0.2, 0.0],
                    [x1, 0.2, 0.0],
                    [x1 * 0.9, 0.17, 0.3],
                    [x0 * 0.8, 0.17, 0.3],
                ],
                TORSO,
                armCenter,
                0.96,
            );
            flat(
                [
                    [x1, 0.1, 0.0],
                    [x1 * 0.9, 0.09, 0.3],
                    [x1 * 0.9, 0.17, 0.3],
                    [x1, 0.2, 0.0],
                ],
                TORSO,
                armCenter,
                0.74,
            );
        }
    }
    // Lap: two thighs out to the knees, then the shins down to the tread.
    const lapCenter = new Vector3(0, -0.1, 0.25);
    for (const [inner, outer] of high
        ? [
              [-0.03, -0.17],
              [0.03, 0.17],
          ]
        : [[-0.17, 0.17]]) {
        flat(
            [
                [inner, 0.1, 0.04],
                [outer, 0.1, 0.04],
                [outer, 0.12, 0.46],
                [inner, 0.12, 0.46],
            ],
            LAP,
            lapCenter,
            0.92,
        );
        flat(
            [
                [inner, 0.12, 0.46],
                [outer, 0.12, 0.46],
                [outer * 0.94, -0.36, 0.43],
                [inner, -0.36, 0.43],
            ],
            LAP,
            lapCenter,
            0.66,
        );
        if (high)
            flat(
                [
                    [outer, 0.1, 0.04],
                    [outer, 0.12, 0.46],
                    [outer, -0.04, 0.46],
                    [outer, -0.06, 0.04],
                ],
                LAP,
                lapCenter,
                0.7,
            );
    }
    // Legs, for the people who stand.
    const legCenter = new Vector3(0, -0.45, -0.01);
    const legTop = -0.04;
    const legFoot = -(STANDING_LIFT + 0.41);
    for (const [inner, outer] of high
        ? [
              [-0.02, -0.165],
              [0.02, 0.165],
          ]
        : [[-0.165, 0.165]]) {
        const faces: [number, number, number, number][] = [
            [inner, 0.08, outer, 0.08],
            [inner, -0.1, outer, -0.1],
        ];
        if (high) faces.push([outer, 0.08, outer, -0.1]);
        for (const [x0, z0, x1, z1] of faces)
            flat(
                [
                    [x0, legFoot, z0],
                    [x1, legFoot, z1],
                    [x1, legTop, z1],
                    [x0, legTop, z0],
                ],
                LEGS,
                legCenter,
                0.66,
            );
    }

    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(positions, 3));
    g.setAttribute("normal", new Float32BufferAttribute(normals, 3));
    g.setAttribute("aPart", new Float32BufferAttribute(parts, 1));
    g.setAttribute("aShade", new Float32BufferAttribute(shades, 1));
    return g;
}

interface PeopleUniforms {
    uCrowdHair: IUniform<Color[]>;
    uCrowdSkin: IUniform<Color[]>;
    uCrowdLegs: IUniform<Color[]>;
    uCrowdMean: IUniform<Color>;
}

/**
 * A person's build: the instance's scale. It sizes everything above the
 * hips; laps and legs are fit to the seat and the tread instead (divided
 * by it again), so a big person's knees and feet stay on their tread.
 */
const CROWD_BUILD_GLSL = /* glsl */ `
vec3 crowdBuild() {
    return vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz),
        length(instanceMatrix[2].xyz));
}
`;

const PEOPLE_VERTEX_GLSL = /* glsl */ `
attribute float aPart;
attribute float aShade;
// x: the light that reaches this seat (0..1); y: 1 when the person stands.
attribute vec2 aLook;
uniform vec3 uCrowdHair[8];
uniform vec3 uCrowdSkin[4];
uniform vec3 uCrowdLegs[4];
uniform vec3 uCrowdMean;
float crowdHash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
}
float crowdFar() {
    vec3 seat = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
    return smoothstep(60.0, 160.0, distance(seat, cameraPosition));
}
mat3 crowdRotX(float a) {
    float c = cos(a), s = sin(a);
    return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c);
}
mat3 crowdRotY(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
}
// Each person's own way of sitting, from their seat: a lean forward or
// back, the head turned and tipped (to a neighbor, down at a phone), and
// broader or narrower shoulders. Rotations about the hips and the neck.
const vec3 CROWD_NECK = vec3(0.0, 0.56, -0.05);
vec3 crowdPose(vec3 p, bool isNormal) {
    if (aPart > 1.5 && aPart < 3.5) return p;
    float h = crowdHash(instanceMatrix[3].xyz + 17.0);
    float lean = (fract(h * 13.7) - 0.45) * 0.26;
    mat3 body = crowdRotX(lean);
    if (aPart > 0.5) {
        mat3 head = crowdRotY((h - 0.5) * 1.2)
            * crowdRotX((fract(h * 29.3) - 0.3) * 0.5);
        p = isNormal ? head * p : CROWD_NECK + head * (p - CROWD_NECK);
    } else if (!isNormal) {
        float wide = 0.9 + 0.2 * fract(h * 41.9);
        p.x *= mix(1.0, wide, smoothstep(0.22, 0.42, p.y));
    }
    return body * p;
}
`;

const PEOPLE_COLOR_GLSL = /* glsl */ `
#ifdef USE_INSTANCING_COLOR
    {
        float crowdH = crowdHash(instanceMatrix[3].xyz);
        vec3 crowdC = vColor.rgb * (0.9 + 0.2 * fract(crowdH * 5.1));
        if (aPart > 3.5) crowdC = uCrowdSkin[int(fract(crowdH * 3.7) * 4.0)];
        else if (aPart > 2.5) crowdC = uCrowdLegs[int(fract(crowdH * 7.3) * 4.0)];
        else if (aPart > 1.5) crowdC = uCrowdLegs[int(fract(crowdH * 7.3) * 4.0)];
        else if (aPart > 0.5) crowdC = uCrowdHair[int(crowdH * 8.0)];
        // Far away a person is a pixel or two: drift toward the crowd's
        // average so neighbors don't shimmer.
        crowdC = mix(crowdC * aShade, uCrowdMean * 0.9, crowdFar() * 0.45);
        // The light comes from over the field: it lands on heads, shoulders
        // and laps and on the side that faces the field (+Z here), and
        // leaves the backs the audience behind them sees in shade.
        float crowdLit = 0.3 + 0.5 * max(normal.y, 0.0)
            + 0.45 * max(normal.z, 0.0);
        vColor.rgb = crowdC * aLook.x * min(crowdLit, 1.1);
    }
#endif
`;

/**
 * Seated people have no legs to stand on; standing people have no lap. Both
 * keep the size they have at the seat, whatever the person's build.
 */
const PEOPLE_POSE_GLSL = /* glsl */ `
    transformed = crowdPose(transformed, false);
    if (aPart > 1.5 && aPart < 3.5) transformed /= crowdBuild();
    if (aPart > 1.5 && aPart < 2.5) transformed *= 1.0 - step(0.5, aLook.y);
    if (aPart > 2.5 && aPart < 3.5) transformed *= step(0.5, aLook.y);
`;

/**
 * The people style's material: lit only by the scene (no fill of its own),
 * so a crowd in a dark hall is dark.
 */
function peopleMaterial(uniforms: PeopleUniforms): MeshStandardMaterial {
    const material = new MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.96,
        metalness: 0,
    });
    material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader =
            CROWD_BUILD_GLSL +
            PEOPLE_VERTEX_GLSL +
            shader.vertexShader
                .replace(
                    "#include <color_vertex>",
                    `#include <color_vertex>\n${PEOPLE_COLOR_GLSL}`,
                )
                .replace(
                    "#include <beginnormal_vertex>",
                    "#include <beginnormal_vertex>\n    objectNormal = crowdPose(objectNormal, true);",
                )
                .replace(
                    "#include <begin_vertex>",
                    `#include <begin_vertex>\n${PEOPLE_POSE_GLSL}`,
                );
    };
    material.customProgramCacheKey = () => "crowd-people";
    return material;
}

/**
 * How many people of the people style are drawn as full figures around the
 * camera, and how far out they may reach; everyone else is a card
 * (`crowdCardGeometry`). A full house is tens of thousands of people, and
 * past about 20 m a figure is a few dozen pixels tall, where the card reads
 * the same.
 */
export const CROWD_NEAR = {
    high: { radius: 24, count: 2100 },
    low: { radius: 15, count: 600 },
} as const;

/** The camera moves this far before the full figures follow it, meters. */
export const CROWD_FOLLOW_STEP = 2.5;

/**
 * The card's extent around the seat, meters: knees to back, shins to crown.
 * Side on, its knees reach as far as the full figure's (0.46 m), with a
 * little more for the soft edge, so neither leaves its tread.
 */
const CARD_HALF_WIDTH = 0.48;
const CARD_BOTTOM = -0.38;
const CARD_TOP = 0.8;
/** How much of the camera's elevation the card leans back by. */
const CARD_TILT = 0.5;
/** A standing person's card reaches down to the feet. */
const CARD_FOOT = -(STANDING_LIFT + 0.41);

/**
 * The far figure of the people style: one upright quad (2 triangles) the
 * shader turns to the camera about the vertical and cuts into a seated or
 * standing silhouette. Positions are meters around the seat, as for
 * `crowdPersonGeometry`.
 */
export function crowdCardGeometry(): BufferGeometry {
    const w = CARD_HALF_WIDTH;
    const positions = [
        [-w, CARD_BOTTOM],
        [w, CARD_BOTTOM],
        [w, CARD_TOP],
        [-w, CARD_BOTTOM],
        [w, CARD_TOP],
        [-w, CARD_TOP],
    ].flatMap(([x, y]) => [x, y, 0]);
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(positions, 3));
    g.setAttribute(
        "normal",
        new Float32BufferAttribute(
            Array.from({ length: 6 }, () => [0, 0, 1]).flat(),
            3,
        ),
    );
    return g;
}

interface CardUniforms extends PeopleUniforms {
    /** The full figures' center and squared reach (kit-root frame). */
    uCrowdNear: IUniform<Vector3>;
    uCrowdNearR2: IUniform<number>;
    /** The cleared seats around a camera, and their squared radius. */
    uCrowdClear: IUniform<Vector3>;
    uCrowdClearR2: IUniform<number>;
}

const CARD_VERTEX_GLSL = /* glsl */ `
attribute vec2 aLook;
uniform vec3 uCrowdHair[8];
uniform vec3 uCrowdSkin[4];
uniform vec3 uCrowdLegs[4];
uniform vec3 uCrowdMean;
uniform vec3 uCrowdNear;
uniform float uCrowdNearR2;
uniform vec3 uCrowdClear;
uniform float uCrowdClearR2;
varying vec2 vCardP;
varying float vCardFront;
varying float vCardSide;
varying float vCardRise;
varying float vCardStand;
varying float vCardBuild;
varying vec3 vCardHair;
varying vec3 vCardSkin;
varying vec3 vCardLegs;
float crowdHash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
}
float crowdFar() {
    vec3 seat = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
    return smoothstep(60.0, 160.0, distance(seat, cameraPosition));
}
// The way to the camera, level, in the person's own frame (+Z: the way
// they face).
vec2 crowdView() {
    vec3 seat = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
    vec3 toCam = cameraPosition - seat;
    vec3 ax = normalize(mat3(modelMatrix) * instanceMatrix[0].xyz);
    vec3 az = normalize(mat3(modelMatrix) * instanceMatrix[2].xyz);
    return normalize(vec2(dot(toCam, ax), dot(toCam, az)) + vec2(0.0, 1e-4));
}
// How far above the person the camera is, as the sine of its elevation.
float crowdRise() {
    vec3 seat = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
    vec3 ay = normalize(mat3(modelMatrix) * instanceMatrix[1].xyz);
    return dot(normalize(cameraPosition - seat), ay);
}
// What a figure shows the camera, lit as the full figure is: the side that
// faces the camera, tipped up toward the light over the field.
vec3 crowdCardNormal(vec2 v) {
    return normalize(vec3(v.x * 0.9, 0.35, v.y * 0.9));
}
`;

const CARD_NORMAL_GLSL = /* glsl */ `
    objectNormal = crowdCardNormal(crowdView());
`;

const CARD_COLOR_GLSL = /* glsl */ `
#ifdef USE_INSTANCING_COLOR
    {
        vec2 crowdV = crowdView();
        vec3 crowdN = crowdCardNormal(crowdV);
        float crowdH = crowdHash(instanceMatrix[3].xyz);
        // A card is all cloth where a figure far off mixes cloth with hair,
        // laps and the gaps between people: a little darker and greyer.
        float crowdLit = min(0.3 + 0.5 * max(crowdN.y, 0.0)
            + 0.45 * max(crowdN.z, 0.0), 1.1) * aLook.x
            * mix(1.6, 0.88, smoothstep(-0.3, 0.3, crowdV.y));
        vColor.rgb = mix(vColor.rgb,
            vec3(dot(vColor.rgb, vec3(0.2126, 0.7152, 0.0722))), 0.1);
        float crowdF = crowdFar() * 0.45;
        vec3 crowdTo = uCrowdMean * 0.9;
        vColor.rgb = mix(vColor.rgb * (0.9 + 0.2 * fract(crowdH * 5.1)),
            crowdTo, crowdF) * crowdLit;
        vCardHair = mix(uCrowdHair[int(crowdH * 8.0)], crowdTo, crowdF)
            * crowdLit;
        vCardSkin = mix(uCrowdSkin[int(fract(crowdH * 3.7) * 4.0)], crowdTo,
            crowdF) * crowdLit;
        vCardLegs = mix(uCrowdLegs[int(fract(crowdH * 7.3) * 4.0)], crowdTo,
            crowdF) * crowdLit;
        vCardFront = crowdV.y;
        vCardSide = -crowdV.x;
        vCardRise = crowdRise();
        vCardStand = aLook.y;
        vCardBuild = fract(crowdH * 41.9);
    }
#endif
`;

/**
 * Turns the card to the camera and drops it (to a point) where the full
 * figures are drawn instead, or where the seats are cleared for a camera.
 */
const CARD_BEGIN_GLSL = /* glsl */ `
    {
        vec3 crowdSeat = instanceMatrix[3].xyz;
        vec3 dn = crowdSeat - uCrowdNear;
        vec3 dc = crowdSeat - uCrowdClear;
        float crowdKeep = step(uCrowdNearR2, dot(dn, dn))
            * step(uCrowdClearR2, dot(dc, dc));
        vec2 v = crowdView();
        float y = position.y;
        if (aLook.y > 0.5 && y < 0.0) y = ${CARD_FOOT.toFixed(3)};
        vCardP = vec2(position.x, y);
        // Seen from above, a figure shows its shoulders and lap as well as
        // its front or back: tip the card above the hips partway back to
        // the camera. Below the hips it stays upright, behind the seat in
        // front as the shins are.
        float tilt = asin(clamp(crowdRise(), -1.0, 1.0)) * ${CARD_TILT.toFixed(2)};
        float up = max(y, 0.0);
        transformed = vec3(position.x * v.y - up * sin(tilt) * v.x,
            up * cos(tilt) + min(y, 0.0),
            -position.x * v.x - up * sin(tilt) * v.y) * crowdKeep;
        // The card's foot keeps the seat's size, as the figure's legs do.
        if (y < 0.0) transformed /= crowdBuild();
    }
`;

/**
 * The silhouette, as a signed distance in meters (positive inside): a head,
 * sloped shoulders with the arms at the sides, and below the hips the lap
 * and shins seen from the front, the legs of a person standing, or nothing
 * from behind (the seat hides it).
 */
const CARD_FRAGMENT_GLSL = /* glsl */ `
varying vec2 vCardP;
varying float vCardFront;
varying float vCardSide;
varying float vCardRise;
varying float vCardStand;
varying float vCardBuild;
varying vec3 vCardHair;
varying vec3 vCardSkin;
varying vec3 vCardLegs;
`;

const CARD_SHAPE_GLSL = /* glsl */ `
    {
        vec2 p = vCardP;
        // Each person's build, as the full figure's: broader or narrower
        // shoulders, the head a little to one side.
        vec2 hq = (p - vec2((vCardBuild - 0.5) * 0.05, 0.672))
            / vec2(0.098, 0.122);
        float head = (1.0 - length(hq)) * 0.098;
        float neck = min(0.055 - abs(p.x), min(p.y - 0.45, 0.62 - p.y));
        float stand = step(0.5, vCardStand);
        float front = smoothstep(-0.2, 0.2, vCardFront);
        float side = sqrt(max(1.0 - vCardFront * vCardFront, 0.0));
        // From behind the arms hide behind the back, and side on a person
        // is narrower than across.
        float sh = clamp((p.y - 0.42) / 0.13, 0.0, 1.0);
        float hw = mix(mix(0.215, 0.262, front), 0.065, sh * sh);
        hw = mix(mix(0.165, 0.2, front), hw, smoothstep(0.02, 0.17, p.y));
        hw *= mix(1.0, 0.62, side)
            * mix(1.0, 0.9 + 0.2 * vCardBuild, smoothstep(0.22, 0.42, p.y));
        // Below the hips, seated: the lap out to the knees (to one side of
        // the card when seen side on), then the shins. From behind the seat
        // hides both, until from high above the lap shows past it.
        float above = smoothstep(0.15, 0.6, vCardRise);
        float kx = vCardSide * 0.4;
        float lw = 0.17 * abs(vCardFront) + 0.06;
        float lap = min(min(p.y + 0.02, 0.14 - p.y),
            abs(kx) * 0.5 + lw - abs(p.x - kx * 0.5));
        float shins = min(min(p.y - mix(-0.36, -0.2, above), 0.14 - p.y),
            lw - abs(p.x - kx));
        float seated = max(lap, front > 0.5 ? shins : -1.0);
        if (max(front, above) < 0.5) seated = -1.0;
        // Standing: two legs to the feet.
        float legs = min(0.165 * mix(1.0, 0.6, side) - abs(p.x),
            min(p.y + 0.86, 0.1 - p.y));
        float lower = mix(seated, legs, stand);
        float torso = min(hw - abs(p.x), min(p.y + 0.06, 0.55 - p.y));
        float body = max(torso, lower);
        float d = max(head, max(neck, body));
        diffuseColor.a = 0.5 + d * 40.0;

        // Shirt with shading baked as on the full figure: darker at the
        // hips, lit on the shoulders, rounded at the sides.
        float shade = mix(mix(0.4, 0.62, front), mix(1.15, 1.04, front),
                smoothstep(-0.06, 0.49, p.y))
            * (1.0 - 0.22 * pow(clamp(abs(p.x) / max(hw, 0.05), 0.0, 1.0), 2.0));
        // From high above the tops of the shoulders catch the light.
        vec3 c = diffuseColor.rgb * shade * mix(1.0, 1.12, above);
        if (lower > torso && p.y < 0.14) c = vCardLegs * 0.68;
        if (head > max(neck, body)) {
            // The face from the front, the hair from behind and on top.
            float face = front * step(p.y, 0.7) * step(abs(p.x), 0.07);
            // Lit from above like the full figure's crown.
            c = mix(vCardHair, vCardSkin, face)
                * mix(0.8, 1.25, smoothstep(0.58, 0.76, p.y));
        } else if (neck > body) c = vCardSkin * 0.8;
        diffuseColor.rgb = c;
    }
`;

function cardMaterial(uniforms: CardUniforms): MeshStandardMaterial {
    const material = new MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.96,
        metalness: 0,
        alphaTest: 0.5,
        alphaToCoverage: true,
    });
    material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader =
            CROWD_BUILD_GLSL +
            CARD_VERTEX_GLSL +
            shader.vertexShader
                .replace(
                    "#include <color_vertex>",
                    `#include <color_vertex>\n${CARD_COLOR_GLSL}`,
                )
                .replace(
                    "#include <beginnormal_vertex>",
                    `#include <beginnormal_vertex>\n${CARD_NORMAL_GLSL}`,
                )
                .replace(
                    "#include <begin_vertex>",
                    `#include <begin_vertex>\n${CARD_BEGIN_GLSL}`,
                );
        shader.fragmentShader =
            CARD_FRAGMENT_GLSL +
            shader.fragmentShader.replace(
                "#include <color_fragment>",
                `#include <color_fragment>\n${CARD_SHAPE_GLSL}`,
            );
    };
    material.customProgramCacheKey = () => "crowd-card";
    return material;
}

/**
 * Builds the crowd: a person on each seat row's polyline, spaced 0.64 m
 * apart, with an aisle every 18 people and a random subset skipped to reach
 * `density`, all facing down the rake. Colors come from the row's `side`.
 * The blocks are one `InstancedMesh` (one draw call). The people style is
 * two: everyone as a card, and full figures for the people nearest the
 * camera (`CROWD_NEAR`, moved by `follow`).
 */
export function buildCrowd(
    seatRows: SeatRow[],
    options: CrowdOptions = {},
): Crowd {
    const quality = options.quality ?? "high";
    const density =
        Math.min(1, Math.max(0, options.density ?? 0.6)) *
        (quality === "low" ? 0.5 : 1);
    const palette = options.palette ?? defaultCrowdPalette();
    const people = options.style === "people";
    const spacing = Math.max(0.2, options.spacing ?? PERSON_SPACING);
    const standing = people ? (options.standing ?? 0) : 0;
    const aisleEvery = Math.max(1, options.aisleEvery ?? DEFAULT_AISLE_EVERY);
    const aisleWidth = Math.max(0, options.aisleWidth ?? 2);
    const seed = options.seed ?? 7;
    const rnd = createRng(seed);
    // Pose and build get their own stream, so who sits where doesn't depend on
    // how much is randomized per person.
    const rndLook = createRng(seed + 1009);

    interface Placed {
        x: number;
        y: number;
        z: number;
        yaw: number;
        scale: number;
        height: number;
        color: number;
        /** The light that reaches the seat, 0..1 (people style). */
        light: number;
        standing: boolean;
    }
    const placed: Placed[] = [];
    const facing = rowFacingSigns(seatRows);
    seatRows.forEach((row, r) => {
        const colors = options.clothes?.length
            ? options.clothes
            : palette[row.side].length
              ? palette[row.side]
              : palette.neutral;
        const samples = sampleRow(row.points, row.closed, spacing);
        samples.forEach(({ position, tangent }, j) => {
            if (j % (aisleEvery + aisleWidth) >= aisleEvery) return;
            const fill = options.fill
                ? options.fill(position.x, position.y, position.z)
                : 1;
            if (rnd() >= density * fill) return;
            const nx = tangent.z * facing[r];
            const nz = -tangent.x * facing[r];
            const child = rndLook() < 0.05;
            const share = people ? (row.standing ?? standing) : 0;
            const up = !child && share > 0 && rndLook() < share;
            placed.push({
                light: options.shade
                    ? options.shade(position.x, position.y, position.z)
                    : 1,
                standing: up,
                x: position.x,
                y: position.y + (up ? STANDING_LIFT : 0),
                z: position.z,
                yaw: Math.atan2(nx, nz) + (rndLook() - 0.5) * 0.3,
                scale:
                    (child ? 0.86 : 1.02) + rndLook() * (child ? 0.08 : 0.14),
                height: PERSON_HEIGHT + rnd() * PERSON_HEIGHT_JITTER,
                color: colors[Math.floor(rnd() * colors.length)],
            });
        });
    });

    const colorsOf = (list: number[]) => list.map((c) => new Color(c));
    const total = placed.length;
    const mean = new Color(0, 0, 0);
    const color = new Color();
    placed.forEach((p) => {
        color.setHex(p.color);
        mean.r += color.r / total;
        mean.g += color.g / total;
        mean.b += color.b / total;
    });
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const scale = new Vector3();
    const translate = new Vector3();
    /** Writes everyone into `mesh`, one instance each. */
    const fill = (mesh: InstancedMesh) => {
        placed.forEach((p, i) => {
            q.setFromAxisAngle(up, p.yaw);
            m.compose(
                translate.set(p.x, p.y, p.z),
                q,
                scale.set(
                    p.scale,
                    (p.scale * p.height) / PERSON_HEIGHT,
                    p.scale,
                ),
            );
            mesh.setMatrixAt(i, m);
            mesh.setColorAt(i, color.setHex(p.color));
        });
        mesh.count = total;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    const clearRadius = options.clearRadius ?? Infinity;

    if (!people) {
        const geometry = crowdBlockGeometry();
        const material = crowdMaterial({
            uCrowdHead: { value: colorsOf(HEADS) },
            uCrowdMean: { value: mean },
        });
        const mesh = new InstancedMesh(geometry, material, Math.max(1, total));
        mesh.name = "crowd";
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.userData.crowd = true;
        fill(mesh);
        const base = new Float32Array(mesh.instanceMatrix.array); // copy
        let hidden = 0;
        const apply = (point: Vector3Tuple | null, radius: number): number => {
            const arr = mesh.instanceMatrix.array as Float32Array;
            const r2 = radius * radius;
            hidden = 0;
            for (let k = 0; k < total; k++) {
                const i = k * 16;
                let isNear = false;
                if (point) {
                    const dx = base[i + 12] - point[0];
                    const dy = base[i + 13] - point[1];
                    const dz = base[i + 14] - point[2];
                    isNear = dx * dx + dy * dy + dz * dz < r2;
                }
                if (isNear) hidden++;
                for (let e = 0; e < 16; e++) {
                    arr[i + e] = isNear && e !== 15 ? 0 : base[i + e];
                }
            }
            mesh.instanceMatrix.needsUpdate = true;
            return hidden;
        };
        return {
            object: mesh,
            mesh,
            near: null,
            count: total,
            clearAround: (point, radius) =>
                apply(point, Math.min(radius, clearRadius)),
            follow: () => false,
            reset: () => void apply(null, 0),
            visibleCount: () => total - hidden,
            dispose() {
                geometry.dispose();
                material.dispose();
                mesh.dispose();
            },
        };
    }

    // The people style: everyone as a card, and the people nearest the
    // camera as full figures on top, where the cards step aside.
    const uniforms: CardUniforms = {
        uCrowdHair: { value: colorsOf(PEOPLE_HAIR) },
        uCrowdSkin: { value: colorsOf(PEOPLE_SKIN) },
        uCrowdLegs: { value: colorsOf(PEOPLE_LEGS) },
        uCrowdMean: { value: mean },
        uCrowdNear: { value: new Vector3() },
        uCrowdNearR2: { value: 0 },
        uCrowdClear: { value: new Vector3() },
        uCrowdClearR2: { value: 0 },
    };
    const look = new Float32Array(Math.max(1, total) * 2);
    placed.forEach((p, i) => {
        look[i * 2] = p.light;
        look[i * 2 + 1] = p.standing ? 1 : 0;
    });

    const cardGeometry = crowdCardGeometry();
    cardGeometry.setAttribute("aLook", new InstancedBufferAttribute(look, 2));
    const cardMat = cardMaterial(uniforms);
    const mesh = new InstancedMesh(cardGeometry, cardMat, Math.max(1, total));
    mesh.name = "crowd";
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.crowd = true;
    fill(mesh);
    const base = mesh.instanceMatrix.array as Float32Array;
    const baseColor = mesh.instanceColor!.array as Float32Array;

    const reach = CROWD_NEAR[quality];
    const cap = Math.max(1, Math.min(reach.count, total));
    const nearGeometry = crowdPersonGeometry(quality);
    const nearLook = new InstancedBufferAttribute(new Float32Array(cap * 2), 2);
    nearLook.setUsage(DynamicDrawUsage);
    nearGeometry.setAttribute("aLook", nearLook);
    const nearMat = peopleMaterial(uniforms);
    const near = new InstancedMesh(nearGeometry, nearMat, cap);
    near.name = "crowd.near";
    near.castShadow = false;
    near.receiveShadow = false;
    near.userData.crowd = true;
    near.instanceMatrix.setUsage(DynamicDrawUsage);
    near.instanceColor = new InstancedBufferAttribute(
        new Float32Array(cap * 3),
        3,
    );
    near.instanceColor.setUsage(DynamicDrawUsage);
    near.count = 0;

    const object = new Group();
    object.name = "crowd";
    object.add(mesh, near);

    let center: Vector3Tuple | null = null;
    let clearPoint: Vector3Tuple | null = null;
    let clearR2 = 0;
    let hidden = 0;
    const d2 = new Float64Array(total);
    const order: number[] = [];

    /** Puts the people nearest `point` (and not cleared) into `near`. */
    const choose = (point: Vector3Tuple) => {
        center = [...point];
        const r2 = reach.radius * reach.radius;
        order.length = 0;
        for (let k = 0; k < total; k++) {
            const i = k * 16;
            const x = base[i + 12];
            const y = base[i + 13];
            const z = base[i + 14];
            d2[k] =
                (x - point[0]) ** 2 + (y - point[1]) ** 2 + (z - point[2]) ** 2;
            if (d2[k] >= r2) continue;
            if (
                clearPoint &&
                (x - clearPoint[0]) ** 2 +
                    (y - clearPoint[1]) ** 2 +
                    (z - clearPoint[2]) ** 2 <
                    clearR2
            )
                continue;
            order.push(k);
        }
        // Too many for the full figures: the nearest, and the cards take
        // over halfway to the next one out. People at the same distance
        // (a stand is symmetric) go together, so none is drawn twice.
        let reachR2 = r2;
        if (order.length > cap) {
            order.sort((a, b) => d2[a] - d2[b]);
            let keep = cap;
            while (keep > 0 && d2[order[keep - 1]] >= d2[order[keep]]) keep--;
            reachR2 =
                ((Math.sqrt(d2[order[keep - 1]] ?? 0) +
                    Math.sqrt(d2[order[keep]])) /
                    2) **
                2;
            order.length = keep;
        }
        const matrices = near.instanceMatrix.array as Float32Array;
        const colors = near.instanceColor!.array as Float32Array;
        const looks = nearLook.array as Float32Array;
        order.forEach((k, slot) => {
            matrices.set(base.subarray(k * 16, k * 16 + 16), slot * 16);
            colors.set(baseColor.subarray(k * 3, k * 3 + 3), slot * 3);
            looks[slot * 2] = look[k * 2];
            looks[slot * 2 + 1] = look[k * 2 + 1];
        });
        near.count = order.length;
        near.instanceMatrix.needsUpdate = true;
        near.instanceColor!.needsUpdate = true;
        nearLook.needsUpdate = true;
        near.computeBoundingSphere();
        uniforms.uCrowdNear.value.set(...point);
        uniforms.uCrowdNearR2.value = reachR2;
    };

    const clear = (point: Vector3Tuple | null, radius: number): number => {
        clearPoint = point ? [...point] : null;
        clearR2 = point ? radius * radius : 0;
        hidden = 0;
        if (point)
            for (let k = 0; k < total; k++) {
                const i = k * 16;
                if (
                    (base[i + 12] - point[0]) ** 2 +
                        (base[i + 13] - point[1]) ** 2 +
                        (base[i + 14] - point[2]) ** 2 <
                    clearR2
                )
                    hidden++;
            }
        uniforms.uCrowdClear.value.set(...(point ?? [0, 0, 0]));
        uniforms.uCrowdClearR2.value = clearR2;
        const at = point ?? center;
        if (at) choose(at);
        return hidden;
    };

    const step2 = CROWD_FOLLOW_STEP * CROWD_FOLLOW_STEP;
    return {
        object,
        mesh,
        near,
        count: total,
        clearAround: (point, radius) =>
            clear(point, Math.min(radius, clearRadius)),
        follow(point) {
            if (
                center &&
                (point[0] - center[0]) ** 2 +
                    (point[1] - center[1]) ** 2 +
                    (point[2] - center[2]) ** 2 <
                    step2
            )
                return false;
            choose(point);
            return true;
        },
        reset: () => void clear(null, 0),
        visibleCount: () => total - hidden,
        dispose() {
            cardGeometry.dispose();
            cardMat.dispose();
            mesh.dispose();
            nearGeometry.dispose();
            nearMat.dispose();
            near.dispose();
        },
    };
}
