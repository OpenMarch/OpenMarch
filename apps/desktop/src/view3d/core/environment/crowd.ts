// cspell:ignore fract beginnormal emissivemap
import {
    Color,
    DoubleSide,
    DynamicDrawUsage,
    FrontSide,
    InstancedBufferAttribute,
    InstancedMesh,
    Matrix4,
    MeshStandardMaterial,
    Quaternion,
    Vector3,
    type BufferGeometry,
    type IUniform,
    type Vector3Tuple,
    type WebGLProgramParametersWithUniforms,
} from "three";
import type { SeatRow, VenueParams } from "../types";
import {
    farFigureGeometry,
    FIGURE_HEIGHT,
    lowFigureGeometry,
    midFigureGeometry,
    nearFigureGeometry,
} from "./crowdFigures";
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

/**
 * Levels of detail, by distance from the camera in meters. Everyone exists in
 * the far tier; people inside `CROWD_MID_RADIUS` are drawn with a better
 * figure instead, up to a fixed number, so the triangle cost has a ceiling.
 */
export const CROWD_NEAR_RADIUS = 18;
export const CROWD_MID_RADIUS = 60;
export const CROWD_NEAR_CAP = 650;
export const CROWD_MID_CAP = 4200;
/** How far the camera moves before the tiers are chosen again, meters. */
const LOD_MOVE_THRESHOLD = 2;

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
    /** "low" halves the density and draws everyone with one figure. Default "high". */
    quality?: "low" | "high";
    /** Seed for the deterministic layout. Default 7. */
    seed?: number;
}

