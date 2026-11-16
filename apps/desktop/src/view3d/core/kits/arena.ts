// cspell:ignore metalness
import {
    AdditiveBlending,
    BufferGeometry,
    Color,
    ConeGeometry,
    DirectionalLight,
    DoubleSide,
    Float32BufferAttribute,
    Group,
    InstancedMesh,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    PlaneGeometry,
    Quaternion,
    SpotLight,
    Vector3,
    type Material,
    type Texture,
    type Vector3Tuple,
} from "three";
import {
    createSharedMaterials,
    GROUND_LAYER,
    lightingValues,
    setGroundLayer,
    setLightIntensity,
    SIGN_RIBBON,
    signRibbonTexture,
    type SharedMaterials,
} from "../environment";
import type {
    CameraSeat,
    FieldFootprint,
    KitBuilder,
    LightingPreset,
    SeatRow,
    ShowCredits,
} from "../types";
import {
    bandGeometry,
    bowlOutline,
    bowlTiers,
    RING_POINTS,
    type BowlOutline,
    type BowlTier,
    type BuiltTier,
    type Ring,
    type RingPair,
} from "./bowl";
import {
    cutPolyline,
    mergedBoxes,
    pushStrip,
    ringAt,
    ringFrame,
    ringSection,
    stripGeometry,
    yawToward,
    type BoxSpec,
} from "./arena/geometry";
import {
    ARENA_BANNERS,
    arenaFloorTexture,
    bannerAtlasTexture,
    beamFadeTexture,
    SCOREBOARD_ATLAS,
    scoreboardTexture,
    seatBackTexture,
    tunnelMouthTexture,
} from "./arena/textures";

/**
 * The indoor arena kit, a UD Arena-style college basketball arena (home of
 * the winter guard and indoor percussion world championships). The floor
 * holds the tarp; a continuous two-level bowl with a concourse between rises
 * on all four sides; a center-hung scoreboard, a lighting truss and banners
 * hang under a dark steel roof; a judges' table sits on the floor in front of
 * the front side, and the performers' tunnel opens at the side-1 end.
 *
 * Everything is placed relative to the footprint. The bowl's inner outline is
 * the footprint plus `ARENA_MARGIN`, a rounded rectangle whose rows offset
 * outward (`bowl.ts`). Seats are cut into sections along that outline, so
 * aisles line up from row to row like a real bowl.
 */

/** Floor between the footprint and the bowl's front wall, per side. */
export const ARENA_MARGIN = { side: 5.5, back: 4.5, front: 8 };
export const ARENA_CORNER_RADIUS = 9;

/** Lower bowl: 20 rows, about 25 degrees, behind a 1.1 m LED front wall. */
export const ARENA_LOWER: BowlTier = {
    offset: 0,
    rows: 20,
    depth: 0.86,
    rise: 0.4,
    base: 1.1,
    bottom: 0,
    fascia: true,
    side: "neutral",
};
const LOWER_BACK = ARENA_LOWER.rows * ARENA_LOWER.depth;
const LOWER_TOP = ARENA_LOWER.base + (ARENA_LOWER.rows - 1) * ARENA_LOWER.rise;
/** Width of the concourse walkway between the two levels. */
export const ARENA_CONCOURSE = 3.6;
/** From the concourse floor up to the upper level's first tread. */
const UPPER_WALL = 3.45;
/** Upper bowl: 16 steeper rows (about 33 degrees) above the concourse. */
export const ARENA_UPPER: BowlTier = {
    offset: LOWER_BACK + ARENA_CONCOURSE,
    rows: 16,
    depth: 0.84,
    rise: 0.54,
    base: LOWER_TOP + UPPER_WALL,
    bottom: LOWER_TOP,
    side: "neutral",
};
/** Rail behind each level's last row. */
const RIM = 1;
const UPPER_TOP = ARENA_UPPER.base + (ARENA_UPPER.rows - 1) * ARENA_UPPER.rise;
/** Underside of the roof. */
export const ARENA_ROOF_Y = UPPER_TOP + RIM + 5.8;
/** The lighting truss over the floor. */
export const ARENA_TRUSS_Y = ARENA_ROOF_Y - 6.5;
/** Bottom of the center-hung scoreboard (its lower LED ring). */
export const ARENA_SCOREBOARD_BOTTOM = 10.4;
/** Performers' tunnel at the side-1 end: mouth width and height. */
export const ARENA_TUNNEL = { width: 5, height: 3 };
/** Concrete above the tunnel mouth, up to the deck where seats resume. */
const TUNNEL_LINTEL = 0.6;

/** Seat spacing along a row; matches the crowd's person spacing. */
const SEAT_SPACING = 0.64;
/** Half an aisle's width. */
const AISLE_HALF = 0.6;
/** Target seat-section length along the straights. */
const SECTION_LENGTH = 8;
const CORNER_SECTIONS = 3;
/** Seated eye height above the tread. */
const EYE = 1.2;
/** Crowd seat height above the tread (bowl.ts default, 1.35 ft). */
const SEAT_HEIGHT = 0.41;

/** Section colors: crimson lower bowl, navy upper bowl, alternating shades. */
const SEAT_COLORS = {
    lower: [0x9c1c30, 0x84162a],
    upper: [0x23407a, 0x1b3364],
};

/** Ring layout from `bowlOutline`: straights and corner arcs, by index. */
const RING = { nx: 28, nz: 14, na: 16 };

const PRESETS: LightingPreset[] = ["house", "show"];

interface Ctx {
    root: Group;
    overhead: Group;
    shared: SharedMaterials;
    shadows: boolean;
    quality: "low" | "high";
    fp: FieldFootprint;
    ring: BowlOutline;
    /** Field center. */
    cx: number;
    cz: number;
    /** Outline center and inner half-extents. */
    ocz: number;
    ax: number;
    az: number;
    /** Adds a mesh and frees its geometry on dispose. */
    addMesh(
        geo: BufferGeometry,
        mat: Material,
        name: string,
        parent?: Group,
    ): Mesh;
    own(dispose: () => void): void;
    /** Small unlit lights, merged into one mesh by `addGlow`. */
    glow: BoxSpec[];
}

