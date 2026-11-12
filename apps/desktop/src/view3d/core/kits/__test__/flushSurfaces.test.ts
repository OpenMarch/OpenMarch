// @vitest-environment node
/**
 * Two surfaces in the same plane, both facing the camera, flash through each
 * other as it moves (z-fighting). This scans each stadium, with the shared
 * land, for large triangles lying within 5 cm of another one that a camera
 * could see at the same time and that no polygon offset separates, or that
 * an offset draws behind a surface it actually lies in front of.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
    BackSide,
    DoubleSide,
    FrontSide,
    InstancedMesh,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    PlaneGeometry,
    Scene,
    Vector3,
    type Material,
} from "three";
import {
    createEnvironment,
    GROUND_LAYER,
    setGroundLayer,
    setTexturePainting,
} from "../../environment";
import { FIELD_SURFACE_Y } from "../../field";
import { KIT_BUILDERS } from "..";
import { DEFAULT_VENUE_PARAMS } from "../../venueSettings";

beforeAll(() => setTexturePainting(false));

interface Tri {
    mesh: string;
    /** Polygon offset factor: surfaces with different offsets never fight. */
    offset: number;
    side: number;
    n: Vector3;
    d: number;
    v: [Vector3, Vector3, Vector3];
    min: Vector3;
    max: Vector3;
    area: number;
}

/** Smallest triangle looked at, and the overlap that fails the test (m²). */
const MIN_AREA = 0.3;
const MAX_OVERLAP = 1;
const MAX_GAP = 0.05;

function collect(scene: Scene): Tri[] {
    const triangles: Tri[] = [];
    const m = new Matrix4();
    const im = new Matrix4();
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh || !mesh.visible) return;
        const inst = (mesh as InstancedMesh).isInstancedMesh
            ? (mesh as InstancedMesh)
            : null;
        // The crowd: thousands of small blocks, never flush with anything.
        if (inst && inst.count > 2000) return;
        const pos = mesh.geometry.attributes.position;
        if (!pos) return;
        const index = mesh.geometry.index;
        const mat = (
            Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
        ) as Material;
        const offset = mat.polygonOffset ? mat.polygonOffsetFactor : 0;
        const n = index ? index.count : pos.count;
        for (let k = 0; k < (inst ? inst.count : 1); k++) {
            m.copy(mesh.matrixWorld);
            if (inst) m.multiply((inst.getMatrixAt(k, im), im));
            for (let t = 0; t < n; t += 3) {
                const v = [0, 1, 2].map((j) =>
                    new Vector3()
                        .fromBufferAttribute(
                            pos,
                            index ? index.getX(t + j) : t + j,
                        )
                        .applyMatrix4(m),
                ) as Tri["v"];
                const nn = v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0]));
                const area = nn.length() / 2;
                if (area < MIN_AREA) continue;
                nn.normalize();
                triangles.push({
                    mesh: mesh.name || mesh.type,
                    offset,
                    side: mat.side,
                    n: nn,
                    d: nn.dot(v[0]),
                    v,
                    min: v[0].clone().min(v[1]).min(v[2]),
                    max: v[0].clone().max(v[1]).max(v[2]),
                    area,
                });
            }
        }
    });
    return triangles;
}

/** Whether some camera can see the front of both, or one drawn from behind. */
function visibleTogether(p: Tri, q: Tri): boolean {
    const front = (s: number) => s === FrontSide || s === DoubleSide;
    const back = (s: number) => s === BackSide || s === DoubleSide;
    return p.n.dot(q.n) > 0
        ? (front(p.side) && front(q.side)) || (back(p.side) && back(q.side))
        : (front(p.side) && back(q.side)) || (back(p.side) && front(q.side));
}

/** Roughly how much of `p` (m²) lies over `q`, by sampling points of `p`. */
function overlap(p: Tri, q: Tri): number {
    const [a, b, c] = q.v;
    const e0 = b.clone().sub(a);
    const e1 = c.clone().sub(a);
    const d00 = e0.dot(e0);
    const d01 = e0.dot(e1);
    const d11 = e1.dot(e1);
    const den = d00 * d11 - d01 * d01;
    if (Math.abs(den) < 1e-12) return 0;
    const S = 36;
    let hits = 0;
    for (let i = 0; i < S; i++) {
        let u = (i * 0.618034) % 1;
        let w = (i * 0.754877) % 1;
        if (u + w > 1) [u, w] = [1 - u, 1 - w];
        const e2 = p.v[0]
            .clone()
            .multiplyScalar(1 - u - w)
            .addScaledVector(p.v[1], u)
            .addScaledVector(p.v[2], w)
            .sub(a);
        const d20 = e2.dot(e0);
        const d21 = e2.dot(e1);
        const bv = (d11 * d20 - d01 * d21) / den;
        const bw = (d00 * d21 - d01 * d20) / den;
        if (bv > 0.02 && bw > 0.02 && bv + bw < 0.98) hits++;
    }
    return (p.area * hits) / S;
}

