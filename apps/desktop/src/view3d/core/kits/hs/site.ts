// cspell:ignore metalness
import {
    BufferGeometry,
    Color,
    ConeGeometry,
    CylinderGeometry,
    Float32BufferAttribute,
    IcosahedronGeometry,
    InstancedMesh,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    PlaneGeometry,
    Quaternion,
    Vector3,
    type Material,
    type Object3D,
} from "three";
import {
    createRng,
    GROUND_LAYER,
    setFlushBacking,
    setGroundLayer,
    type SharedMaterials,
} from "../../environment";
import type { LightingPreset, VenueParams } from "../../types";
import type { Frame } from "../stands";
import { BoxBatch, mergeGeometries, QuadBuilder } from "./geometry";
import {
    BUILDING_BAND_HEIGHT,
    BUILDING_BRICK_UV,
    BUILDING_FACADE_BAND,
    BUILDING_TILE,
    buildingTextures,
    LOT_AISLE,
    LOT_TILE_D,
    LOT_TILE_W,
    lotTexture,
    muted,
    ROOF_FLAT_BAND,
    ROOF_METAL_BAND,
    ROOF_TILE,
    roofTexture,
    scoreboardTexture,
    siteNightTexture,
    siteTexture,
    STALL_D,
    STALL_W,
    type SiteRect,
} from "./textures";
import {
    buildFence,
    buildGoalPosts,
    TRACK_INNER_GAP,
    type Built,
} from "./track";

/**
 * The world around a high school stadium: painted ground, parking, trees, the
 * school, field house and concession stand, the scoreboard and the fence.
 * Everything is laid out from the field center so it follows the footprint.
 *
 * `quality: "low"` keeps the painted ground (with lots and tree canopies drawn
 * into it) and a few plain building boxes, and drops everything else.
 */

/** A rectangle relative to the field center: offsets and size, meters. */
export interface Rel {
    dx: number;
    dz: number;
    w: number;
    d: number;
}

export interface BuildingSpec extends Rel {
    h: number;
    /** Wall tint, multiplied into the brick. */
    tint?: number;
    /** Muted team color on the parapet. */
    trim?: boolean;
    /** A pitched metal roof, ridge along the long side. */
    gable?: boolean;
    /** Serving window with an awning on this face (+z or -z). */
    awning?: 1 | -1;
    /** A flat canopy on columns over the door on this face (+z or -z). */
    canopy?: 1 | -1;
}

export interface SiteLayout {
    /** Side of the painted square around the field center. */
    size: number;
    grass: string;
    lots: Rel[];
    /** Cars parked on the mown grass. */
    grassLots: Rel[];
    pads: Rel[];
    fields: Rel[];
    bandLots: Rel[];
    courts: Rel[];
    ponds: Rel[];
    walks: { points: [number, number][]; width: number }[];
    roads: { points: [number, number][]; width: number }[];
    diamonds: { dx: number; dz: number; angle: number }[];
    buildings: BuildingSpec[];
    /** Where trees may not grow (besides lots, pads, fields and buildings). */
    clear: Rel[];
    trees: { ring: number; clusters: number; perCluster: number };
    scoreboard?: {
        dx: number;
        dz: number;
        yaw: number;
        w: number;
        bottom: number;
    };
    flagpole?: { dx: number; dz: number };
    buses?: { dx: number; dz: number; count: number };
    /** Rows of wall and post lamps: x range and z offset from the center. */
    lampRows?: { dx0: number; dx1: number; dz: number; h: number; n: number }[];
    /** Soft lit ground at night, with strength 0..1. */
    washes: (Rel & { k: number })[];
    /** Planted rows along the walks, x range and z offset from the center. */
    treeRows?: { dx0: number; dx1: number; dz: number; n: number }[];
    /** Fraction of parking stalls with a car. */
    cars: number;
    seed: number;
}

const SITE_Y = -0.03;
const LOT_Y = -0.015;
const LOT_MARGIN = 1.5;
/** Every Nth stall pair is a landscaped island. */
const ISLAND_EVERY = 14;

/** Half sizes of the football field the layouts are drawn around. */
const REF_HALF_W = 54.86;
const REF_HALF_D = 24.38;

/**
 * Moves a layout offset with the field's edges: offsets past the reference
 * field's edge keep their distance from the real edge, offsets inside it
 * scale with the field.
 */
function follow(v: number, half: number, ref: number): number {
    return Math.abs(v) > ref
        ? v + Math.sign(v) * (half - ref)
        : (v * half) / ref;
}

function inside(x: number, z: number, r: SiteRect, margin: number): boolean {
    return (
        Math.abs(x - r.x) < r.w / 2 + margin &&
        Math.abs(z - r.z) < r.d / 2 + margin
    );
}

interface Stall {
    x: number;
    z: number;
    row: 0 | 1;
}

/** Stall centers of a lot, leaving out the landscaped islands. */
export function stallCenters(lot: SiteRect): Stall[] {
    const out: Stall[] = [];
    const x0 = lot.x - lot.w / 2 + LOT_MARGIN;
    const z0 = lot.z - lot.d / 2 + LOT_MARGIN;
    const w = lot.w - 2 * LOT_MARGIN;
    const d = lot.d - 2 * LOT_MARGIN;
    const nx = Math.floor(w / STALL_W);
    for (let zs = z0; zs + LOT_TILE_D <= z0 + d; zs += LOT_TILE_D) {
        for (let i = 0; i < nx; i++) {
            if (i % ISLAND_EVERY === 0 || i === nx - 1) continue;
            const x = x0 + STALL_W * (i + 0.5);
            out.push({ x, z: zs + LOT_AISLE + STALL_D / 2, row: 0 });
            out.push({ x, z: zs + LOT_AISLE + STALL_D * 1.5, row: 1 });
        }
    }
    return out;
}