export const buildArena: KitBuilder = ({ footprint, quality }) => {
    const fp = footprint;
    const shadows = quality === "high";
    const shared = createSharedMaterials();
    const disposers: (() => void)[] = [];
    const root = new Group();
    root.name = "kit.arena";
    const overhead = new Group();
    overhead.name = "arena.overhead";
    root.add(overhead);
    const cx = (fp.minX + fp.maxX) / 2;
    const cz = (fp.minZ + fp.maxZ) / 2;
    const ax = (fp.maxX - fp.minX) / 2 + ARENA_MARGIN.side;
    const az = (fp.maxZ - fp.minZ + ARENA_MARGIN.back + ARENA_MARGIN.front) / 2;
    const ocz =
        (fp.minZ - ARENA_MARGIN.back + fp.maxZ + ARENA_MARGIN.front) / 2;
    const ctx: Ctx = {
        root,
        overhead,
        shared,
        shadows,
        quality,
        fp,
        ring: bowlOutline({
            centerX: cx,
            centerZ: ocz,
            halfX: ax,
            halfZ: az,
            cornerRadius: ARENA_CORNER_RADIUS,
        }),
        cx,
        cz,
        ocz,
        ax,
        az,
        addMesh(geo, mat, name, parent = root) {
            disposers.push(() => geo.dispose());
            const m = new Mesh(geo, mat);
            m.name = name;
            m.receiveShadow = shadows;
            parent.add(m);
            return m;
        },
        own(dispose) {
            disposers.push(dispose);
        },
        glow: [],
    };

    const ribbonMat = ribbonMaterial(ctx);
    addFloor(ctx);
    const tunnel = tunnelBox(ctx);
    const bowl = addBowl(ctx, ribbonMat, tunnel.hole);
    addTunnel(ctx, tunnel);
    addJudgesTable(ctx);
    const rafters = addRafters(ctx, bowl.upper);
    const setShowCredits = addScoreboard(ctx, ribbonMat);
    addBanners(ctx, bowl.upper);
    addGlow(ctx);
    const lights = addLights(ctx, rafters);

    const lightingPresets = [...PRESETS];
    const setLighting = (preset: LightingPreset): void => {
        if (!PRESETS.includes(preset)) return;
        const k = lightingValues(preset).kit;
        lights.set(k.panelEmissive, k.overheadIntensity, k.showSpotIntensity);
    };
    const defaultLighting: LightingPreset = "show";
    setLighting(defaultLighting);

    return {
        root,
        focus: [cx, 0, cz],
        cameras: arenaCameras(ctx, bowl.lower, bowl.upper, tunnel),
        seatRows: bowl.seatRows,
        pickTargets: [bowl.treads],
        crowdDensity: 0.82,
        lightingPresets,
        defaultLighting,
        setLighting,
        setShowCredits,
        onFrame({ cameraPosition }) {
            overhead.visible = cameraPosition[1] < ARENA_ROOF_Y - 0.3;
        },
        dispose() {
            disposers.forEach((d) => d());
            shared.dispose();
            root.clear();
        },
    };
};

/** The shared LED ribbon material; its texture repeats along U. */
function ribbonMaterial(ctx: Ctx): MeshStandardMaterial {
    const map = signRibbonTexture();
    // Bowl rings run counterclockwise seen from above, so from the floor U
    // runs right to left; mirror it so the text reads (as in pro.ts).
    map.repeat.set(-1, 1);
    const mat = new MeshStandardMaterial({
        color: 0x000000,
        emissive: 0xffffff,
        emissiveMap: map,
        emissiveIntensity: 1,
        side: DoubleSide,
    });
    ctx.own(() => {
        map.dispose();
        mat.dispose();
    });
    return mat;
}

/**
 * How the ribbon texture runs along a band `height` meters tall: a whole
 * number of tiles round the ring (so there's no seam), each as close to
 * `SIGN_RIBBON.tileHeights` band heights as that allows, with the first ad
 * centered on the ring's first straight (it starts at that straight's end,
 * `cx` is its middle). The texture is mirrored (`repeat.x = -1`), so texture
 * U is minus band U.
 */
function ribbonLayout(
    points: Ring,
    height: number,
    cx: number,
): { tile: number; uOffset: number } {
    let length = 0;
    for (let i = 0; i < points.length; i++)
        length += points[i].distanceTo(points[(i + 1) % points.length]);
    const n = Math.max(
        1,
        Math.round(length / (height * SIGN_RIBBON.tileHeights)),
    );
    const tile = length / n;
    const toMiddle = Math.abs(cx - points[0].x);
    return { tile, uOffset: -SIGN_RIBBON.firstAd - toMiddle / tile };
}

/**
 * A band that shows only the ribbon's quiet stretch (dark with hairlines):
 * one texture column all the way round.
 */
const QUIET_RIBBON = { tile: 1e6, uOffset: -SIGN_RIBBON.quiet };

/**
 * The floor inside the bowl, with the event flooring and boundary tape:
 * over the land under it, behind the field tarp on it (2 cm up), at any
 * distance.
 */
function addFloor(ctx: Ctx): void {
    const { cx, ocz, ax, az, fp } = ctx;
    const ext = {
        minX: cx - ax,
        maxX: cx + ax,
        minZ: ocz - az,
        maxZ: ocz + az,
    };
    const floor = ctx.addMesh(
        new PlaneGeometry(2 * ax, 2 * az),
        setGroundLayer(
            ctx.shared.std(0xffffff, {
                map: arenaFloorTexture({ ...ext, footprint: fp }),
                roughness: 0.55,
            }),
            GROUND_LAYER.site,
        ),
        "arena.floor",
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, ocz);
    floor.receiveShadow = true;
}

