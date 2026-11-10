// cspell:ignore fract beginnormal emissivemap
import {
    BufferGeometry,
    Color,
    DoubleSide,
    Float32BufferAttribute,
    InstancedMesh,
    Matrix4,
    MeshStandardMaterial,
    Quaternion,
    Vector3,
    type IUniform,
    type Vector3Tuple,
    type WebGLProgramParametersWithUniforms,
} from "three";
import type { SeatRow, VenueParams } from "../types";
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

export interface CrowdOptions {
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
    /** One `InstancedMesh` for everyone, in the same frame as the seat rows. */
    mesh: InstancedMesh;
    /** Number of people placed (before any `clearAround`). */
    count: number;
    /**
     * Hides everyone within `radius` meters of `point` (same frame as the
     * seat rows) and shows everyone else, so the latest call wins. Call it
     * when the camera sits in a seat. Returns how many people are hidden.
     */
    clearAround(point: Vector3Tuple, radius: number): number;
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

/**
 * Builds the crowd as one `InstancedMesh` (one draw call): a block per person
 * on each seat row's polyline, spaced 0.64 m apart, with an aisle every 18
 * people and a random subset skipped to reach `density`, all facing down the
 * rake. Colors come from the row's `side`.
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
    }
    const placed: Placed[] = [];
    const facing = rowFacingSigns(seatRows);
    seatRows.forEach((row, r) => {
        const colors = palette[row.side].length
            ? palette[row.side]
            : palette.neutral;
        const samples = sampleRow(row.points, row.closed, PERSON_SPACING);
        samples.forEach(({ position, tangent }, j) => {
            if (j % (aisleEvery + aisleWidth) >= aisleEvery) return;
            if (rnd() >= density) return;
            const nx = tangent.z * facing[r];
            const nz = -tangent.x * facing[r];
            const child = rndLook() < 0.05;
            placed.push({
                x: position.x,
                y: position.y,
                z: position.z,
                yaw: Math.atan2(nx, nz) + (rndLook() - 0.5) * 0.3,
                scale:
                    (child ? 0.86 : 1.02) + rndLook() * (child ? 0.08 : 0.14),
                height: PERSON_HEIGHT + rnd() * PERSON_HEIGHT_JITTER,
                color: colors[Math.floor(rnd() * colors.length)],
            });
        });
    });

    const geometry = crowdBlockGeometry();
    const uniforms: CrowdUniforms = {
        uCrowdHead: { value: HEADS.map((c) => new Color(c)) },
        uCrowdMean: { value: new Color(0, 0, 0) },
    };
    const material = crowdMaterial(uniforms);
    const mesh = new InstancedMesh(
        geometry,
        material,
        Math.max(1, placed.length),
    );
    mesh.name = "crowd";
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.crowd = true;

    const total = placed.length;
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const scale = new Vector3();
    const translate = new Vector3();
    const color = new Color();
    const mean = uniforms.uCrowdMean.value;
    placed.forEach((p, i) => {
        q.setFromAxisAngle(up, p.yaw);
        m.compose(
            translate.set(p.x, p.y, p.z),
            q,
            scale.set(p.scale, (p.scale * p.height) / PERSON_HEIGHT, p.scale),
        );
        mesh.setMatrixAt(i, m);
        color.setHex(p.color);
        mesh.setColorAt(i, color);
        mean.r += color.r / total;
        mean.g += color.g / total;
        mean.b += color.b / total;
    });
    mesh.count = total;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

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
        mesh,
        count: total,
        clearAround: (point, radius) => apply(point, radius),
        reset: () => void apply(null, 0),
        visibleCount: () => total - hidden,
        dispose() {
            geometry.dispose();
            material.dispose();
            mesh.dispose();
        },
    };
}