/** Pairs of meshes with flush surfaces that fight, and the worst overlap. */
function flushPairs(triangles: Tri[]): Map<string, number> {
    // Bucket by plane: normal (either way round) and distance, 5 cm bands.
    const buckets = new Map<string, Tri[]>();
    const keyOf = (t: Tri) => {
        const flip =
            t.n.x < -1e-3 ||
            (Math.abs(t.n.x) <= 1e-3 &&
                (t.n.y < -1e-3 || (Math.abs(t.n.y) <= 1e-3 && t.n.z < 0)));
        const s = flip ? -1 : 1;
        const n = [t.n.x, t.n.y, t.n.z].map((x) => Math.round(x * s * 50));
        return { plane: n.join(","), band: Math.floor((t.d * s) / MAX_GAP) };
    };
    for (const t of triangles) {
        const { plane, band } = keyOf(t);
        const k = `${plane}|${band}`;
        buckets.set(k, [...(buckets.get(k) ?? []), t]);
    }
    const found = new Map<string, number>();
    for (const [k, list] of buckets) {
        const [plane, band] = k.split("|");
        const near = [
            ...list,
            ...(buckets.get(`${plane}|${Number(band) + 1}`) ?? []),
        ];
        for (const p of list) {
            for (const q of near) {
                if (p === q || p.mesh === q.mesh) continue;
                // Different offsets settle which one wins; that's only right
                // if the one in front (further along the normal) wins.
                let label = "";
                if (p.offset !== q.offset) {
                    if (p.n.dot(q.n) <= 0) continue;
                    const ahead = p.d - q.d;
                    if (Math.abs(ahead) < 0.002) continue;
                    const [front, back] = ahead > 0 ? [p, q] : [q, p];
                    if (front.offset < back.offset) continue;
                    label = ` (${front.mesh} is in front but drawn behind)`;
                }
                if (Math.abs(Math.abs(p.d) - Math.abs(q.d)) > MAX_GAP) continue;
                if (!visibleTogether(p, q)) continue;
                const apart = [0, 1, 2].some(
                    (i) =>
                        Math.min(p.max.getComponent(i), q.max.getComponent(i)) -
                            Math.max(
                                p.min.getComponent(i),
                                q.min.getComponent(i),
                            ) <
                        -MAX_GAP - 0.01,
                );
                if (apart) continue;
                const ov = overlap(p, q);
                const pair = [p.mesh, q.mesh].sort().join(" ~ ") + label;
                if (ov > (found.get(pair) ?? 0)) found.set(pair, ov);
            }
        }
    }
    return found;
}

const FOOTPRINT = { minX: -54.86, maxX: 54.86, minZ: -48.77, maxZ: 0 };

/** The field surface as the scene draws it: its height and ground layer. */
function fieldPlane(): Mesh {
    const f = FOOTPRINT;
    const mesh = new Mesh(
        new PlaneGeometry(f.maxX - f.minX, f.maxZ - f.minZ),
        setGroundLayer(new MeshBasicMaterial(), GROUND_LAYER.field),
    );
    mesh.name = "fieldSurface";
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(
        (f.minX + f.maxX) / 2,
        FIELD_SURFACE_Y,
        (f.minZ + f.maxZ) / 2,
    );
    mesh.updateMatrixWorld();
    return mesh;
}

type KitId = keyof typeof KIT_BUILDERS;

/** Flush pairs over `MAX_OVERLAP` in a venue with its field surface. */
function fights(id: KitId, quality: "high" | "low"): string[] {
    const kit = KIT_BUILDERS[id]({
        footprint: FOOTPRINT,
        params: { ...DEFAULT_VENUE_PARAMS },
        quality,
    });
    const env = createEnvironment();
    const scene = new Scene();
    scene.add(kit.root);
    scene.add(fieldPlane());
    if (quality === "high" && kit.surroundings !== false) scene.add(env.root);
    const found = [...flushPairs(collect(scene))]
        .filter(([, area]) => area > MAX_OVERLAP)
        .map(([pair, area]) => `${pair}: ${area.toFixed(1)} m²`);
    kit.dispose();
    env.dispose();
    return found;
}

describe("stadium surfaces", () => {
    for (const id of ["hs", "bighs", "college", "pro"] as const) {
        for (const quality of ["high", "low"] as const) {
            it(`${id} (${quality}) has no flush surfaces that fight`, () => {
                expect(fights(id, quality)).toEqual([]);
            });
        }
    }
});

describe("field surface", () => {
    for (const id of Object.keys(KIT_BUILDERS) as KitId[]) {
        for (const quality of ["high", "low"] as const) {
            it(`${id} (${quality}): nothing fights the field`, () => {
                expect(
                    fights(id, quality).filter((f) =>
                        f.includes("fieldSurface"),
                    ),
                ).toEqual([]);
            });
        }
    }
});