/** Fractional ring indices of every aisle, in order around the ring. */
function aisleIndices(ctx: Ctx): number[] {
    const rc = Math.min(ARENA_CORNER_RADIUS, ctx.ax, ctx.az);
    const nx = Math.max(1, Math.round((2 * (ctx.ax - rc)) / SECTION_LENGTH));
    const nz = Math.max(1, Math.round((2 * (ctx.az - rc)) / SECTION_LENGTH));
    const out: number[] = [];
    let at = 0;
    const span = (points: number, sections: number) => {
        for (let k = 0; k < sections; k++)
            out.push(at + (points * k) / sections);
        at += points;
    };
    for (let side = 0; side < 2; side++) {
        span(RING.nx, nx);
        span(RING.na, CORNER_SECTIONS);
        span(RING.nz, nz);
        span(RING.na, CORNER_SECTIONS);
    }
    return out;
}

interface Hole {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    /** Rows (lower level) the hole cuts. */
    rows: number;
}

interface TunnelBox {
    hole: Hole;
    /** Front of the portal (on the floor), the block's back x and its top. */
    mouthX: number;
    backX: number;
    top: number;
    z: number;
}

/**
 * The tunnel's footprint through the lower bowl at the side-1 end: a block
 * from the floor up to a deck just above the tunnel mouth, covering every row
 * whose tread is below the deck. Seats resume on the row behind it.
 */
function tunnelBox(ctx: Ctx): TunnelBox {
    const t = ARENA_LOWER;
    const top = ARENA_TUNNEL.height + TUNNEL_LINTEL;
    const rows = Math.min(t.rows - 2, Math.ceil((top - t.base) / t.rise));
    const x0 = ctx.cx - ctx.ax;
    const backX = x0 - rows * t.depth;
    // The tunnel stays on the end straight even when the field is shallow.
    const rc = Math.min(ARENA_CORNER_RADIUS, ctx.ax, ctx.az);
    const zLimit = Math.max(0, ctx.az - rc - ARENA_TUNNEL.width / 2 - 1);
    const z = Math.min(ctx.ocz + zLimit, Math.max(ctx.ocz - zLimit, ctx.cz));
    const half = ARENA_TUNNEL.width / 2 + TUNNEL_WALL;
    return {
        hole: {
            minX: backX - 0.3,
            maxX: x0 + 1,
            minZ: z - half - 0.3,
            maxZ: z + half + 0.3,
            rows,
        },
        mouthX: x0 + 0.5,
        backX,
        top: Math.max(top, t.base + (rows - 1) * t.rise + 0.12),
        z,
    };
}

/** Thickness of the tunnel's side walls. */
const TUNNEL_WALL = 0.45;

/**
 * The bowl: treads, concrete (risers, rails, concourse floor and the wall up
 * to the roof), seat backs in colored sections, LED ribbons on the lower
 * front wall and the upper fascia, the glowing concourse portals with exit
 * signs, and amber aisle step lights.
 */
function addBowl(ctx: Ctx, ribbonMat: Material, hole: Hole) {
    const { ring, shared } = ctx;
    const tiers = bowlTiers(ring, [ARENA_LOWER, ARENA_UPPER], {
        rim: RIM,
        seatHeight: SEAT_HEIGHT,
    });
    const [lower, upper] = tiers.tiers as [BuiltTier, BuiltTier];

    const concrete: RingPair[] = [
        ...tiers.risers,
        // Concourse floor between the levels.
        {
            a: ring(lower.back, LOWER_TOP),
            b: ring(upper.offset, LOWER_TOP),
        },
        // Wall from the upper rail to the roof.
        {
            a: ring(upper.back, UPPER_TOP + RIM),
            b: ring(upper.back, ARENA_ROOF_Y + 0.2),
        },
    ];
    const side = { side: DoubleSide };
    const treads = ctx.addMesh(
        bandGeometry(tiers.treads),
        shared.std(0x2c2d33, { roughness: 0.9, ...side }),
        "arena.treads",
    );
    ctx.addMesh(
        bandGeometry(concrete),
        shared.std(0x3a3b42, { roughness: 0.95, ...side }),
        "arena.concrete",
    );
    // Lower front wall and the upper fascia ribbon share one LED material.
    // The front wall carries the ads; the fascia stays a quiet dark band.
    const ribbonY0 = LOWER_TOP + 2.62;
    const ribbonY1 = upper.base - 0.08;
    const ribbons = ctx.addMesh(
        bandGeometry([
            ...tiers.fascia.map((p) => ({
                ...p,
                ...ribbonLayout(p.b, ARENA_LOWER.base, ctx.cx),
            })),
            {
                a: ring(upper.offset - 0.05, ribbonY0),
                b: ring(upper.offset - 0.05, ribbonY1),
                ...QUIET_RIBBON,
            },
        ]),
        ribbonMat,
        "arena.ribbons",
    );
    ribbons.receiveShadow = false;

    // Seats and the crowd's seat rows, cut into sections at the aisles.
    const aisles = aisleIndices(ctx);
    const seatBuf = {
        pos: [] as number[],
        uv: [] as number[],
        col: [] as number[],
    };
    const seatRows: SeatRow[] = [];
    const color = new Color();
    const glow: BoxSpec[] = [];
    const center = { x: ctx.cx, z: ctx.ocz };
    for (const [ti, t] of [lower, upper].entries()) {
        const palette = ti === 0 ? SEAT_COLORS.lower : SEAT_COLORS.upper;
        for (let i = 0; i < t.rows; i++) {
            const o = t.offset + i * t.depth;
            const h = t.base + i * t.rise;
            const holes = ti === 0 && i < hole.rows ? [hole] : [];
            const backRing = ring(o + t.depth * 0.72, h);
            const seatRing = ring(o + t.depth * 0.45, h + SEAT_HEIGHT);
            aisles.forEach((f0, s) => {
                const f1 = s + 1 < aisles.length ? aisles[s + 1] : RING_POINTS;
                color.setHex(palette[s % 2]);
                for (const piece of cutPolyline(
                    ringSection(backRing, f0, f1, AISLE_HALF),
                    holes,
                ))
                    pushStrip(
                        piece,
                        0.22,
                        0.92,
                        SEAT_SPACING,
                        color,
                        seatBuf,
                        0.5,
                    );
                for (const piece of cutPolyline(
                    ringSection(seatRing, f0, f1, AISLE_HALF),
                    holes,
                ))
                    seatRows.push({
                        points: piece.map((p): Vector3Tuple => [p.x, p.y, p.z]),
                        closed: false,
                        depth: t.depth,
                        side: t.side ?? "neutral",
                    });
            });
            // Aisle step lights on the riser under each tread's nose.
            const nose = ring(o - 0.02, h - 0.12);
            for (const f of aisles) {
                const { point, inward } = ringFrame(nose, f, center);
                if (
                    holes.some(
                        (hh) =>
                            point.x > hh.minX &&
                            point.x < hh.maxX &&
                            point.z > hh.minZ &&
                            point.z < hh.maxZ,
                    )
                )
                    continue;
                glow.push({
                    p: [point.x, point.y, point.z],
                    s: [0.2, 0.05, 0.03],
                    ry: yawToward(inward),
                    color: 0xffb347,
                });
            }
        }
    }
    const seatTex = seatBackTexture();
    const seatMat = new MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        map: seatTex,
        alphaTest: 0.5,
        roughness: 0.7,
        side: DoubleSide,
    });
    ctx.own(() => {
        seatTex.dispose();
        seatMat.dispose();
    });
    ctx.addMesh(stripGeometry(seatBuf), seatMat, "arena.seats");

    // Concourse portals in the wall under the upper level, every other aisle,
    // glowing warm from the lit concourse behind, each with an exit sign.
    const wall = ring(upper.offset - 0.03, LOWER_TOP);
    aisles.forEach((f, k) => {
        if (k % 2) return;
        const { point, inward } = ringFrame(wall, f, center);
        const ry = yawToward(inward);
        glow.push(
            {
                p: [point.x, LOWER_TOP + 1.1, point.z],
                s: [2.1, 2.2, 0.05],
                ry,
                color: 0x1e160d,
            },
            // Warm light from the concourse, brightest low in the opening.
            {
                p: [
                    point.x + inward.x * 0.02,
                    LOWER_TOP + 0.75,
                    point.z + inward.z * 0.02,
                ],
                s: [1.7, 1.5, 0.05],
                ry,
                color: 0x9a6c38,
            },
            {
                p: [point.x, LOWER_TOP + 2.4, point.z],
                s: [0.55, 0.2, 0.06],
                ry,
                color: 0x29ff7a,
            },
        );
    });
    ctx.glow.push(...glow);

    return { lower, upper, treads, seatRows };
}