export interface Crowd {
    /**
     * Everyone's far-tier `InstancedMesh`, in the same frame as the seat rows.
     * The closer tiers are its children, so adding this adds the whole crowd.
     */
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
    /** How many people the near and mid tiers currently draw. */
    tierCounts(): { near: number; mid: number };
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

/** Everyday clothes: muted, and nothing close to white. */
const STREET_CLOTHES = [
    0x8a877d, 0x2c2f36, 0x434b5c, 0x5e443d, 0x7a705a, 0x485046, 0x62646a,
    0x343a46, 0x3f3a36, 0x6f6a5f,
];

/** Skin, hair and trousers, linear RGB, picked per person in the shader. */
const SKIN = [0xc9a184, 0xa87c5e, 0x7d553c, 0x54392a];
const HAIR = [0x1d1a18, 0x3b2c22, 0x6b5a48, 0x8d8b88];
const PANTS = [0x2d3442, 0x3a3d44, 0x4e4a42, 0x23262c];
const SEAT_COLOR = 0x3d4048;

/**
 * Default shirt colors: home and away rows lean toward their team color,
 * neutral rows wear everyday clothes.
 */
export function defaultCrowdPalette(
    params?: Pick<VenueParams, "homeColor" | "awayColor">,
): CrowdPalette {
    const home = calmTeamColor(hex(params?.homeColor ?? "", 0x6442ff));
    const away = calmTeamColor(hex(params?.awayColor ?? "", 0xc23b3b));
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

/** Uniforms shared by every tier's material. */
interface CrowdUniforms {
    uCrowdSkin: IUniform<Color[]>;
    uCrowdHair: IUniform<Color[]>;
    uCrowdPants: IUniform<Color[]>;
    uCrowdSeat: IUniform<Color>;
    uCrowdLodCenter: IUniform<Vector3>;
    uCrowdLodRadius: IUniform<number>;
}

const PARTS_GLSL = /* glsl */ `
attribute float aPart;
uniform vec3 uCrowdSkin[4];
uniform vec3 uCrowdHair[4];
uniform vec3 uCrowdPants[4];
uniform vec3 uCrowdSeat;
uniform vec3 uCrowdLodCenter;
uniform float uCrowdLodRadius;
float crowdHash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
}
`;

const PARTS_COLOR_GLSL = /* glsl */ `
#ifdef USE_INSTANCING_COLOR
    {
        // Skin, hair and trousers follow the person's place in the stand, so
        // every tier agrees without a per-instance attribute.
        float crowdH = crowdHash(instanceMatrix[3].xyz);
        if (aPart > 3.5) vColor.rgb = uCrowdSeat;
        else if (aPart > 2.5) vColor.rgb = uCrowdPants[int(fract(crowdH * 7.3) * 4.0)];
        else if (aPart > 1.5) vColor.rgb = uCrowdHair[int(fract(crowdH * 3.7) * 4.0)];
        else if (aPart > 0.5) vColor.rgb = uCrowdSkin[int(crowdH * 4.0)];
    }
#endif
`;

/** Softens hard shading: a little always-on fill, and normals lifted skyward. */
const FILL_GLSL = /* glsl */ `
    totalEmissiveRadiance += diffuseColor.rgb * 0.18;
`;
const LIFT_NORMAL_GLSL = /* glsl */ `
    objectNormal = normalize(objectNormal + vec3(0.0, 0.45, 0.0));
`;

const FAR_COLLAPSE_GLSL = /* glsl */ `
    // A closer tier draws this person.
    if (distance(instanceMatrix[3].xyz, uCrowdLodCenter) < uCrowdLodRadius) {
        transformed = vec3(0.0);
    }
`;

function crowdMaterial(
    uniforms: CrowdUniforms,
    tier: "far" | "close",
): MeshStandardMaterial {
    const material = new MeshStandardMaterial({
        color: 0xd2d2d2,
        roughness: 0.92,
        metalness: 0,
        side: tier === "far" ? DoubleSide : FrontSide,
    });
    material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader =
            PARTS_GLSL +
            shader.vertexShader
                .replace(
                    "#include <color_vertex>",
                    `#include <color_vertex>\n${PARTS_COLOR_GLSL}`,
                )
                .replace(
                    "#include <beginnormal_vertex>",
                    `#include <beginnormal_vertex>\n${LIFT_NORMAL_GLSL}`,
                );
        shader.fragmentShader = shader.fragmentShader.replace(
            "#include <emissivemap_fragment>",
            `#include <emissivemap_fragment>\n${FILL_GLSL}`,
        );
        if (tier === "far") {
            shader.vertexShader = shader.vertexShader.replace(
                "#include <begin_vertex>",
                `#include <begin_vertex>\n${FAR_COLLAPSE_GLSL}`,
            );
        }
    };
    material.customProgramCacheKey = () => `crowd-${tier}`;
    return material;
}

interface Tier {
    mesh: InstancedMesh;
    colors: InstancedBufferAttribute;
}

function closeTier(
    name: string,
    geometry: BufferGeometry,
    material: MeshStandardMaterial,
    capacity: number,
): Tier {
    const mesh = new InstancedMesh(geometry, material, capacity);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    // Drawn after the far tier, whose render hook chooses who goes here.
    mesh.renderOrder = 1;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    const colors = new InstancedBufferAttribute(
        new Float32Array(capacity * 3),
        3,
    );
    colors.setUsage(DynamicDrawUsage);
    mesh.instanceColor = colors;
    mesh.count = 0;
    return { mesh, colors };
}

/**
 * Builds the crowd: people on each seat row's polyline, spaced 0.64 m apart,
 * with an aisle every 18 people and a random subset skipped to reach
 * `density`, all facing down the rake. Colors come from the row's `side`.
 *
 * At high quality everyone is an 8-triangle far figure in one `InstancedMesh`.
 * The mesh's render hook keeps two small instanced tiers around the camera (a
 * 36-triangle and a 160-triangle figure) and collapses those people out of
 * the far tier in the vertex shader, so moving the camera never re-uploads the
 * big buffer. At low quality everyone is a single 12-triangle figure in one
 * draw call and there are no tiers.
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

    const toLinear = (list: number[]) => list.map((c) => new Color(c));
    const uniforms: CrowdUniforms = {
        uCrowdSkin: { value: toLinear(SKIN) },
        uCrowdHair: { value: toLinear(HAIR) },
        uCrowdPants: { value: toLinear(PANTS) },
        uCrowdSeat: { value: new Color(SEAT_COLOR) },
        uCrowdLodCenter: { value: new Vector3() },
        uCrowdLodRadius: { value: 0 },
    };

    const lowQuality = quality === "low";
    const farGeometry = lowQuality ? lowFigureGeometry() : farFigureGeometry();
    const farMaterial = crowdMaterial(uniforms, "far");
    const mesh = new InstancedMesh(
        farGeometry,
        farMaterial,
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
    const shirts = new Float32Array(total * 3);
    placed.forEach((p, i) => {
        q.setFromAxisAngle(up, p.yaw);
        m.compose(
            translate.set(p.x, p.y, p.z),
            q,
            scale.set(p.scale, (p.scale * p.height) / FIGURE_HEIGHT, p.scale),
        );
        mesh.setMatrixAt(i, m);
        color.setHex(p.color);
        mesh.setColorAt(i, color);
        shirts[i * 3] = color.r;
        shirts[i * 3 + 1] = color.g;
        shirts[i * 3 + 2] = color.b;
    });
    mesh.count = total;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    const base = new Float32Array(mesh.instanceMatrix.array); // copy
    const cleared = new Uint8Array(total);

    // The close tiers exist only at high quality.
    const closeGeometries: BufferGeometry[] = [];
    let closeMaterial: MeshStandardMaterial | null = null;
    let near: Tier | null = null;
    let mid: Tier | null = null;
    if (!lowQuality && total > 0) {
        const nearGeometry = nearFigureGeometry();
        const midGeometry = midFigureGeometry();
        closeGeometries.push(nearGeometry, midGeometry);
        closeMaterial = crowdMaterial(uniforms, "close");
        near = closeTier(
            "crowd.near",
            nearGeometry,
            closeMaterial,
            Math.min(CROWD_NEAR_CAP, total),
        );
        mid = closeTier(
            "crowd.mid",
            midGeometry,
            closeMaterial,
            Math.min(CROWD_MID_CAP, total),
        );
        mesh.add(near.mesh, mid.mesh);
    }

    const distances = new Float32Array(total);
    const candidates = new Uint32Array(total);
    const lodCenter = new Vector3(Infinity, 0, 0);
    let lodDirty = true;
    /** Radius to apply once the close tiers' buffers have been uploaded. */
    let pendingRadius: number | null = null;
    const pendingCenter = new Vector3();