/** Island centers of a lot: planted strips between the rows of stalls. */
function islands(lot: SiteRect): { x: number; z: number }[] {
    const out: { x: number; z: number }[] = [];
    const x0 = lot.x - lot.w / 2 + LOT_MARGIN;
    const z0 = lot.z - lot.d / 2 + LOT_MARGIN;
    const w = lot.w - 2 * LOT_MARGIN;
    const d = lot.d - 2 * LOT_MARGIN;
    const nx = Math.floor(w / STALL_W);
    for (let zs = z0; zs + LOT_TILE_D <= z0 + d; zs += LOT_TILE_D) {
        for (let i = 0; i < nx; i += ISLAND_EVERY) {
            out.push({
                x: x0 + STALL_W * (i + 0.5),
                z: zs + LOT_AISLE + STALL_D,
            });
        }
    }
    return out;
}

interface TreeGeometries {
    leafy: BufferGeometry;
    conifer: BufferGeometry;
}

function treeGeometries(): TreeGeometries {
    const trunk = () => new CylinderGeometry(0.18, 0.28, 3, 5);
    const at = (x: number, y: number, z: number, s = 1) =>
        new Matrix4().compose(
            new Vector3(x, y, z),
            new Quaternion(),
            new Vector3(s, s, s),
        );
    const trunkTint = 0x6e5c4a;
    /** A rumpled, smooth-shaded ball, darker underneath. */
    const crown = (detail: number, seed: number) => {
        const g = new IcosahedronGeometry(1, detail);
        const p = g.getAttribute("position");
        const color = new Float32Array(p.count * 3);
        const n = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i);
            const y = p.getY(i);
            const z = p.getZ(i);
            const bump =
                1 +
                0.12 * Math.sin(x * 5 + seed) * Math.cos(z * 4 + seed) +
                0.08 * Math.sin(y * 6 + seed * 2);
            p.setXYZ(i, x * bump, y * bump, z * bump);
            n[i * 3] = x;
            n[i * 3 + 1] = y;
            n[i * 3 + 2] = z;
            const light = 0.62 + 0.42 * (y * 0.5 + 0.5);
            color[i * 3] = color[i * 3 + 1] = color[i * 3 + 2] = light;
        }
        g.setAttribute("normal", new Float32BufferAttribute(n, 3));
        g.setAttribute("color", new Float32BufferAttribute(color, 3));
        return g;
    };
    const leafy = mergeGeometries(
        [
            { geometry: trunk(), matrix: at(0, 1.5, 0), tint: trunkTint },
            {
                geometry: crown(1, 1),
                matrix: new Matrix4().compose(
                    new Vector3(0, 4.7, 0),
                    new Quaternion(),
                    new Vector3(2.7, 2.9, 2.7),
                ),
            },
            { geometry: crown(0, 2), matrix: at(1, 6, 0.5, 1.6) },
        ],
        true,
    );
    const conifer = mergeGeometries(
        [
            { geometry: trunk(), matrix: at(0, 1.2, 0), tint: trunkTint },
            { geometry: new ConeGeometry(2.3, 5.5, 7), matrix: at(0, 4.5, 0) },
            { geometry: new ConeGeometry(1.7, 4.5, 7), matrix: at(0, 7.2, 0) },
        ],
        true,
    );
    return { leafy, conifer };
}

/** A car with a sloped hood and cabin; windows are near-black vertex color. */
function carGeometry(): BufferGeometry {
    const q = new QuadBuilder();
    const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
    const paint: [number, number, number] = [1, 1, 1];
    const glass: [number, number, number] = [0.08, 0.1, 0.13];
    const uv: [number, number] = [0, 0];
    const quad = (
        a: Vector3,
        b: Vector3,
        c: Vector3,
        d: Vector3,
        color: [number, number, number],
    ) => {
        const out = a.clone().add(b).add(c).add(d).multiplyScalar(0.25);
        out.y -= 0.7;
        q.quad(a, b, c, d, uv, uv, uv, uv, color, out);
    };
    const w = 0.9;
    const low = 0.42;
    const belt = 0.95;
    // the body: top and four sides
    quad(
        v(-w, belt, -2.25),
        v(w, belt, -2.25),
        v(w, belt, 2.25),
        v(-w, belt, 2.25),
        paint,
    );
    quad(
        v(-w, low, 2.25),
        v(w, low, 2.25),
        v(w, belt, 2.25),
        v(-w, belt, 2.25),
        paint,
    );
    quad(
        v(w, low, -2.25),
        v(-w, low, -2.25),
        v(-w, belt, -2.25),
        v(w, belt, -2.25),
        paint,
    );
    quad(
        v(w, low, 2.25),
        v(w, low, -2.25),
        v(w, belt, -2.25),
        v(w, belt, 2.25),
        paint,
    );
    quad(
        v(-w, low, -2.25),
        v(-w, low, 2.25),
        v(-w, belt, 2.25),
        v(-w, belt, -2.25),
        paint,
    );
    // the cabin, narrower at the roof, with windows all round
    const t = w * 0.74;
    const roof = 1.42;
    const z0 = -1.25;
    const z1 = 0.75;
    quad(
        v(-t, roof, z0 + 0.3),
        v(t, roof, z0 + 0.3),
        v(t, roof, z1 - 0.3),
        v(-t, roof, z1 - 0.3),
        paint,
    );
    quad(
        v(-w, belt, z1),
        v(w, belt, z1),
        v(t, roof, z1 - 0.3),
        v(-t, roof, z1 - 0.3),
        glass,
    );
    quad(
        v(w, belt, z0),
        v(-w, belt, z0),
        v(-t, roof, z0 + 0.3),
        v(t, roof, z0 + 0.3),
        glass,
    );
    quad(
        v(w, belt, z1),
        v(w, belt, z0),
        v(t, roof, z0 + 0.3),
        v(t, roof, z1 - 0.3),
        glass,
    );
    quad(
        v(-w, belt, z0),
        v(-w, belt, z1),
        v(-t, roof, z1 - 0.3),
        v(-t, roof, z0 + 0.3),
        glass,
    );
    return q.build(true);
}