/**
 * Builds every small light collected in `ctx.glow` (step lights, portals,
 * exit signs, the tunnel strip, the judges' laptops and lamps) as one unlit
 * mesh. They look the same in every preset.
 */
function addGlow(ctx: Ctx): void {
    if (!ctx.glow.length) return;
    const mat = new MeshBasicMaterial({ vertexColors: true });
    ctx.own(() => mat.dispose());
    ctx.addMesh(mergedBoxes(ctx.glow), mat, "arena.glow").receiveShadow = false;
}

/**
 * The performers' tunnel through the lower bowl at the side-1 end: a
 * concrete portal with a railed deck on top, a dark mouth where warm light
 * spills from inside, black drapes on the jambs and a blue LED strip under
 * the header.
 */
function addTunnel(ctx: Ctx, t: TunnelBox): void {
    const { width, height } = ARENA_TUNNEL;
    const len = t.mouthX - t.backX;
    const mid = (t.mouthX + t.backX) / 2;
    const W = TUNNEL_WALL;
    const zOut = width / 2 + W;
    const concrete = 0x3a3b42;
    const boxes: BoxSpec[] = [
        // Side walls and the header slab.
        ...[-1, 1].map(
            (sz): BoxSpec => ({
                p: [mid, t.top / 2, t.z + sz * (width / 2 + W / 2)],
                s: [len, t.top, W],
                color: concrete,
            }),
        ),
        {
            p: [mid, (height + t.top) / 2, t.z],
            s: [len, t.top - height, width],
            color: concrete,
        },
        // Dark tunnel lining behind the mouth.
        {
            p: [mid - 0.3, height / 2, t.z],
            s: [len - 0.6, height, width],
            color: 0x0b0b0e,
        },
        // Glass rails on the deck (front and sides).
        {
            p: [t.mouthX - 0.05, t.top + 0.5, t.z],
            s: [0.06, 1, 2 * zOut],
            color: 0x1a1b1f,
        },
        ...[-1, 1].map(
            (sz): BoxSpec => ({
                p: [mid, t.top + 0.5, t.z + sz * (zOut - 0.03)],
                s: [len, 1, 0.06],
                color: 0x1a1b1f,
            }),
        ),
        // Black drapes on the jambs.
        ...[-1, 1].map(
            (sz): BoxSpec => ({
                p: [t.mouthX + 0.08, height / 2, t.z + sz * (width / 2 + 0.15)],
                s: [0.12, height, 0.5],
                color: 0x0d0d10,
            }),
        ),
    ];
    const mesh = ctx.addMesh(
        mergedBoxes(boxes),
        ctx.shared.std(0xffffff, { vertexColors: true, roughness: 0.85 }),
        "arena.tunnel",
    );
    mesh.castShadow = ctx.shadows;
    const mouthTex = tunnelMouthTexture();
    const mouthMat = new MeshBasicMaterial({ map: mouthTex });
    ctx.own(() => {
        mouthTex.dispose();
        mouthMat.dispose();
    });
    const mouth = ctx.addMesh(
        new PlaneGeometry(width - 0.3, height),
        mouthMat,
        "arena.tunnelMouth",
    );
    mouth.position.set(t.mouthX - 0.35, height / 2, t.z);
    mouth.rotation.y = Math.PI / 2;
    mouth.receiveShadow = false;
    ctx.glow.push(
        // Blue LED strip under the header.
        {
            p: [t.mouthX + 0.02, height + 0.06, t.z],
            s: [0.04, 0.08, width],
            color: 0x4f7dff,
        },
    );
}