    const copyTier = (
        tier: Tier,
        order: Uint32Array,
        from: number,
        to: number,
    ): void => {
        const matrices = tier.mesh.instanceMatrix.array as Float32Array;
        const rgb = tier.colors.array as Float32Array;
        for (let k = from; k < to; k++) {
            const person = order[k];
            const slot = k - from;
            matrices.set(
                base.subarray(person * 16, person * 16 + 16),
                slot * 16,
            );
            rgb[slot * 3] = shirts[person * 3];
            rgb[slot * 3 + 1] = shirts[person * 3 + 1];
            rgb[slot * 3 + 2] = shirts[person * 3 + 2];
        }
        tier.mesh.count = to - from;
        tier.mesh.instanceMatrix.needsUpdate = true;
        tier.colors.needsUpdate = true;
    };

    /**
     * Chooses who the near and mid tiers draw around `center` and returns the
     * radius inside which the far tier should collapse: people past the caps
     * stay in the far tier, so nobody ever disappears.
     */
    const selectTiers = (center: Vector3): number => {
        if (!near || !mid) return 0;
        lodCenter.copy(center);
        lodDirty = false;
        const midR2 = CROWD_MID_RADIUS * CROWD_MID_RADIUS;
        let found = 0;
        for (let k = 0; k < total; k++) {
            if (cleared[k]) continue;
            const i = k * 16;
            const dx = base[i + 12] - center.x;
            const dy = base[i + 13] - center.y;
            const dz = base[i + 14] - center.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= midR2) continue;
            distances[k] = d2;
            candidates[found++] = k;
        }
        const order = candidates.subarray(0, found);
        order.sort((a, b) => distances[a] - distances[b]);

        const nearR2 = CROWD_NEAR_RADIUS * CROWD_NEAR_RADIUS;
        let nearCount = 0;
        while (
            nearCount < found &&
            nearCount < CROWD_NEAR_CAP &&
            distances[order[nearCount]] < nearR2
        ) {
            nearCount++;
        }
        const midEnd = Math.min(found, nearCount + CROWD_MID_CAP);
        copyTier(near, order, 0, nearCount);
        copyTier(mid, order, nearCount, midEnd);
        if (midEnd === found) return CROWD_MID_RADIUS;
        // The cap cut the mid tier short: only those drawn leave the far tier.
        return Math.sqrt(distances[order[midEnd]]);
    };

    const setFarHole = (center: Vector3, radius: number): void => {
        uniforms.uCrowdLodCenter.value.copy(center);
        uniforms.uCrowdLodRadius.value = radius;
    };

    const cameraWorld = new Vector3();
    if (near) {
        mesh.onBeforeRender = (_renderer, _scene, camera) => {
            // Buffers filled last frame have been uploaded by now, so the far
            // tier can let go of those people without a one-frame hole.
            if (pendingRadius !== null) {
                setFarHole(pendingCenter, pendingRadius);
                pendingRadius = null;
            }
            cameraWorld.setFromMatrixPosition(camera.matrixWorld);
            mesh.worldToLocal(cameraWorld);
            if (
                lodDirty ||
                cameraWorld.distanceToSquared(lodCenter) >
                    LOD_MOVE_THRESHOLD * LOD_MOVE_THRESHOLD
            ) {
                pendingRadius = selectTiers(cameraWorld);
                pendingCenter.copy(cameraWorld);
            }
        };
    }

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
            cleared[k] = isNear ? 1 : 0;
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
        clearAround: (point, radius) => {
            const count = apply(point, radius);
            // This runs before a render, so the new tiers upload in time for
            // the same frame and the hole can move straight away.
            pendingCenter.set(point[0], point[1], point[2]);
            setFarHole(pendingCenter, selectTiers(pendingCenter));
            pendingRadius = null;
            return count;
        },
        reset: () => {
            apply(null, 0);
            lodDirty = true;
        },
        visibleCount: () => total - hidden,
        tierCounts: () => ({
            near: near?.mesh.count ?? 0,
            mid: mid?.mesh.count ?? 0,
        }),
        dispose() {
            farGeometry.dispose();
            farMaterial.dispose();
            mesh.dispose();
            closeGeometries.forEach((g) => g.dispose());
            closeMaterial?.dispose();
            near?.mesh.dispose();
            mid?.mesh.dispose();
        },
    };
}