const LEAF_COLORS = [0x4e6c30, 0x40602b, 0x5a763b, 0x486630, 0x3a562c];
const FALL_COLORS = [0xbc7a32, 0xcda03e, 0xa44c2d];
const CAR_COLORS = [
    0xe6e6e6, 0xb5b9bf, 0x1e2024, 0x5a6068, 0x2a3a5e, 0x852225, 0x622a30,
    0xd2ccbe, 0x34493c,
];

export interface SiteOutput extends Built {
    setLighting(preset: LightingPreset): void;
}

/** Window and ground glow per lighting preset. */
export function glowFor(preset: LightingPreset): number {
    return preset === "night" ? 1 : preset === "dusk" ? 0.7 : 0;
}

/**
 * Builds the site. `props` is the kit's tinted box batch, drawn after this
 * returns, so everything here that is only boxes costs no draw calls.
 */
export function buildSite(
    frame: Frame,
    layout: SiteLayout,
    params: VenueParams,
    shared: SharedMaterials,
    quality: "low" | "high",
    props: BoxBatch,
): SiteOutput {
    const { cx, cz } = frame;
    const high = quality === "high";
    const objects: Object3D[] = [];
    const owned: { dispose(): void }[] = [];
    const rnd = createRng(layout.seed);
    const X = (dx: number) => cx + follow(dx, frame.halfW, REF_HALF_W);
    const Z = (dz: number) => cz + follow(dz, frame.halfD, REF_HALF_D);
    const A = (r: Rel): SiteRect => ({
        x: X(r.dx),
        z: Z(r.dz),
        w: r.w,
        d: r.d,
    });
    const lots = layout.lots.map(A);
    const grassLots = layout.grassLots.map(A);
    const pads = layout.pads.map(A);
    const fields = layout.fields.map(A);
    const bandLots = layout.bandLots.map(A);
    const courts = layout.courts.map(A);
    const ponds = layout.ponds.map(A);
    const buildings = layout.buildings.map((b) => ({ ...b, rect: A(b) }));
    const walks = layout.walks.map((w) => ({
        width: w.width,
        points: w.points.map(([x, z]) => [X(x), Z(z)] as [number, number]),
    }));
    // Roads run edge to edge of the painted square, so they ignore the field.
    const roads = layout.roads.map((r) => ({
        width: r.width,
        points: r.points.map(([x, z]) => [cx + x, cz + z] as [number, number]),
    }));
    const trackR = frame.halfD + TRACK_INNER_GAP;
    const straight = Math.max(frame.halfW - 9.14, 9.14);

    // --- Trees.
    const ring = layout.size * 0.44;
    const treeSpots: { x: number; z: number; conifer: boolean; s: number }[] =
        [];
    const blocked: SiteRect[] = [
        ...lots,
        ...grassLots,
        ...pads,
        ...fields,
        ...bandLots,
        ...courts,
        ...ponds,
        ...buildings.map((b) => b.rect),
        ...layout.clear.map(A),
    ];
    const free = (x: number, z: number) =>
        !blocked.some((r) => inside(x, z, r, 4));
    const ringCount = high
        ? layout.trees.ring
        : Math.round(layout.trees.ring / 3);
    for (let i = 0; i < ringCount; i++) {
        const t = (i + rnd() * 0.8) / ringCount;
        const side = Math.floor(t * 4);
        const u = (t * 4 - side) * 2 - 1;
        const jitter = (rnd() - 0.5) * 30;
        const clump = (i - (i % 4)) / ringCount;
        const cu = ((clump * 4 - Math.floor(clump * 4)) * 2 - 1) * 0.97;
        const j = u - (u - cu) * 0.55;
        const x =
            side % 2 === 0 ? j * ring : (side === 1 ? 1 : -1) * (ring + jitter);
        const z =
            side % 2 === 0 ? (side === 0 ? -1 : 1) * (ring + jitter) : j * ring;
        if (free(cx + x, cz + z)) {
            treeSpots.push({
                x: cx + x,
                z: cz + z,
                conifer: rnd() < 0.25,
                s: 0.85 + rnd() * 0.6,
            });
        }
    }
    const clusters = high
        ? layout.trees.clusters
        : Math.round(layout.trees.clusters / 3);
    for (let c = 0; c < clusters; c++) {
        const ax = cx + (rnd() - 0.5) * layout.size * 0.85;
        const az = cz + (rnd() - 0.5) * layout.size * 0.85;
        const conifer = rnd() < 0.3;
        for (let k = 0; k < layout.trees.perCluster; k++) {
            const x = ax + (rnd() - 0.5) * 28;
            const z = az + (rnd() - 0.5) * 28;
            if (free(x, z)) {
                treeSpots.push({ x, z, conifer, s: 0.8 + rnd() * 0.5 });
            }
        }
    }
    for (const row of layout.treeRows ?? []) {
        for (let i = 0; i < row.n; i++) {
            const t = row.n > 1 ? i / (row.n - 1) : 0.5;
            treeSpots.push({
                x: X(row.dx0 + (row.dx1 - row.dx0) * t),
                z: Z(row.dz),
                conifer: false,
                s: 0.55 + rnd() * 0.15,
            });
        }
    }
    for (const lot of lots) {
        for (const isle of islands(lot)) {
            treeSpots.push({
                x: isle.x,
                z: isle.z,
                conifer: false,
                s: 0.65 + rnd() * 0.25,
            });
        }
    }

    // --- Lamps, in the lots and along the walks.
    const lamps: { x: number; z: number; h: number; twin: boolean }[] = [];
    for (const lot of lots) {
        const z0 = lot.z - lot.d / 2 + LOT_MARGIN;
        const x0 = lot.x - lot.w / 2 + LOT_MARGIN;
        const nx = Math.floor((lot.w - 2 * LOT_MARGIN) / STALL_W);
        for (
            let zs = z0;
            zs + LOT_TILE_D <= z0 + lot.d - 2 * LOT_MARGIN;
            zs += LOT_TILE_D * 2
        ) {
            for (let i = ISLAND_EVERY; i < nx; i += ISLAND_EVERY * 2) {
                lamps.push({
                    x: x0 + STALL_W * (i + 0.5),
                    z: zs + LOT_AISLE + STALL_D,
                    h: 11,
                    twin: true,
                });
            }
        }
    }
    for (const w of walks) {
        for (let i = 0; i + 1 < w.points.length; i++) {
            const [ax, az] = w.points[i];
            const [bx, bz] = w.points[i + 1];
            const len = Math.hypot(bx - ax, bz - az);
            const n = Math.max(1, Math.floor(len / 26));
            for (let k = 0; k < n; k++) {
                const t = (k + 0.5) / n;
                lamps.push({
                    x: ax + (bx - ax) * t + 2.4,
                    z: az + (bz - az) * t,
                    h: 4.2,
                    twin: false,
                });
            }
        }
    }

    for (const row of layout.lampRows ?? []) {
        for (let i = 0; i < row.n; i++) {
            const t = row.n > 1 ? i / (row.n - 1) : 0.5;
            lamps.push({
                x: X(row.dx0 + (row.dx1 - row.dx0) * t),
                z: Z(row.dz),
                h: row.h,
                twin: false,
            });
        }
    }

    // --- Painted ground and its night glow.
    const footprints = [
        ...buildings.map((b) => ({ ...b.rect, h: b.h })),
        ...(layout.buses
            ? [
                  {
                      x: X(layout.buses.dx) + 8,
                      z: Z(layout.buses.dz),
                      w: 24,
                      d: 18,
                      h: 2,
                  },
              ]
            : []),
    ];
    const siteMap = siteTexture({
        cx,
        cz,
        size: layout.size,
        px: high ? 2048 : 1024,
        grass: layout.grass,
        lots,
        paintLots: !high,
        grassLots,
        pads,
        walks,
        roads,
        fields,
        bandLots,
        courts,
        ponds,
        diamonds: layout.diamonds.map((d) => ({
            x: X(d.dx),
            z: Z(d.dz),
            angle: d.angle,
        })),
        footprints,
        treeShade: treeSpots
            .filter((_, i) => i % 2 === 0)
            .map((t) => ({ x: t.x, z: t.z, r: 11 })),
        paintedTrees: high
            ? []
            : treeSpots.map((t) => ({ x: t.x, z: t.z, r: 4.2 * t.s })),
        infield: { cx, cz, straight, r: trackR },
        seed: layout.seed,
    });
    const nightMap = siteNightTexture({
        cx,
        cz,
        size: layout.size,
        px: high ? 1024 : 512,
        pools: [
            ...lamps.map((l) => ({
                x: l.x,
                z: l.z,
                r: l.twin ? 26 : 9,
                k: l.twin ? 0.3 : 0.28,
            })),
            ...buildings
                .filter((b) => b.canopy || b.awning)
                .map((b) => ({
                    x: b.rect.x,
                    z: b.rect.z + ((b.canopy ?? b.awning ?? 1) * b.rect.d) / 2,
                    r: 20,
                    k: 0.6,
                })),
        ],
        washes: layout.washes.map((w) => ({ ...A(w), k: w.k })),
    });
    nightMap.channel = 1;
    const siteMat = new MeshStandardMaterial({
        map: siteMap,
        roughness: 1,
        transparent: true,
        emissive: 0xffffff,
        emissiveMap: nightMap,
        emissiveIntensity: 0,
    });
    setGroundLayer(siteMat, GROUND_LAYER.site);
    const siteGeo = new PlaneGeometry(layout.size, layout.size);
    siteGeo.setAttribute("uv1", siteGeo.getAttribute("uv").clone());
    const site = new Mesh(siteGeo, siteMat);
    site.name = "site";
    site.rotation.x = -Math.PI / 2;
    site.position.set(cx, SITE_Y, cz);
    site.receiveShadow = high;
    site.userData.ground = true;
    // Blends first among the transparent pieces, so the fence stays over it.
    site.renderOrder = -1;
    objects.push(site);
    owned.push(siteMap, nightMap, siteMat, siteGeo);

    const glowMats: { mat: MeshStandardMaterial; k: number }[] = [
        { mat: siteMat, k: 1 },
    ];
    const team = mutedHex(params.homeColor);

    let lampMat: Material | undefined;
    let lampMesh: Mesh | undefined;
    let carMat: MeshStandardMaterial | undefined;

    if (high) {
        buildCampus();
    } else {
        for (const b of buildings) {
            props.add(
                [b.rect.x, b.h / 2, b.rect.z],
                [b.rect.w, b.h, b.rect.d],
                [0, 0, 0],
                b.tint ?? 0x9c7763,
            );
        }
    }

    function buildCampus() {
        // Lots: tiled asphalt and stalls, no overlaps so nothing can flicker.
        if (lots.length) {
            const lq = new QuadBuilder();
            for (const lot of lots) addLot(lq, lot);
            const geo = lq.build();
            addNightUv(geo, cx, cz, layout.size);
            const map = lotTexture();
            const mat = new MeshStandardMaterial({
                map,
                roughness: 0.95,
                emissive: 0xffffff,
                emissiveMap: nightMap,
                emissiveIntensity: 0,
            });
            setGroundLayer(mat, GROUND_LAYER.lots);
            const mesh = new Mesh(geo, mat);
            mesh.name = "lots";
            mesh.receiveShadow = true;
            objects.push(mesh);
            owned.push(geo, map, mat);
            glowMats.push({ mat, k: 1 });
            for (const lot of lots) {
                for (const isle of islands(lot)) {
                    props.add(
                        [isle.x, 0.07, isle.z],
                        [STALL_W, 0.16, STALL_D * 2],
                        [0, 0, 0],
                        0x44663a,
                    );
                }
                const curb = 0.25;
                const hw = lot.w / 2;
                const hd = lot.d / 2;
                for (const s of [-1, 1]) {
                    props.add(
                        [lot.x, 0.08, lot.z + s * hd],
                        [lot.w + curb, 0.2, curb],
                        [0, 0, 0],
                        0x9e9b94,
                    );
                    props.add(
                        [lot.x + s * hw, 0.08, lot.z],
                        [curb, 0.2, lot.d],
                        [0, 0, 0],
                        0x9e9b94,
                    );
                }
            }
        }

        // Trees.
        const geos = treeGeometries();
        const treeMat = new MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.95,
            emissive: 0x161e12,
            emissiveIntensity: 0,
        });
        glowMats.push({ mat: treeMat, k: 1 });
        owned.push(geos.leafy, geos.conifer, treeMat);
        for (const conifer of [false, true]) {
            const spots = treeSpots.filter((t) => t.conifer === conifer);
            if (!spots.length) continue;
            const mesh = new InstancedMesh(
                conifer ? geos.conifer : geos.leafy,
                treeMat,
                spots.length,
            );
            mesh.name = conifer ? "conifers" : "trees";
            const m = new Matrix4();
            const q = new Quaternion();
            const up = new Vector3(0, 1, 0);
            spots.forEach((t, i) => {
                q.setFromAxisAngle(up, rnd() * Math.PI * 2);
                const s = t.s * (conifer ? 1.6 : 2.3);
                m.compose(
                    new Vector3(t.x, SITE_Y, t.z),
                    q,
                    new Vector3(s, s * (0.9 + rnd() * 0.3), s),
                );
                mesh.setMatrixAt(i, m);
                const colors = conifer
                    ? [0x2d4a2e, 0x34523a, 0x2a4328]
                    : rnd() < 0.14
                      ? FALL_COLORS
                      : LEAF_COLORS;
                mesh.setColorAt(
                    i,
                    new Color(colors[Math.floor(rnd() * colors.length)]),
                );
            });
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            mesh.computeBoundingSphere();
            objects.push(mesh);
            owned.push(mesh);
        }

        buildBuildings();
        buildCars();

        // Lamp posts in the props batch, lit heads in their own unlit batch.
        const lampHeads = new BoxBatch();
        for (const l of lamps) {
            props.add(
                [l.x, l.h / 2, l.z],
                [0.2, l.h, 0.2],
                [0, 0, 0],
                0x5a5d62,
            );
            for (const sx of l.twin ? [-1, 1] : [1]) {
                lampHeads.add([l.x + sx * 0.7, l.h, l.z], [0.9, 0.16, 0.42]);
            }
        }
        for (const b of buildings) {
            if (!b.canopy) continue;
            lampHeads.add(
                [
                    b.rect.x,
                    b.h * 0.55,
                    b.rect.z + (b.canopy * b.rect.d) / 2 + b.canopy * 2.4,
                ],
                [6, 0.08, 0.4],
            );
        }
        if (lampHeads.size) {
            lampMat = new MeshBasicMaterial({ color: 0xffefce });
            const mesh = lampHeads.build(shared.unitBox, lampMat, "siteLamps");
            mesh.visible = false;
            lampMesh = mesh;
            objects.push(mesh);
            owned.push(mesh, lampMat);
        }
    }

    function addLot(q: QuadBuilder, lot: SiteRect) {
        const up = new Vector3(0, 1, 0);
        const x0 = lot.x - lot.w / 2 + LOT_MARGIN;
        const x1 = lot.x + lot.w / 2 - LOT_MARGIN;
        const z0 = lot.z - lot.d / 2 + LOT_MARGIN;
        const z1 = lot.z + lot.d / 2 - LOT_MARGIN;
        const v = (x: number, z: number) => new Vector3(x, LOT_Y, z);
        // The aisle band of the tile is plain asphalt.
        const plainV = 1 - LOT_AISLE / 2 / LOT_TILE_D;
        const plain = (a: number, b: number, c: number, d: number) => {
            const u0 = (a - x0) / LOT_TILE_W;
            const u1 = (b - x0) / LOT_TILE_W;
            q.quad(
                v(a, c),
                v(b, c),
                v(b, d),
                v(a, d),
                [u0, plainV],
                [u1, plainV],
                [u1, plainV],
                [u0, plainV],
                undefined,
                up,
            );
        };
        plain(x0 - LOT_MARGIN, x0, z0 - LOT_MARGIN, z1 + LOT_MARGIN);
        plain(x1, x1 + LOT_MARGIN, z0 - LOT_MARGIN, z1 + LOT_MARGIN);
        plain(x0, x1, z0 - LOT_MARGIN, z0);
        const u1 = (x1 - x0) / LOT_TILE_W;
        let zs = z0;
        for (; zs + LOT_TILE_D <= z1; zs += LOT_TILE_D) {
            plain(x0, x1, zs, zs + LOT_AISLE);
            const vTop = 1 - LOT_AISLE / LOT_TILE_D;
            q.quad(
                v(x0, zs + LOT_AISLE),
                v(x1, zs + LOT_AISLE),
                v(x1, zs + LOT_TILE_D),
                v(x0, zs + LOT_TILE_D),
                [0, vTop],
                [u1, vTop],
                [u1, 0],
                [0, 0],
                undefined,
                up,
            );
        }
        plain(x0, x1, zs, z1 + LOT_MARGIN);
    }

    function buildBuildings() {
        const walls = new QuadBuilder();
        const roofs = new QuadBuilder();
        const up = new Vector3(0, 1, 0);
        const color = (hex: number): [number, number, number] => {
            const c = new Color(hex);
            return [c.r, c.g, c.b];
        };
        for (const b of buildings) {
            const r = b.rect;
            const tint = color(b.tint ?? 0xffffff);
            walls.box(
                new Vector3(r.x - r.w / 2, 0, r.z - r.d / 2),
                new Vector3(r.x + r.w / 2, b.h, r.z + r.d / 2),
                BUILDING_TILE,
                BUILDING_FACADE_BAND,
                BUILDING_BRICK_UV,
                BUILDING_BAND_HEIGHT,
                tint,
            );
            const x0 = r.x - r.w / 2;
            const x1 = r.x + r.w / 2;
            const z0 = r.z - r.d / 2;
            const z1 = r.z + r.d / 2;
            const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
            if (b.gable) {
                const alongX = r.w >= r.d;
                const rise = Math.min(r.w, r.d) * 0.16;
                const top = b.h + rise;
                const [band0, band1] = ROOF_METAL_BAND;
                const uLong = (alongX ? r.w : r.d) / ROOF_TILE;
                const eave = 0.4;
                const slope = (
                    a: Vector3,
                    bb: Vector3,
                    c: Vector3,
                    d: Vector3,
                    want: Vector3,
                ) =>
                    roofs.quad(
                        a,
                        bb,
                        c,
                        d,
                        [0, band0],
                        [uLong, band0],
                        [uLong, band1],
                        [0, band1],
                        undefined,
                        want,
                    );
                if (alongX) {
                    const zm = r.z;
                    slope(
                        v(x0 - eave, b.h, z0 - eave),
                        v(x1 + eave, b.h, z0 - eave),
                        v(x1 + eave, top, zm),
                        v(x0 - eave, top, zm),
                        v(0, 1, -0.4),
                    );
                    slope(
                        v(x1 + eave, b.h, z1 + eave),
                        v(x0 - eave, b.h, z1 + eave),
                        v(x0 - eave, top, zm),
                        v(x1 + eave, top, zm),
                        v(0, 1, 0.4),
                    );
                    for (const [x, sx] of [
                        [x0, -1],
                        [x1, 1],
                    ] as const) {
                        tri(
                            walls,
                            v(x, b.h, z0),
                            v(x, b.h, z1),
                            v(x, top, zm),
                            v(sx, 0, 0),
                            tint,
                        );
                    }
                } else {
                    const xm = r.x;
                    slope(
                        v(x0 - eave, b.h, z1 + eave),
                        v(x0 - eave, b.h, z0 - eave),
                        v(xm, top, z0 - eave),
                        v(xm, top, z1 + eave),
                        v(-0.4, 1, 0),
                    );
                    slope(
                        v(x1 + eave, b.h, z0 - eave),
                        v(x1 + eave, b.h, z1 + eave),
                        v(xm, top, z1 + eave),
                        v(xm, top, z0 - eave),
                        v(0.4, 1, 0),
                    );
                    for (const [z, sz] of [
                        [z0, -1],
                        [z1, 1],
                    ] as const) {
                        tri(
                            walls,
                            v(x0, b.h, z),
                            v(x1, b.h, z),
                            v(xm, top, z),
                            v(0, 0, sz),
                            tint,
                        );
                    }
                }
            } else {
                const u = r.w / ROOF_TILE;
                roofs.quad(
                    v(x0, b.h + 0.05, z1),
                    v(x1, b.h + 0.05, z1),
                    v(x1, b.h + 0.05, z0),
                    v(x0, b.h + 0.05, z0),
                    [0, ROOF_FLAT_BAND[0]],
                    [u, ROOF_FLAT_BAND[0]],
                    [u, ROOF_FLAT_BAND[1]],
                    [0, ROOF_FLAT_BAND[1]],
                    undefined,
                    up,
                );
                const cap = b.trim ? team : 0xb9b2a2;
                for (const sz of [-1, 1]) {
                    props.add(
                        [r.x, b.h + 0.25, r.z + (sz * r.d) / 2],
                        [r.w + 0.4, 0.55, 0.45],
                        [0, 0, 0],
                        cap,
                    );
                    props.add(
                        [r.x + (sz * r.w) / 2, b.h + 0.25, r.z],
                        [0.45, 0.55, r.d],
                        [0, 0, 0],
                        cap,
                    );
                }
                const units = Math.max(1, Math.floor((r.w * r.d) / 700));
                for (let k = 0; k < units; k++) {
                    props.add(
                        [
                            r.x + (rnd() - 0.5) * r.w * 0.7,
                            b.h + 0.85,
                            r.z + (rnd() - 0.5) * r.d * 0.6,
                        ],
                        [2.6, 1.4, 1.7],
                        [0, 0, 0],
                        0x9a9da2,
                    );
                }
            }
            if (b.awning) {
                const z = r.z + (b.awning * r.d) / 2;
                props.add(
                    [r.x, b.h * 0.72, z + b.awning * 0.9],
                    [r.w * 0.8, 0.18, 1.8],
                    [b.awning * 0.25, 0, 0],
                    team,
                );
                props.add(
                    [r.x, b.h * 0.42, z + b.awning * 0.03],
                    [r.w * 0.7, b.h * 0.32, 0.06],
                    [0, 0, 0],
                    0x23262b,
                );
            }
            if (b.canopy) {
                const z = r.z + (b.canopy * r.d) / 2;
                const dir = b.canopy;
                props.add(
                    [r.x, b.h * 0.62, z + dir * 2.4],
                    [14, 0.3, 4.8],
                    [0, 0, 0],
                    0xb5b2ab,
                );
                for (const sx of [-1, 1]) {
                    props.add(
                        [r.x + sx * 6.4, (b.h * 0.62) / 2, z + dir * 4.5],
                        [0.3, b.h * 0.62, 0.3],
                        [0, 0, 0],
                        0x6d6f74,
                    );
                }
            }
        }
        const tex = buildingTextures();
        const geo = walls.build(true);
        const mat = new MeshStandardMaterial({
            map: tex.map,
            vertexColors: true,
            emissive: 0xffffff,
            emissiveMap: tex.emissive,
            emissiveIntensity: 0,
            roughness: 0.9,
        });
        // Behind the roofs, which sit a few centimeters above the walls' tops.
        setFlushBacking(mat);
        const mesh = new Mesh(geo, mat);
        mesh.name = "buildings";
        mesh.castShadow = mesh.receiveShadow = true;
        objects.push(mesh);
        owned.push(tex.map, tex.emissive, geo, mat);
        glowMats.push({ mat, k: 1 });

        const roofMap = roofTexture();
        const roofGeo = roofs.build();
        const roofMat = new MeshStandardMaterial({
            map: roofMap,
            roughness: 0.82,
            metalness: 0.15,
            emissive: 0x24262c,
            emissiveIntensity: 0,
        });
        glowMats.push({ mat: roofMat, k: 1 });
        const roofMesh = new Mesh(roofGeo, roofMat);
        roofMesh.name = "roofs";
        roofMesh.castShadow = roofMesh.receiveShadow = true;
        objects.push(roofMesh);
        owned.push(roofMap, roofGeo, roofMat);
    }

    function buildCars() {
        const stalls = [
            ...lots.flatMap((l) => stallCenters(l)),
            ...grassLots.flatMap((l) =>
                stallCenters(l).map((s) => ({
                    ...s,
                    x: s.x + (rnd() - 0.5) * 0.8,
                    z: s.z + (rnd() - 0.5) * 0.8,
                })),
            ),
        ].filter(() => rnd() < layout.cars);
        if (!stalls.length) return;
        const geo = carGeometry();
        carMat = new MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.38,
            metalness: 0.45,
            emissive: 0x2a2f36,
            emissiveIntensity: 0,
        });
        const cars = new InstancedMesh(geo, carMat, stalls.length);
        cars.name = "cars";
        const m = new Matrix4();
        const q = new Quaternion();
        const up = new Vector3(0, 1, 0);
        stalls.forEach((c, i) => {
            q.setFromAxisAngle(
                up,
                (c.row ? Math.PI : 0) + (rnd() - 0.5) * 0.14,
            );
            m.compose(new Vector3(c.x, 0, c.z), q, new Vector3(1, 1, 1));
            cars.setMatrixAt(i, m);
            cars.setColorAt(
                i,
                new Color(CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)]),
            );
        });
        cars.instanceMatrix.needsUpdate = true;
        if (cars.instanceColor) cars.instanceColor.needsUpdate = true;
        cars.computeBoundingSphere();
        objects.push(cars);
        owned.push(geo, carMat, cars);
        glowMats.push({ mat: carMat, k: 1 });

        if (layout.buses) {
            const bx = X(layout.buses.dx);
            const bz = Z(layout.buses.dz);
            for (let i = 0; i < layout.buses.count; i++) {
                const x = bx + i * 3.6;
                props.add([x, 1.5, bz], [2.5, 2.1, 11], [0, 0, 0], 0xd0a12a);
                props.add([x, 2.7, bz], [2.3, 0.2, 10.6], [0, 0, 0], 0xe8e6e0);
                for (const sx of [-1, 1]) {
                    props.add(
                        [x + sx * 1.26, 1.9, bz],
                        [0.04, 0.7, 9.5],
                        [0, 0, 0],
                        0x20242a,
                    );
                }
            }
        }
    }

    let boardMat: MeshStandardMaterial | undefined;
    if (layout.scoreboard) {
        const sb = layout.scoreboard;
        const w = sb.w;
        const h = w / 2;
        const at = new Matrix4().compose(
            new Vector3(X(sb.dx), 0, Z(sb.dz)),
            new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), sb.yaw),
            new Vector3(1, 1, 1),
        );
        const local = new BoxBatch();
        local.add(
            [0, sb.bottom + h / 2, -0.35],
            [w + 0.5, h + 0.5, 0.7],
            [0, 0, 0],
            0x1e2025,
        );
        for (const sx of [-1, 1]) {
            local.add(
                [sx * w * 0.3, (sb.bottom + h) / 2, -0.9],
                [0.45, sb.bottom + h, 0.45],
                [0, 0, 0],
                0x2a2d33,
            );
        }
        props.append(local.transform(at));
        const map = scoreboardTexture();
        boardMat = new MeshStandardMaterial({
            color: 0x000000,
            emissive: 0xffffff,
            emissiveMap: map,
            emissiveIntensity: 1,
            roughness: 0.6,
        });
        const geo = new PlaneGeometry(w, h);
        const face = new Mesh(geo, boardMat);
        face.name = "scoreboard";
        face.position.set(0, sb.bottom + h / 2, 0.02);
        face.applyMatrix4(at);
        objects.push(face);
        owned.push(map, boardMat, geo);
    }

    if (layout.flagpole) {
        const x = X(layout.flagpole.dx);
        const z = Z(layout.flagpole.dz);
        props.add([x, 7.5, z], [0.16, 15, 0.16], [0, 0, 0], 0xe8e8e8);
        props.add([x + 1.1, 13.9, z], [2, 1.2, 0.04], [0, 0, 0], team);
        props.add([x, 15.05, z], [0.3, 0.3, 0.3], [0, 0, 0], 0xd9b440);
    }

    const parts: Built[] = [];
    if (high) parts.push(buildFence(frame));
    if (high) {
        const g = buildGoalPosts(frame);
        if (g) parts.push(g);
    } else {
        lowGoalPosts();
    }
    function lowGoalPosts() {
        if (frame.halfW * 2 < 95) return;
        const halfGoal = 3.55;
        const crossY = 3.05;
        const yellow = 0xe0b92c;
        for (const sx of [-1, 1]) {
            const x = (sx > 0 ? frame.maxX : frame.minX) + sx * 0.4;
            props.add(
                [x, crossY / 2, cz],
                [0.2, crossY, 0.2],
                [0, 0, 0],
                yellow,
            );
            props.add(
                [x, crossY, cz],
                [0.16, 0.16, 2 * halfGoal],
                [0, 0, 0],
                yellow,
            );
            for (const sz of [-1, 1]) {
                props.add(
                    [x, crossY + 3.05, cz + sz * halfGoal],
                    [0.12, 6.1, 0.12],
                    [0, 0, 0],
                    yellow,
                );
            }
        }
    }
    for (const p of parts) objects.push(...p.objects);

    return {
        objects,
        setLighting(preset) {
            const k = glowFor(preset);
            for (const g of glowMats) g.mat.emissiveIntensity = k * g.k;
            if (lampMesh) lampMesh.visible = k > 0;
            if (boardMat)
                boardMat.emissiveIntensity = preset === "day" ? 1.15 : 0.9;
        },
        dispose() {
            owned.forEach((o) => o.dispose());
            parts.forEach((p) => p.dispose());
        },
    };
}

function tri(
    q: QuadBuilder,
    a: Vector3,
    b: Vector3,
    c: Vector3,
    want: Vector3,
    color: [number, number, number],
) {
    q.quad(
        a,
        b,
        c,
        c.clone(),
        BUILDING_BRICK_UV,
        BUILDING_BRICK_UV,
        BUILDING_BRICK_UV,
        BUILDING_BRICK_UV,
        color,
        want,
    );
}

/** Adds the UV set the night glow map uses: position over the site square. */
function addNightUv(
    geo: BufferGeometry,
    cx: number,
    cz: number,
    size: number,
): void {
    const p = geo.getAttribute("position");
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
        uv[i * 2] = (p.getX(i) - (cx - size / 2)) / size;
        uv[i * 2 + 1] = 1 - (p.getZ(i) - (cz - size / 2)) / size;
    }
    geo.setAttribute("uv1", new Float32BufferAttribute(uv, 2));
}

/** A team color muted down for trim, as a hex number. */
function mutedHex(css: string): number {
    const m = muted(css, 0.3).match(/\d+/g) ?? ["60", "60", "70"];
    return (Number(m[0]) << 16) | (Number(m[1]) << 8) | Number(m[2]);
}