/** Judges' table on the floor in front of the front side, with chairs. */
export function judgesTablePlacement(fp: FieldFootprint): {
    x: number;
    z: number;
    length: number;
    seats: number;
} {
    const length = Math.min(9, Math.max(5, (fp.maxX - fp.minX) * 0.2));
    return {
        x: (fp.minX + fp.maxX) / 2,
        z: fp.maxZ + ARENA_MARGIN.front * 0.5,
        length,
        // Even, so the camera sits between the two middle judges.
        seats: 2 * Math.max(1, Math.floor(length / 2.8)),
    };
}

function addJudgesTable(ctx: Ctx): void {
    const t = judgesTablePlacement(ctx.fp);
    const black = 0x111115;
    const boxes: BoxSpec[] = [
        { p: [t.x, 0.735, t.z], s: [t.length, 0.05, 0.8], color: 0x1c1c22 },
        // Black drape on the front and ends.
        { p: [t.x, 0.36, t.z - 0.36], s: [t.length, 0.72, 0.04], color: black },
        ...[-1, 1].map(
            (sx): BoxSpec => ({
                p: [t.x + (sx * t.length) / 2, 0.36, t.z],
                s: [0.04, 0.72, 0.76],
                color: black,
            }),
        ),
    ];
    const glow: BoxSpec[] = [];
    for (let i = 0; i < t.seats; i++) {
        const x = t.x - t.length / 2 + ((i + 0.5) * t.length) / t.seats;
        const cz = t.z + 0.75;
        boxes.push(
            { p: [x, 0.46, cz], s: [0.5, 0.07, 0.48], color: 0x18181d },
            { p: [x, 0.78, cz + 0.22], s: [0.5, 0.56, 0.06], color: 0x18181d },
            { p: [x, 0.22, cz], s: [0.08, 0.44, 0.08], color: 0x55565c },
            // Laptop base.
            {
                p: [x, 0.77, t.z + 0.12],
                s: [0.34, 0.02, 0.24],
                color: 0x2a2b30,
            },
        );
        glow.push(
            // Laptop screen, tilted back toward the judge.
            {
                p: [x, 0.88, t.z + 0.0],
                s: [0.34, 0.22, 0.01],
                rx: -0.25,
                color: 0x9fb8ff,
            },
            // Clip lamp on the scoring sheets.
            {
                p: [x + 0.32, 0.8, t.z + 0.05],
                s: [0.1, 0.06, 0.1],
                color: 0xffd9a0,
            },
        );
    }
    const mesh = ctx.addMesh(
        mergedBoxes(boxes),
        ctx.shared.std(0xffffff, { vertexColors: true, roughness: 0.75 }),
        "arena.judgesTable",
    );
    mesh.castShadow = ctx.shadows;
    ctx.glow.push(...glow);
}

interface Fixture {
    position: Vector3;
    aim: Vector3;
}

/**
 * Everything under the roof that never casts shadows: the ceiling, roof
 * trusses, catwalks, the lighting truss with its fixtures, and the house
 * high-bay lamps. Returns the fixtures for the lights and haze beams.
 */
function addRafters(ctx: Ctx, upper: BuiltTier) {
    const { cx, cz, ocz, ax, az, fp } = ctx;
    const R = ARENA_ROOF_Y;
    const hx = ax + upper.back + 1;
    const hz = az + upper.back + 1;
    const steel = 0x24252a;
    const boxes: BoxSpec[] = [
        // Ceiling deck.
        { p: [cx, R + 0.2, ocz], s: [2 * hx, 0.4, 2 * hz], color: 0x101114 },
    ];
    // Light beams along X and deep trusses along Z.
    for (let z = ocz - hz + 2; z < ocz + hz; z += 4)
        boxes.push({
            p: [cx, R - 0.35, z],
            s: [2 * hx, 0.7, 0.25],
            color: steel,
        });
    const nTruss = Math.max(3, Math.round((2 * hx) / 12));
    for (let i = 0; i <= nTruss; i++) {
        const x = cx - hx + (2 * hx * i) / nTruss;
        boxes.push(
            { p: [x, R - 0.9, ocz], s: [0.35, 0.12, 2 * hz], color: steel },
            { p: [x, R - 2.2, ocz], s: [0.35, 0.12, 2 * hz], color: steel },
        );
    }
    // Catwalks along X, front and back of the floor.
    const catY = R - 3;
    for (const z of [ocz - az * 0.55, ocz + az * 0.55]) {
        const L = 2 * ax;
        boxes.push(
            { p: [cx, catY, z], s: [L, 0.08, 1.1], color: 0x33353b },
            {
                p: [cx, catY + 1, z - 0.55],
                s: [L, 0.05, 0.05],
                color: 0x55575e,
            },
            {
                p: [cx, catY + 1, z + 0.55],
                s: [L, 0.05, 0.05],
                color: 0x55575e,
            },
        );
        for (let x = cx - ax; x <= cx + ax; x += 6)
            for (const dz of [-0.55, 0.55])
                boxes.push({
                    p: [x, (catY + R) / 2, z + dz],
                    s: [0.04, R - catY, 0.04],
                    color: 0x55575e,
                });
    }
    // Lighting truss: a rectangle over the floor's edges.
    const T = ARENA_TRUSS_Y;
    const tx = (fp.maxX - fp.minX) / 2 + 2.5;
    const tz = (fp.maxZ - fp.minZ) / 2 + 2.5;
    const truss = 0x6a6d75;
    for (const sy of [-0.25, 0.25]) {
        for (const sz of [-1, 1])
            for (const d of [-0.25, 0.25])
                boxes.push({
                    p: [cx, T + sy, cz + sz * tz + d],
                    s: [2 * tx + 0.5, 0.06, 0.06],
                    color: truss,
                });
        for (const sx of [-1, 1])
            for (const d of [-0.25, 0.25])
                boxes.push({
                    p: [cx + sx * tx + d, T + sy, cz],
                    s: [0.06, 0.06, 2 * tz + 0.5],
                    color: truss,
                });
    }
    // Chain hoists from the truss corners and midpoints to the roof.
    for (const sx of [-1, 0, 1])
        for (const sz of [-1, 1])
            boxes.push({
                p: [cx + sx * tx, (T + R) / 2, cz + sz * tz],
                s: [0.05, R - T, 0.05],
                color: 0x55575e,
            });

    // Fixtures along the truss, each aimed at a point on the floor.
    const fixtures: Fixture[] = [];
    const lenses: BoxSpec[] = [];
    const along = (x0: number, z0: number, x1: number, z1: number) => {
        const n = Math.max(2, Math.round(Math.hypot(x1 - x0, z1 - z0) / 2.6));
        for (let i = 0; i < n; i++) {
            const f = (i + 0.5) / n;
            const position = new Vector3(
                x0 + (x1 - x0) * f,
                T - 0.55,
                z0 + (z1 - z0) * f,
            );
            const aim = new Vector3(
                cx + (position.x - cx) * 0.45,
                0,
                cz + (position.z - cz) * 0.2,
            );
            fixtures.push({ position, aim });
        }
    };
    along(cx - tx, cz + tz, cx + tx, cz + tz);
    along(cx - tx, cz - tz, cx + tx, cz - tz);
    along(cx - tx, cz - tz, cx - tx, cz + tz);
    along(cx + tx, cz - tz, cx + tx, cz + tz);
    for (const { position: p, aim } of fixtures) {
        const dir = aim.clone().sub(p).normalize();
        const flat = Math.hypot(dir.x, dir.z);
        const ry = Math.atan2(-dir.x, -dir.z);
        const rx = Math.atan2(flat, -dir.y);
        boxes.push({
            p: [p.x, p.y, p.z],
            s: [0.36, 0.5, 0.36],
            ry,
            rx,
            color: 0x1a1b1f,
        });
        const lp = p.clone().addScaledVector(dir, 0.26);
        lenses.push({ p: [lp.x, lp.y, lp.z], s: [0.3, 0.03, 0.3], ry, rx });
    }

    const rafters = ctx.addMesh(
        mergedBoxes(boxes),
        ctx.shared.std(0xffffff, {
            vertexColors: true,
            roughness: 0.6,
            metalness: 0.3,
        }),
        "arena.rafters",
        ctx.overhead,
    );
    rafters.receiveShadow = false;

    const lensMat = ctx.shared.std(0x111111, {
        emissive: 0xfff2dc,
        emissiveIntensity: 0,
    });
    const lensMesh = ctx.addMesh(
        mergedBoxes(lenses),
        lensMat,
        "arena.lenses",
        ctx.overhead,
    );
    lensMesh.receiveShadow = false;

    // House high-bay lamps in a grid under the roof.
    const lampMat = ctx.shared.std(0x222222, {
        emissive: 0xfff3e2,
        emissiveIntensity: 0,
    });
    const spacing = 7.5;
    const nx = Math.max(2, Math.floor((2 * hx - 4) / spacing));
    const nz = Math.max(2, Math.floor((2 * hz - 4) / spacing));
    const lamps = new InstancedMesh(ctx.shared.unitBox, lampMat, nx * nz);
    lamps.name = "arena.houseLamps";
    const m = new Matrix4();
    const q = new Quaternion();
    const s = new Vector3(1.1, 0.25, 1.1);
    for (let i = 0; i < nx; i++)
        for (let j = 0; j < nz; j++)
            lamps.setMatrixAt(
                i * nz + j,
                m.compose(
                    new Vector3(
                        cx - ((nx - 1) * spacing) / 2 + i * spacing,
                        R - 1.6,
                        ocz - ((nz - 1) * spacing) / 2 + j * spacing,
                    ),
                    q,
                    s,
                ),
            );
    ctx.overhead.add(lamps);
    ctx.own(() => lamps.dispose());

    return { fixtures, lensMat, lampMat };
}

/**
 * The center-hung scoreboard: four video screens (long faces toward the
 * front and back, short ones toward the ends), LED rings above and below,
 * a crown and cables up to the roof.
 */
/** Builds the center-hung scoreboard; returns the credits setter for its screens. */
function addScoreboard(
    ctx: Ctx,
    ribbonMat: Material,
): (credits: ShowCredits) => void {
    const { cx, cz, fp } = ctx;
    const bw = Math.min(12, Math.max(8, (fp.maxX - fp.minX) * 0.24));
    const bd = bw * 0.62;
    const bh = bw * 0.42;
    const y0 = ARENA_SCOREBOARD_BOTTOM;
    const ringH = 0.75;
    const sy0 = y0 + ringH + 0.1; // screens bottom
    const sy1 = sy0 + bh;
    const top = sy1 + 0.1 + ringH;
    const R = ARENA_ROOF_Y;
    const boxes: BoxSpec[] = [
        {
            p: [cx, (y0 + top) / 2, cz],
            s: [bw + 0.3, top - y0, bd + 0.3],
            color: 0x15161a,
        },
        {
            p: [cx, top + 0.35, cz],
            s: [bw * 0.7, 0.7, bd * 0.7],
            color: 0x22232a,
        },
        {
            p: [cx, y0 - 0.25, cz],
            s: [bw * 0.5, 0.5, bd * 0.5],
            color: 0x1d1e23,
        },
    ];
    for (const sx of [-1, 1])
        for (const sz of [-1, 1])
            boxes.push({
                p: [cx + sx * bw * 0.3, (top + R) / 2, cz + sz * bd * 0.3],
                s: [0.06, R - top, 0.06],
                color: 0x55575e,
            });
    const body = ctx.addMesh(
        mergedBoxes(boxes),
        ctx.shared.std(0xffffff, {
            vertexColors: true,
            roughness: 0.5,
            metalness: 0.4,
        }),
        "arena.scoreboard",
        ctx.overhead,
    );
    body.receiveShadow = false;

    // Screens, all in one mesh with atlas UVs.
    const pos: number[] = [];
    const uv: number[] = [];
    const face = (
        center: Vector3,
        right: Vector3,
        width: number,
        r: { u0: number; v0: number; u1: number; v1: number },
    ) => {
        const hw = width / 2;
        const a = center.clone().addScaledVector(right, -hw).setY(sy0);
        const b = center.clone().addScaledVector(right, hw).setY(sy0);
        const c = b.clone().setY(sy1);
        const d = a.clone().setY(sy1);
        for (const p of [a, b, c, a, c, d]) pos.push(p.x, p.y, p.z);
        uv.push(
            r.u0,
            r.v0,
            r.u1,
            r.v0,
            r.u1,
            r.v1,
            r.u0,
            r.v0,
            r.u1,
            r.v1,
            r.u0,
            r.v1,
        );
    };
    const off = 0.17;
    const A = SCOREBOARD_ATLAS;
    face(
        new Vector3(cx, 0, cz + bd / 2 + off),
        new Vector3(1, 0, 0),
        bw,
        A.side,
    );
    face(
        new Vector3(cx, 0, cz - bd / 2 - off),
        new Vector3(-1, 0, 0),
        bw,
        A.side,
    );
    face(
        new Vector3(cx + bw / 2 + off, 0, cz),
        new Vector3(0, 0, -1),
        bd,
        A.end,
    );
    face(
        new Vector3(cx - bw / 2 - off, 0, cz),
        new Vector3(0, 0, 1),
        bd,
        A.end,
    );
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const { texture: map, setCredits } = scoreboardTexture();
    const screenMat = new MeshStandardMaterial({
        color: 0x000000,
        emissive: 0xffffff,
        emissiveMap: map,
        emissiveIntensity: 0.9,
    });
    ctx.own(() => {
        map.dispose();
        screenMat.dispose();
    });
    ctx.addMesh(geo, screenMat, "arena.screens", ctx.overhead).receiveShadow =
        false;

    // LED rings. Seen from outside, the ring's U already runs left to right,
    // which the mirrored ribbon texture would flip, so reverse the points.
    const ring = bowlOutline({
        centerX: cx,
        centerZ: cz,
        halfX: bw / 2 + 0.2,
        halfZ: bd / 2 + 0.2,
        cornerRadius: 0.5,
    });
    // The rings stay quiet; the screens carry the content.
    const r = (y: number) => ring(0, y).reverse();
    ctx.addMesh(
        bandGeometry([
            { a: r(y0), b: r(y0 + ringH), ...QUIET_RIBBON },
            { a: r(sy1 + 0.1), b: r(top), ...QUIET_RIBBON },
        ]),
        ribbonMat,
        "arena.scoreboardRings",
        ctx.overhead,
    ).receiveShadow = false;

    return setCredits;
}

/** Championship banners hanging from the roof above the back upper level. */
function addBanners(ctx: Ctx, upper: BuiltTier): void {
    const { cx, ocz, ax, az } = ctx;
    const rc = Math.min(ARENA_CORNER_RADIUS, ax, az);
    const straight = 2 * (ax - rc);
    const n = Math.min(ARENA_BANNERS.length, Math.floor(straight / 3.6));
    if (n < 1) return;
    const w = 1.5;
    const h = 4.4;
    const z = ocz - az - (upper.back - 4);
    const yTop = ARENA_ROOF_Y - 0.9;
    const spacing = Math.min(4.2, straight / n);
    const pos: number[] = [];
    const uv: number[] = [];
    // Show the middle banners of the set when there's room for fewer.
    const first = Math.floor((ARENA_BANNERS.length - n) / 2);
    for (let i = 0; i < n; i++) {
        const x = cx + (i - (n - 1) / 2) * spacing;
        const k = first + i;
        const u0 = k / ARENA_BANNERS.length;
        const u1 = (k + 1) / ARENA_BANNERS.length;
        const x0 = x - w / 2;
        const x1 = x + w / 2;
        const y0 = yTop - h;
        pos.push(
            x0,
            y0,
            z,
            x1,
            y0,
            z,
            x1,
            yTop,
            z,
            x0,
            y0,
            z,
            x1,
            yTop,
            z,
            x0,
            yTop,
            z,
        );
        uv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const map: Texture = bannerAtlasTexture();
    const mat = new MeshStandardMaterial({
        map,
        roughness: 0.9,
        transparent: false,
        alphaTest: 0.5,
    });
    ctx.own(() => {
        map.dispose();
        mat.dispose();
    });
    ctx.addMesh(geo, mat, "arena.banners", ctx.overhead).receiveShadow = false;
}

/**
 * House light (one overhead directional, shadowed on high), the four show
 * spots on the truss, and haze beams from the fixtures (high quality only).
 * `set` takes the gym's preset values: lamp emissive, overhead and spot
 * intensity.
 */
function addLights(
    ctx: Ctx,
    rig: {
        fixtures: Fixture[];
        lensMat: MeshStandardMaterial;
        lampMat: MeshStandardMaterial;
    },
) {
    const { cx, cz, fp, ax, az } = ctx;
    const w = fp.maxX - fp.minX;
    const d = fp.maxZ - fp.minZ;
    const T = ARENA_TRUSS_Y;
    const tx = w / 2 + 2.5;
    const tz = d / 2 + 2.5;

    const overheadLight = new DirectionalLight(0xfff4e6, 1);
    overheadLight.name = "arena.overheadLight";
    overheadLight.position.set(cx + 6, 70, cz + 12);
    overheadLight.target.position.set(cx, 0, cz);
    overheadLight.castShadow = ctx.shadows;
    overheadLight.shadow.mapSize.set(2048, 2048);
    const half = Math.max(ax, az) + 2;
    Object.assign(overheadLight.shadow.camera, {
        left: -half,
        right: half,
        top: half,
        bottom: -half,
        near: 40,
        far: 100,
    });
    overheadLight.shadow.camera.updateProjectionMatrix();
    ctx.root.add(overheadLight, overheadLight.target);
    ctx.own(() => {
        overheadLight.shadow.map?.dispose();
        overheadLight.dispose();
    });

    const spots: SpotLight[] = [];
    for (const sz of [-1, 1])
        for (const sx of [-1, 1]) {
            const sp = new SpotLight(0xf6f0ff, 0, 0, 0.52, 0.6, 0);
            sp.name = "arena.showSpot";
            sp.position.set(cx + sx * tx * 0.55, T - 0.6, cz + sz * tz);
            sp.target.position.set(cx + sx * w * 0.18, 0, cz - sz * d * 0.12);
            ctx.root.add(sp, sp.target);
            spots.push(sp);
        }
    ctx.own(() => spots.forEach((s) => s.dispose()));

    // Haze beams: soft additive cones from every other fixture.
    let beams: InstancedMesh | null = null;
    if (ctx.quality === "high") {
        // The cone's tip (+Y) points from the floor spot up to the lamp.
        const cone = new ConeGeometry(1, 1, 20, 1, true);
        const fade = beamFadeTexture();
        const beamMat = new MeshBasicMaterial({
            color: 0xfff0d8,
            map: fade,
            transparent: true,
            opacity: 0.035,
            blending: AdditiveBlending,
            depthWrite: false,
            side: DoubleSide,
            fog: false,
        });
        const chosen = rig.fixtures.filter((_, i) => i % 2 === 0);
        beams = new InstancedMesh(cone, beamMat, chosen.length);
        beams.name = "arena.beams";
        const m = new Matrix4();
        const q = new Quaternion();
        const up = new Vector3(0, 1, 0);
        chosen.forEach(({ position, aim }, i) => {
            const v = position.clone().sub(aim);
            const len = v.length();
            q.setFromUnitVectors(up, v.clone().normalize());
            const r = len * Math.tan(0.11);
            m.compose(
                aim.clone().addScaledVector(v, 0.5),
                q,
                new Vector3(r, len, r),
            );
            beams!.setMatrixAt(i, m);
        });
        beams.renderOrder = 2;
        ctx.overhead.add(beams);
        ctx.own(() => {
            cone.dispose();
            fade.dispose();
            beamMat.dispose();
            beams?.dispose();
        });
    }

    return {
        set(
            lampEmissive: number,
            overheadIntensity: number,
            spotIntensity: number,
        ) {
            rig.lampMat.emissiveIntensity = lampEmissive * 1.6;
            setLightIntensity(overheadLight, overheadIntensity);
            spots.forEach((s) => setLightIntensity(s, spotIntensity));
            rig.lensMat.emissiveIntensity = spotIntensity > 0 ? 3 : 0.15;
            if (beams) beams.visible = spotIntensity > 0;
        },
    };
}

/**
 * Named cameras. `geJudge` (high in the lower level, front center) comes
 * first so the view opens there.
 */
function arenaCameras(
    ctx: Ctx,
    lower: BuiltTier,
    upper: BuiltTier,
    tunnel: TunnelBox,
): CameraSeat[] {
    const { cx, cz, ocz, ax, az, fp, ring } = ctx;
    const front = ocz + az; // the lower front wall on the front side
    const focus: Vector3Tuple = [cx, 0, cz];
    const row = (t: BuiltTier, i: number) => ({
        y: t.base + i * t.rise + EYE,
        d: t.offset + (i + 0.45) * t.depth,
    });
    const cam = (
        id: string,
        kind: CameraSeat["kind"],
        position: Vector3Tuple,
        target: Vector3Tuple,
    ): CameraSeat => ({
        id,
        labelKey: `view3d.camera.${id}`,
        kind,
        position,
        target,
    });
    const ge = row(lower, 15);
    const fr = row(lower, 0);
    const up = row(upper, 8);
    const co = row(lower, 13);
    const corner = ringAt(ring(co.d, co.y), RING.nx + RING.na / 2);
    const table = judgesTablePlacement(fp);
    // High enough to frame the whole bowl at a 45 degree field of view, 16:9.
    const outerX = ax + upper.back + 1;
    const outerZ = az + upper.back + 1;
    const tan = Math.tan(Math.PI / 8);
    const topY =
        Math.max(outerZ / tan, outerX / ((tan * 16) / 9), ARENA_ROOF_Y + 20) *
        1.04;
    return [
        cam("geJudge", "seat", [cx, ge.y, front + ge.d], [cx, 0, cz - 0.6]),
        cam(
            "judgesTable",
            "seat",
            [table.x, 1.25, table.z + 0.75],
            [cx, 0.6, cz],
        ),
        cam(
            "frontRow",
            "seat",
            [cx - Math.min(8, ax * 0.4), fr.y, front + fr.d],
            [cx - 2, 1, cz],
        ),
        cam("upperDeck", "seat", [cx + 3, up.y, front + up.d], [cx, 0, cz - 1]),
        cam("corner", "seat", [corner.x, corner.y, corner.z], focus),
        cam(
            "tunnel",
            "floor",
            [tunnel.mouthX + 0.6, 1.7, tunnel.z],
            [cx, 1.4, cz],
        ),
        cam("floor", "floor", [cx, 1.68, fp.minZ - 1], [cx, 1.83, front + 6]),
        // A tiny +Z offset keeps the front at the bottom of the screen.
        cam("topDown", "topDown", [cx, topY, cz + 0.06], focus),
    ];
}
