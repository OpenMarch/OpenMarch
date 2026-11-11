// cspell:ignore metalness vomitory vomitories
import {
    BackSide,
    BoxGeometry,
    BufferGeometry,
    Color,
    DoubleSide,
    Float32BufferAttribute,
    Group,
    InstancedMesh,
    Mesh,
    MeshStandardMaterial,
    PlaneGeometry,
    SpotLight,
    Vector3,
    type Material,
    type MeshStandardMaterialParameters,
    type Vector3Tuple,
} from "three";
import {
    calmTeamColor,
    createRng,
    createSharedMaterials,
    ft,
    GROUND_LAYER,
    lightingValues,
    setFlushBacking,
    setGroundLayer,
    SIGN_RIBBON,
    signRibbonTexture,
    setLightIntensity,
    videoBoard,
    type VideoBoard,
    type SharedMaterials,
} from "../environment";
import type {
    CameraSeat,
    FieldFootprint,
    KitBuilder,
    LightingPreset,
    SeatRow,
    VenueParams,
} from "../types";
import {
    bandGeometry,
    bowlOutline,
    bowlTiers,
    ringSections,
    RING_PARTS,
    type BowlOutline,
    type BowlTier,
    type BuiltTier,
    type RingPair,
    type SectionLayout,
} from "./bowl";
import {
    BandBuilder,
    Members,
    roofSideRanges,
    splitSeatRow,
    type RoofSide,
} from "./pro/geometry";
import {
    concreteTexture,
    FACADE_LAYOUT,
    facadeTextures,
    interiorWallTextures,
    panelCeilingTexture,
    roofDeckTexture,
    ROOF_TILE,
    seatTexture,
    siteTextures,
    suiteTexture,
    windowWallTextures,
} from "./pro/textures";

/**
 * The pro dome kit (P2.4): a generic retractable-roof stadium, all placed
 * relative to the footprint. The bowl's inner outline is the footprint plus
 * 7.6 m on each side, with a 21.3 m corner radius.
 *
 * The drill is the subject, so the building is neutral: gray concrete and
 * charcoal seats, with the home color only as small accents. The bowl is split
 * into sections by aisles (radial in the corners) with a cross aisle and
 * tunnels in the lower bowl. Long-span trusses carry the sliding panels, with
 * catwalks, fixtures and boards hung on rods, inside a brick-and-glass
 * building with a window wall at the side-1 end, on a plain plaza.
 *
 * Roof steel, frame and panels never cast shadows, so no hard roof line ever
 * crosses the field. From above, the roof sides between the camera and the
 * field are cut away (`roofCutaway`) so the drill stays visible while the
 * structure on the far side still reads; straight overhead the whole roof is
 * cut, because top-down is a drill-reading camera.
 */

/** Gap between the footprint and the bowl's first row, on every side. */
export const PRO_BOWL_MARGIN = ft(25);
export const PRO_CORNER_RADIUS = ft(70);

/** Seating sections: segments per section on each part of the ring. */
export const PRO_LOWER_SECTIONS: SectionLayout = { x: 4, z: 7, arc: 4 };
export const PRO_UPPER_SECTIONS: SectionLayout = { x: 4, z: 7, arc: 2 };

/** Lower and upper tiers, from the demo (feet converted to meters). */
export const PRO_TIERS: BowlTier[] = [
    {
        offset: 0,
        rows: 32,
        depth: ft(2.8),
        rise: ft(0.95),
        base: ft(5),
        bottom: 0,
        side: "home",
        sections: PRO_LOWER_SECTIONS,
    },
    {
        offset: ft(82),
        rows: 38,
        depth: ft(2.9),
        rise: ft(1.55),
        base: ft(58),
        bottom: ft(52),
        fascia: true,
        side: "home",
        sections: PRO_UPPER_SECTIONS,
    },
];

/** The upper tier's front riser (the LED fascia): base minus bottom. */
const PRO_FASCIA_HEIGHT = ft(58) - ft(52);

/** Aisle width between seating sections. */
export const PRO_AISLE = 1.2;
/** Lower-bowl row left empty as a walkway across the sections. */
export const PRO_CROSS_AISLE_ROW = 8;
/** Lower-bowl tunnels: rows covered, and width. */
export const PRO_VOMITORY = { firstRow: 9, lastRow: 15, width: 3.4 };
/** Suite glass, between the decks just behind the lower tier. */
export const PRO_SUITE_GLASS = { bottom: ft(37), top: ft(49), inset: ft(2) };
/** The concrete floor slab above the suites. */
const SUITE_CEILING = ft(50);
/** Roof height (the fixed frame's center). */
export const PRO_ROOF_Y = ft(168);
const ROOF_THICKNESS = ft(4);
/** The sliding panels ride above the fixed frame. */
const PANEL_LIFT = ft(6);
/** Half-size of the roof opening beyond the footprint's half-extents. */
const OPENING_MARGIN_X = ft(30);
const OPENING_MARGIN_Z = ft(40);
/** The outer wall stands this far behind the upper deck's back wall. */
const FACADE_GAP = ft(6);
/** Corner radius of the building's outer wall. */
const FACADE_CORNER = ft(40);
/** Depth of the paved plaza beyond the outer wall, meters. */
const PLAZA_DEPTH = 26;
/** How far the site plane reaches past the outer wall, meters. */
const SITE_REACH = 130;
/** Height of the site plane: clear of the land layer at every radius. */
const SITE_Y = 0.02;
/** End-zone video boards. */
export const PRO_BOARD = { width: ft(110), height: ft(58), y: ft(128) };
/** Depth of the long-span trusses that carry the panels, and of the rest. */
const SUPER_TRUSS_DEPTH = 9;
const TRUSS_DEPTH = 4;
/** Seated eye height above the tread (ui.md UI-3). */
const EYE = 1.2;
/** Fraction of the roof gap closed per 1/60 s frame (the demo's 0.06). */
const ROOF_EASE = 0.06;

const PRESETS: LightingPreset[] = ["day", "night", "roofClosed"];

/** Member colors (`Members` tints one shared material per instance). */
const STEEL = 0xb4a9ae; // a touch of red cancels the turf's green bounce
const DARK = 0x16171b;
const RAIL = 0x3a3d44;
const CONCRETE = 0x8e8f8d;
/** How dark the underside of the roof is against its top. */
/** Weak in green, to cancel what the turf bounces up onto the underside. */
const ROOF_UNDERSIDE_TINT: Vector3Tuple = [0.9, 0.52, 0.92];

const NO_TINT: Vector3Tuple = [1, 1, 1];
/** The roof's edge coping and the steel rails and ribs on top of the roof. */
const COPING_TINT: Vector3Tuple = [0.52, 0.53, 0.55];
const ROOF_RIB = 0x777b7f;
const ROOF_RAIL = 0x4c4f55;
const ROOF_UNIT = 0x63666a;

/** Which roof side a member or a piece of frame belongs to ("all" when low). */
type RoofBucket = RoofSide | "all";

const ROOF_SIDES: RoofSide[] = ["zp", "xp", "zn", "xn"];

/** What the part builders share while one kit is being built. */
interface ProContext {
    root: Group;
    shared: SharedMaterials;
    /** Whether anything may cast a shadow at all. */
    shadows: boolean;
    quality: "low" | "high";
    params: VenueParams;
    footprint: FieldFootprint;
    ring: BowlOutline;
    /** The outer wall's outline (offset 0 is the wall). */
    shell: BowlOutline;
    /** Field center and the bowl's inner half-extents. */
    cx: number;
    cz: number;
    ax: number;
    az: number;
    /** Half-size of the outer wall and of the roof opening. */
    rx: number;
    rz: number;
    ox: number;
    oz: number;
    /** Steel, per roof side at high quality, in one bucket at low. */
    steel: Map<RoofBucket, Members>;
    /** Boxes that stay put on the ground: tunnels and entrances. */
    structure: Members;
    /** The bucket for a roof side at this quality. */
    bucket(side: RoofSide): RoofBucket;
    /** Adds a mesh to the root and frees its geometry on dispose. */
    addMesh(
        geo: BufferGeometry,
        mat: Material,
        name: string,
        castShadow?: boolean,
    ): Mesh;
    /** Registers cleanup for resources the shared set doesn't own. */
    own(dispose: () => void): void;
    /** A material the kit disposes, with its textures. */
    mat(params: MeshStandardMaterialParameters): MeshStandardMaterial;
}

export const buildProKit: KitBuilder = ({ footprint, params, quality }) => {
    const shadows = quality === "high";
    const shared = createSharedMaterials();
    const disposers: (() => void)[] = [];
    const root = new Group();
    root.name = "kit.pro";
    const cx = (footprint.minX + footprint.maxX) / 2;
    const cz = (footprint.minZ + footprint.maxZ) / 2;
    const ax = (footprint.maxX - footprint.minX) / 2 + PRO_BOWL_MARGIN;
    const az = (footprint.maxZ - footprint.minZ) / 2 + PRO_BOWL_MARGIN;
    const upperTier = PRO_TIERS[1];
    const upperBack = upperTier.offset + upperTier.rows * upperTier.depth;
    const rx = ax + upperBack + FACADE_GAP;
    const rz = az + upperBack + FACADE_GAP;
    const buckets: RoofBucket[] = quality === "high" ? ROOF_SIDES : ["all"];
    const ctx: ProContext = {
        root,
        shared,
        shadows,
        quality,
        params,
        footprint,
        ring: bowlOutline({
            centerX: cx,
            centerZ: cz,
            halfX: ax,
            halfZ: az,
            cornerRadius: PRO_CORNER_RADIUS,
        }),
        shell: bowlOutline({
            centerX: cx,
            centerZ: cz,
            halfX: rx,
            halfZ: rz,
            cornerRadius: FACADE_CORNER,
        }),
        cx,
        cz,
        ax,
        az,
        rx,
        rz,
        ox: (footprint.maxX - footprint.minX) / 2 + OPENING_MARGIN_X,
        oz: (footprint.maxZ - footprint.minZ) / 2 + OPENING_MARGIN_Z,
        steel: new Map(buckets.map((b) => [b, new Members()])),
        structure: new Members(),
        bucket: (side) => (quality === "high" ? side : "all"),
        addMesh(geo, mat, name, castShadow = false) {
            disposers.push(() => geo.dispose());
            const m = new Mesh(geo, mat);
            m.name = name;
            m.castShadow = castShadow;
            m.receiveShadow = true;
            root.add(m);
            return m;
        },
        own(dispose) {
            disposers.push(dispose);
        },
        mat(p) {
            const m = new MeshStandardMaterial(p);
            disposers.push(() => {
                m.map?.dispose();
                if (m.emissiveMap !== m.map) m.emissiveMap?.dispose();
                m.dispose();
            });
            return m;
        },
    };

    const site = addGround(ctx);
    const bowl = addBowl(ctx);
    const shell = addShell(ctx, bowl.upper);
    const roof = addRoof(ctx);
    const boards = addBoards(ctx, bowl.upper);
    addTrusses(ctx, boards.xs);
    addRoofTop(ctx);
    addEntrances(ctx);
    const steel = buildSteel(ctx, roof.group);
    buildStructure(ctx);

    const setLighting = (preset: LightingPreset, snap: boolean) => {
        if (!PRESETS.includes(preset)) return;
        roof.setLighting(preset, snap);
        const night = lightingValues(preset).kit.lampsOn;
        shell.setNight(night);
        site.setNight(night);
        // Dimmer glass by day, when the suites are lit by the sun as well.
        bowl.suiteMat.emissiveIntensity = night
            ? 0.55
            : preset === "day"
              ? 0.32
              : 0.45;
    };
    const defaultLighting: LightingPreset = "roofClosed";
    setLighting(defaultLighting, true);

    return {
        root,
        focus: [cx, 0, cz],
        cameras: proCameras(ctx, bowl.lower, bowl.upper),
        seatRows: bowl.seatRows,
        pickTargets: [bowl.treads],
        crowdDensity: quality === "high" ? 0.72 : 0.68,
        lightingPresets: [...PRESETS],
        defaultLighting,
        setLighting: (preset) => setLighting(preset, false),
        setShowCredits(credits) {
            boards.items.forEach((b) => b.board.setCredits(credits));
        },
        onFrame({ cameraPosition, dt }) {
            const above = cameraPosition[1] >= PRO_ROOF_Y - ft(2);
            const nearSide = roofCutaway(ctx, cameraPosition, above);
            const overhead = above && isOverField(ctx, cameraPosition);
            const cut = (b: RoofBucket) => overhead || nearSide(b);
            roof.frames.forEach((m, b) => (m.visible = !cut(b)));
            steel.forEach((m, b) => (m.visible = !cut(b)));
            roof.setAbove(above);
            // The boards stand clear of the field, so only the near one goes.
            boards.items.forEach((b) => {
                b.board.object.visible = !nearSide(b.side);
            });
            roof.step(dt);
        },
        dispose() {
            disposers.forEach((d) => d());
            shared.dispose();
            root.clear();
        },
    };
};

/**
 * Which roof buckets to hide for a camera: from above, the sides between the
 * camera and the field (past the bowl's inner edge on that side) so the roof
 * never covers the drill. At low quality the single bucket hides whole.
 */
function roofCutaway(
    ctx: ProContext,
    [x, , z]: Vector3Tuple,
    above: boolean,
): (bucket: RoofBucket) => boolean {
    const dx = x - ctx.cx;
    const dz = z - ctx.cz;
    return (bucket) => {
        if (!above) return false;
        switch (bucket) {
            case "all":
                return true;
            case "xp":
                return dx > ctx.ax;
            case "xn":
                return dx < -ctx.ax;
            case "zp":
                return dz > ctx.az;
            case "zn":
                return dz < -ctx.az;
        }
    };
}

/** Whether a camera is over the bowl's floor, looking down on the field. */
function isOverField(ctx: ProContext, [x, , z]: Vector3Tuple): boolean {
    return Math.abs(x - ctx.cx) <= ctx.ax && Math.abs(z - ctx.cz) <= ctx.az;
}

/**
 * The ground: one plane under everything with the floor inside the bowl, as
 * rings that never overlap. High quality adds the plaza and lots as a site plane that
 * fades into the shared land layer; low quality has no land, so the plaza is
 * a plain slab in the same draw.
 */
function addGround(ctx: ProContext) {
    const { shared, cx, cz, ax, az, rx, rz, quality } = ctx;
    // The layers don't overlap: each is a ring around the next one in, so
    // nothing on the ground can flash through another at range.
    type Rect = [x0: number, x1: number, z0: number, z1: number];
    const pos: number[] = [];
    const col: number[] = [];
    const rect = ([x0, x1, z0, z1]: Rect, y: number, c: Color) => {
        if (x1 - x0 < 1e-6 || z1 - z0 < 1e-6) return;
        pos.push(x0, y, z0, x0, y, z1, x1, y, z1);
        pos.push(x0, y, z0, x1, y, z1, x1, y, z0);
        for (let i = 0; i < 6; i++) col.push(c.r, c.g, c.b);
    };
    /** `outer` minus `inner` (which lies inside it), as up to four rects. */
    const ring = (outer: Rect, inner: Rect | null, y: number, hex: number) => {
        const c = new Color(hex);
        if (!inner) return rect(outer, y, c);
        const [ox0, ox1, oz0, oz1] = outer;
        const [ix0, ix1, iz0, iz1] = inner;
        rect([ox0, ox1, oz0, iz0], y, c);
        rect([ox0, ox1, iz1, oz1], y, c);
        rect([ox0, ix0, iz0, iz1], y, c);
        rect([ix1, ox1, iz0, iz1], y, c);
    };
    const around = (hx: number, hz: number): Rect => [
        cx - hx,
        cx + hx,
        cz - hz,
        cz + hz,
    ];
    const floor = around(ax + ft(5), az + ft(5));
    const plaza =
        quality === "low" ? around(rx + PLAZA_DEPTH, rz + PLAZA_DEPTH) : null;
    const g = ft(4500);
    const flush = (name: string, level: number) => {
        const geo = new BufferGeometry();
        geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
        geo.setAttribute("color", new Float32BufferAttribute(col, 3));
        geo.computeVertexNormals();
        const opts = { roughness: 1, vertexColors: true };
        ctx.addMesh(
            geo,
            level === GROUND_LAYER.ground
                ? setGroundLayer(shared.std(0xffffff, opts), level)
                : setGroundLayer(ctx.mat({ color: 0xffffff, ...opts }), level),
            name,
        );
        pos.length = 0;
        col.length = 0;
    };
    ring([-g, g, -g, g], plaza ?? floor, -ft(0.3), 0x55575c);
    if (plaza) ring(plaza, floor, -ft(0.2), 0x7f7c75);
    // High quality draws the land over the outer ground; the floor inside
    // the bowl is its own layer so the land never shows through it.
    if (quality === "high") flush("pro.ground", GROUND_LAYER.ground);
    ring(floor, null, -ft(0.1), 0x2f6328);
    flush(
        quality === "high" ? "pro.floor" : "pro.ground",
        quality === "high" ? GROUND_LAYER.site : GROUND_LAYER.ground,
    );
    if (quality === "low") return { setNight() {} };

    const halfSize = rx + SITE_REACH;
    const textures = siteTextures({
        halfSize,
        rx,
        rz,
        corner: FACADE_CORNER,
        plaza: PLAZA_DEPTH,
    });
    const siteMat = ctx.mat({
        map: textures.map,
        emissive: 0xffffff,
        emissiveMap: textures.emissive,
        emissiveIntensity: 0,
        roughness: 1,
        transparent: true,
        depthWrite: false,
        alphaTest: 0.01,
    });
    // Over the floor ring (site level) it fades into at the bowl's edge.
    setGroundLayer(siteMat, GROUND_LAYER.lots);
    const site = ctx.addMesh(
        new PlaneGeometry(2 * halfSize, 2 * halfSize),
        siteMat,
        "pro.site",
    );
    site.rotation.x = -Math.PI / 2;
    site.position.set(cx, SITE_Y, cz);
    return {
        setNight(on: boolean) {
            siteMat.emissiveIntensity = on ? 1 : 0;
        },
    };
}

/**
 * The bowl: seat treads (one texture tile per section), concrete (risers,
 * walls, soffits, suite ledge, ceiling and cross aisle), the LED fascia and
 * padded field wall, the suite glass and the tunnels.
 */
function addBowl(ctx: ProContext) {
    const { ring } = ctx;
    // One ribbon tile per SIGN_RIBBON.tileHeights fascia heights, so the
    // logos keep their shape on the band.
    const bowl = bowlTiers(ring, PRO_TIERS, {
        fasciaTile: PRO_FASCIA_HEIGHT * SIGN_RIBBON.tileHeights,
    });
    const [lower, upper] = bowl.tiers as [BuiltTier, BuiltTier];
    const ribbonMap = signRibbonTexture();
    // The rings run counterclockwise seen from above, so from the field the
    // band's U runs right to left; mirror it so the logos read.
    ribbonMap.repeat.set(-1, 1);
    const ribbonMat = ctx.mat({
        color: 0x000000,
        emissive: 0xffffff,
        emissiveMap: ribbonMap,
        emissiveIntensity: 1,
        side: DoubleSide,
    });
    const suiteMap = suiteTexture();
    suiteMap.repeat.set(-1, 1);
    const suiteMat = ctx.mat({
        color: 0xffffff,
        map: suiteMap,
        emissive: 0xffffff,
        emissiveMap: suiteMap,
        emissiveIntensity: 0.45,
        roughness: 0.18,
        metalness: 0.2,
        side: DoubleSide,
    });

    const g = PRO_SUITE_GLASS;
    const suiteFront = lower.back + g.inset;
    // The first riser is the padded field wall, drawn with the LED fascia;
    // a one-color stretch of the ribbon keeps it dark and free of ads.
    const [wallRiser, ...risers] = bowl.risers;
    const fieldWall: RingPair = {
        ...wallRiser,
        tile: 1e6,
        uOffset: SIGN_RIBBON.quiet,
    };
    const dressWall = ctx.quality === "high";
    const crossAisle = bowl.treads[PRO_CROSS_AISLE_ROW];
    const rimTop = upper.top + ft(4);
    const concrete = [
        ...risers,
        // The cross aisle is a plain walkway, one row deep.
        { ...crossAisle, u: undefined },
        // The suites' front ledge, where the press box camera stands.
        { a: ring(lower.back, g.bottom), b: ring(suiteFront, g.bottom) },
        {
            a: ring(lower.back - g.inset, SUITE_CEILING),
            b: ring(upper.offset + g.inset * 2, SUITE_CEILING),
        },
        // The concourse roof, from the deck's back rim to the outer wall.
        { a: ctx.shell(0, rimTop), b: ring(upper.back, rimTop) },
    ];
    const side = { side: DoubleSide };
    const treads = ctx.addMesh(
        bandGeometry(bowl.treads.filter((_, i) => i !== PRO_CROSS_AISLE_ROW)),
        ctx.mat({ map: seatTexture(), roughness: 0.8, ...side }),
        "pro.treads",
    );
    ctx.addMesh(
        bandGeometry(concrete),
        ctx.mat({ map: concreteTexture(), roughness: 0.95, ...side }),
        "pro.concrete",
    );
    ctx.addMesh(
        bandGeometry(dressWall ? bowl.fascia : [...bowl.fascia, fieldWall]),
        ribbonMat,
        "pro.fascia",
    );
    // A charcoal padded wall that's quieter than the ribbon's LED black.
    if (dressWall)
        ctx.addMesh(
            bandGeometry([wallRiser]),
            ctx.shared.std(0x34383b, { roughness: 0.9, side: DoubleSide }),
            "pro.fieldWall",
        );
    ctx.addMesh(
        bandGeometry([
            {
                a: ring(suiteFront, g.bottom),
                b: ring(suiteFront, g.top),
                tile: 36,
            },
        ]),
        suiteMat,
        "pro.suites",
    );

    const tunnels = addVomitories(ctx, lower);
    return {
        lower,
        upper,
        treads,
        seatRows: splitRows(bowl.seatRows, tunnels),
        suiteMat,
    };
}

/** Each ring part's kind, first section index and section count. */
function sectionParts(layout: SectionLayout) {
    const out: { kind: "x" | "z" | "arc"; first: number; count: number }[] = [];
    let k = 0;
    for (const part of RING_PARTS) {
        const count = part.segments / layout[part.kind];
        out.push({ kind: part.kind, first: k, count });
        k += count;
    }
    return out;
}

/**
 * Tunnels in the lower bowl: a dark mouth facing the field with concrete
 * sides, rails and a slim accent lintel, in the second section from each end
 * of a sideline, the middle two sections of each corner and both sections of
 * each end. Returns the sections that have one (they get a gap in the crowd
 * at every quality; the boxes are dropped at low).
 */
function addVomitories(ctx: ProContext, lower: BuiltTier): Set<number> {
    const { ring, structure, quality } = ctx;
    const { starts } = ringSections(PRO_LOWER_SECTIONS);
    const sections = new Set<number>();
    for (const part of sectionParts(PRO_LOWER_SECTIONS))
        for (let i = 0; i < part.count; i++) {
            const pick =
                part.kind === "x"
                    ? i === 1 || i === part.count - 2
                    : part.kind === "arc"
                      ? i === 1 || i === 2
                      : true;
            if (pick) sections.add(part.first + i);
        }
    if (quality === "low") return sections;
    const accent = calmAccent(ctx.params);
    const { firstRow, lastRow, width } = PRO_VOMITORY;
    const d0 = lower.offset + firstRow * lower.depth;
    const d1 = lower.offset + (lastRow + 1) * lower.depth;
    const h0 = lower.base + (firstRow - 1) * lower.rise;
    const h1 = lower.base + lastRow * lower.rise + 0.25;
    const r0 = ring(d0, 0);
    const r1 = ring(d1, 0);
    const n = r0.length;
    const at = (r: Vector3[], mid: number) => {
        const i = Math.floor(mid);
        return new Vector3().lerpVectors(r[i % n], r[(i + 1) % n], mid - i);
    };
    for (const k of sections) {
        const s = starts[k];
        const e = k + 1 < starts.length ? starts[k + 1] : n;
        const front = at(r0, (s + e) / 2);
        const back = at(r1, (s + e) / 2);
        const out = new Vector3().subVectors(back, front).normalize();
        const yaw = Math.atan2(out.x, out.z);
        const center = new Vector3()
            .addVectors(front, back)
            .multiplyScalar(0.5);
        const side = new Vector3(out.z, 0, -out.x);
        const depth = d1 - d0;
        structure.box(
            center.clone().setY((h0 + h1) / 2 - 0.05),
            [width, h1 - h0 - 0.1, depth],
            0x0c0d10,
            yaw,
        );
        for (const sx of [-1, 1]) {
            const wall = center
                .clone()
                .addScaledVector(side, sx * (width / 2 + 0.15));
            structure.box(
                wall.clone().setY((h0 + h1) / 2),
                [0.3, h1 - h0, depth],
                CONCRETE,
                yaw,
            );
            structure.box(wall.setY(h1 + 0.9), [0.06, 0.06, depth], RAIL, yaw);
        }
        // A rail along the front, and the home color on the lintel.
        structure.box(
            front
                .clone()
                .addScaledVector(out, 0.1)
                .setY(h1 + 0.9),
            [width + 0.6, 0.06, 0.06],
            RAIL,
            yaw,
        );
        structure.box(
            front.clone().setY(h1 - 0.12),
            [width + 0.6, 0.24, 0.1],
            accent,
            yaw,
        );
    }
    return sections;
}

/** The home color as an accent: greyer and darker, like the crowd wears it. */
function calmAccent(params: VenueParams): number {
    return calmTeamColor(new Color(params.homeColor).getHex());
}

/** Splits the closed bowl rows into per-section rows with aisle gaps. */
function splitRows(rows: SeatRow[], tunnels: Set<number>): SeatRow[] {
    const lowerRows = PRO_TIERS[0].rows;
    const lower = ringSections(PRO_LOWER_SECTIONS).starts;
    const upper = ringSections(PRO_UPPER_SECTIONS).starts;
    const { firstRow, lastRow, width } = PRO_VOMITORY;
    return rows.flatMap((row, i) =>
        i === PRO_CROSS_AISLE_ROW
            ? []
            : splitSeatRow(row, {
                  starts: i < lowerRows ? lower : upper,
                  halfAisle: PRO_AISLE / 2,
                  gaps:
                      i >= firstRow && i <= lastRow
                          ? { sections: tunnels, width: width + 0.8 }
                          : undefined,
              }),
    );
}

/** Segment range of the side-1 end straight on a bowl outline ring. */
function side1EndSegments(): [number, number] {
    let i = 0;
    for (let p = 0; p < 6; p++) i += RING_PARTS[p].segments;
    return [i, i + RING_PARTS[6].segments];
}

/**
 * The building's outer wall, one band around everything: brick and glass
 * outside, dark panels with a lit concourse strip inside, and a window wall
 * at the side-1 end above the upper deck. High quality adds the inner face
 * and the glass; low quality has the outside only.
 */
function addShell(ctx: ProContext, upper: BuiltTier) {
    const { shell, quality } = ctx;
    const H = FACADE_LAYOUT.height;
    const n = shell(0, 0).length;
    const [w0, w1] = side1EndSegments();
    const winBottom = FACADE_LAYOUT.brick + 1.4;
    const winTop = FACADE_LAYOUT.glass;
    const v = (y: number) => y / H;
    const tile = ft(80);
    const wall = new BandBuilder()
        .slice(shell(0, 0), shell(0, H), w1, n + w0, { tile })
        .slice(shell(0, 0), shell(0, winBottom), w0, w1, {
            tile,
            v1: v(winBottom),
        })
        .slice(shell(0, winTop), shell(0, H), w0, w1, { tile, v0: v(winTop) })
        .build();
    const facade = facadeTextures();
    const outsideMat = ctx.mat({
        map: facade.map,
        emissive: 0xffffff,
        emissiveMap: facade.emissive,
        emissiveIntensity: 0,
        roughness: 0.85,
    });
    // Behind the beams, ledges and roof edge that sit flush on it.
    setFlushBacking(outsideMat);
    // Only the outer wall casts: it grounds the building on the site.
    ctx.addMesh(wall, outsideMat, "pro.facade", ctx.shadows);
    let glassMat: MeshStandardMaterial | null = null;
    if (quality === "high") {
        const rimTop = upper.top + ft(4);
        const inside = interiorWallTextures(rimTop);
        const insideMat = ctx.mat({
            map: inside.map,
            emissive: 0xffffff,
            emissiveMap: inside.emissive,
            emissiveIntensity: 0.9,
            roughness: 0.8,
            side: BackSide,
        });
        setFlushBacking(insideMat);
        // The same geometry seen from inside (addMesh would free it twice).
        const interior = new Mesh(wall, insideMat);
        interior.name = "pro.interiorWall";
        interior.receiveShadow = true;
        ctx.root.add(interior);

        const glass = windowWallTextures();
        glassMat = ctx.mat({
            color: 0xffffff,
            map: glass.map,
            emissive: 0xffffff,
            emissiveMap: glass.emissive,
            emissiveIntensity: 0,
            transparent: true,
            depthWrite: false,
            roughness: 0.08,
            metalness: 0.25,
            side: DoubleSide,
        });
        const pane = ctx.addMesh(
            new BandBuilder()
                .slice(shell(0, winBottom), shell(0, winTop), w0, w1, { tile })
                .build(),
            glassMat,
            "pro.windowWall",
        );
        pane.receiveShadow = false;
    }
    return {
        setNight(on: boolean) {
            outsideMat.emissiveIntensity = on ? 0.72 : 0;
            if (glassMat) glassMat.emissiveIntensity = on ? 1.7 : 0;
        },
    };
}

/**
 * The roof: a fixed frame from the outer wall to the opening (one mesh per
 * side at high quality so the cutaway can hide the near sides), two
 * standing-seam panels that slide over the ends, and lights. `setLighting`
 * sets the panels' target; `step` eases them toward it.
 */
function addRoof(ctx: ProContext) {
    const { cx, cz, ox, oz, shell } = ctx;
    const group = new Group();
    group.name = "pro.roof";
    const top = PRO_ROOF_Y + ROOF_THICKNESS / 2;
    const bottom = PRO_ROOF_Y - ROOF_THICKNESS / 2;
    const opening = bowlOutline({
        centerX: cx,
        centerZ: cz,
        halfX: ox,
        halfZ: oz,
        cornerRadius: 0,
    });
    const n = shell(0, 0).length;
    const planar = { tile: ROOF_TILE, x: cx, z: cz };
    const frameMat = ctx.mat({
        map: roofDeckTexture(),
        roughness: 0.75,
        vertexColors: true,
        side: DoubleSide,
    });
    // Behind its girders and sliding panels, and behind the wall it meets.
    setFlushBacking(frameMat, 2);
    const ranges: Record<RoofBucket, [number, number][]> = {
        ...roofSideRanges(),
        all: [[0, n]],
    };
    const frames = new Map<RoofBucket, Mesh>();
    for (const b of ctx.steel.keys()) {
        const builder = new BandBuilder(true);
        for (const [i0, i1] of ranges[b]) {
            builder
                .slice(shell(0, top), opening(0, top), i0, i1, { planar })
                .slice(opening(0, bottom), shell(0, bottom), i0, i1, {
                    planar,
                    tint: ROOF_UNDERSIDE_TINT,
                })
                .slice(opening(0, top), opening(0, bottom), i0, i1, {
                    tile: 24,
                    v1: 0.05,
                    tint: ROOF_UNDERSIDE_TINT,
                });
            // A dark coping around the roof's edge. Only seen from above, so
            // low quality, which hides its roof from above, leaves it off.
            if (ctx.quality === "high") {
                const coping = top + 0.9;
                const edge = { tile: 24, v1: 0.05, tint: COPING_TINT };
                builder
                    .slice(shell(0, top), shell(0, coping), i0, i1, edge)
                    .slice(shell(0, coping), shell(-1.8, coping), i0, i1, edge)
                    .slice(shell(-1.8, coping), shell(-1.8, top), i0, i1, edge);
            }
        }
        const geo = builder.build();
        ctx.own(() => geo.dispose());
        const frame = new Mesh(geo, frameMat);
        frame.name = "pro.roofFrame";
        frame.receiveShadow = true;
        group.add(frame);
        frames.set(b, frame);
    }

    // Panels: a unit box scaled to size, tinted on its underside, with the
    // ceiling texture mapped once across each. They hide from above, so the
    // underside is the only face anyone sees.
    const panelGeo = new BoxGeometry(1, 1, 1);
    ctx.own(() => panelGeo.dispose());
    const tints: number[] = [];
    for (let face = 0; face < 6; face++)
        for (let k = 0; k < 4; k++) {
            tints.push(...(face === 3 ? ROOF_UNDERSIDE_TINT : NO_TINT));
        }
    panelGeo.setAttribute("color", new Float32BufferAttribute(tints, 3));
    const panelMap = panelCeilingTexture();
    const panelMat = ctx.mat({
        map: panelMap,
        roughness: 0.6,
        metalness: 0.05,
        vertexColors: true,
        // The panels are only seen from below (they hide from above). A faint
        // glow in the same seam pattern lifts the underside out of the env
        // map's green turf bounce and keeps the standing seams readable.
        emissive: 0xc4c2c6,
        emissiveMap: panelMap,
        emissiveIntensity: 0,
    });
    // Panels reach down into the frame so no daylight shows between them.
    const panelTop = PRO_ROOF_Y + PANEL_LIFT + ROOF_THICKNESS / 2;
    const panelBottom = PRO_ROOF_Y - ROOF_THICKNESS / 2 + 0.05;
    const panels = [-1, 1].map((sx) => {
        const m = new Mesh(panelGeo, panelMat);
        m.name = "pro.roofPanel";
        m.scale.set(ox, panelTop - panelBottom, 2 * oz);
        m.position.set(cx + (sx * ox) / 2, (panelTop + panelBottom) / 2, cz);
        m.receiveShadow = true;
        group.add(m);
        return m;
    });
    const panelX0 = panels.map((p) => p.position.x);
    const lights = addRoofLights(ctx, group);
    ctx.root.add(group);

    // 1 is open (panels over the fixed frame), 0 is closed.
    let open = 0;
    let target = 0;
    const place = () =>
        panels.forEach((p, i) => {
            p.position.x = panelX0[i] + (i ? 1 : -1) * ox * open;
        });
    return {
        group,
        frames,
        setAbove(above: boolean) {
            panels.forEach((p) => (p.visible = !above));
            if (lights.bars) lights.bars.visible = !above;
        },
        setLighting(preset: LightingPreset, snap: boolean) {
            const k = lightingValues(preset).kit;
            lights.set(k.barEmissive, k.roofSpotIntensity);
            // The moon's blue hemisphere otherwise paints the roof top blue.
            const shade = k.lampsOn ? 0.5 : 1;
            frameMat.color.setScalar(shade);
            panelMat.color.setScalar(shade);
            panelMat.emissiveIntensity = k.roofOpen ? 0.12 : 0.3;
            target = k.roofOpen ? 1 : 0;
            if (snap) {
                open = target;
                place();
            }
        },
        step(dt: number) {
            const gap = target - open;
            if (gap === 0) return;
            const ease = 1 - Math.pow(1 - ROOF_EASE, Math.max(0, dt) * 60);
            open = Math.abs(gap) < 0.001 ? target : open + gap * ease;
            place();
        },
    };
}

/** Top of the steel, just under the roof deck. */
const steelTopY = () => PRO_ROOF_Y - ROOF_THICKNESS / 2 - 0.3;
/** Height of the long-span trusses' bottom chord. */
const superChordY = () => steelTopY() - SUPER_TRUSS_DEPTH;
/** Height of the catwalks, hung just under the ordinary trusses. */
const catwalkY = () => steelTopY() - TRUSS_DEPTH - 1.6;

/**
 * Light fixtures: rows of small lenses (one instanced mesh in the roof group)
 * under the long-span trusses and along the catwalks, so they read as a rig
 * of lamps, plus six spots on the opening's edges that light the field.
 */
function addRoofLights(ctx: ProContext, roof: Group) {
    const { shared, cx, cz, ox, oz, rx, rz } = ctx;
    const barMat = shared.std(0x9ea3aa, {
        emissive: 0xfff4e2,
        emissiveIntensity: 0,
    });
    const chord = superChordY();
    const lens: Vector3Tuple = [0.7, 0.12, 0.7];
    // Low quality draws its lamps as plain light boxes with the steel, to
    // save the draw call; no material there glows.
    const high = ctx.quality === "high";
    const fixtures = high ? new Members() : ctx.steel.get("all")!;
    const lensColor = high ? 0xffffff : 0xfff4e2;
    for (const sz of [-1, 1])
        for (let x = -ox; x <= ox + 0.01; x += 8)
            for (const f of [-1, 1])
                fixtures.box(
                    new Vector3(cx + x, chord - 0.55, cz + sz * oz + f),
                    lens,
                    lensColor,
                );
    for (const sx of [-1, 1])
        for (let z = -oz + 6; z <= oz - 6 + 0.01; z += 8)
            for (const f of [-1, 1])
                fixtures.box(
                    new Vector3(cx + sx * ox + f, chord + 2, cz + z),
                    lens,
                    lensColor,
                );
    // Lamps on the catwalks over the stands.
    const y = catwalkY() - 0.42;
    const mid = (a: number, b: number) => (a + b) / 2;
    const zLine = mid(oz, rz);
    const xLine = mid(ox, rx);
    if (high) {
        for (const sz of [-1, 1])
            for (let x = -rx + 22; x <= rx - 22; x += 7)
                fixtures.box(
                    new Vector3(cx + x, y, cz + sz * zLine),
                    lens,
                    lensColor,
                );
        for (const sx of [-1, 1])
            for (let z = -rz + 22; z <= rz - 22; z += 7)
                fixtures.box(
                    new Vector3(cx + sx * xLine, y, cz + z),
                    lens,
                    lensColor,
                );
    }
    const bars = high
        ? fixtures.build(shared.unitBox, barMat, "pro.roofBar")
        : null;
    if (bars) {
        roof.add(bars);
        ctx.own(() => bars.dispose());
    }

    const spots: SpotLight[] = [];
    const edges: [number, number][] = [
        [-ox, 0],
        [ox, 0],
        [0, oz],
        [0, -oz],
        [-ox * 0.6, oz],
        [ox * 0.6, -oz],
    ];
    for (const [x, z] of edges) {
        const spot = new SpotLight(0xfff3e0, 0, 0, 0.7, 0.6, 0);
        spot.name = "pro.roofSpot";
        spot.position.set(cx + x, chord - 1, cz + z);
        spot.target.position.set(cx + x * 0.2, 0, cz + z * 0.2);
        spot.visible = false;
        ctx.root.add(spot, spot.target);
        spots.push(spot);
    }
    ctx.own(() => spots.forEach((s) => s.dispose()));
    return {
        bars,
        set(barEmissive: number, spotIntensity: number) {
            barMat.emissiveIntensity = barEmissive;
            spots.forEach((s) => setLightIntensity(s, spotIntensity));
        },
    };
}

/**
 * Roof steel: two long-span box trusses along the opening's long edges (they
 * carry the panels), cross trusses over the end and sideline stands, a
 * secondary truss over each sideline, catwalks hung under them with rails and
 * lamp housings, and speaker clusters. Skips the boards' planes. Low quality
 * keeps only the long-span trusses and the end cross trusses.
 */
function addTrusses(ctx: ProContext, boardXs: number[]): void {
    const { cx, cz, rx, rz, ox, oz, quality } = ctx;
    const topY = steelTopY();
    const reachX = rx - FACADE_CORNER - 1;
    const reachZ = rz - FACADE_CORNER - 1;
    const P = (x: number, z: number, y = topY) =>
        new Vector3(cx + x, y, cz + z);
    const steel = (side: RoofSide) => ctx.steel.get(ctx.bucket(side))!;

    // Long-span box trusses: two faces 3.2 m apart, tied at every node.
    const bay = quality === "high" ? 7 : 14;
    const span = 2 * rx - 4;
    const bays = Math.round(span / bay);
    for (const sz of [-1, 1]) {
        const members = steel(sz > 0 ? "zp" : "zn");
        const z = sz * oz;
        for (const f of [-1.6, 1.6])
            members.truss(
                P(-rx + 2, z + f),
                P(rx - 2, z + f),
                SUPER_TRUSS_DEPTH,
                bay,
                1.1,
                0.55,
                STEEL,
            );
        for (let i = 0; i <= bays; i++) {
            const x = -rx + 2 + (span * i) / bays;
            for (const y of [topY, topY - SUPER_TRUSS_DEPTH])
                members.beam(P(x, z - 1.6, y), P(x, z + 1.6, y), 0.4, STEEL);
        }
        // Speaker clusters over the sidelines.
        if (quality === "high") {
            const y = topY - SUPER_TRUSS_DEPTH;
            for (const x of [-ox * 0.55, 0, ox * 0.55]) {
                members.beam(P(x, z, y), P(x, z, y - 3.2), 0.12, RAIL);
                members.box(P(x, z, y - 5), [2.6, 3.6, 2.6], DARK);
            }
        }
    }

    // Cross trusses over the end and sideline stands.
    const clear = (x: number) =>
        boardXs.every((b) => Math.abs(cx + x - b) > 4.5);
    const xs = new Set<number>([-ox, ox]);
    if (quality === "high")
        for (let x = 0; x <= reachX; x += 18) xs.add(x).add(-x);
    for (const x of xs) {
        if (Math.abs(x) > reachX || !clear(x)) continue;
        const atEnd = Math.abs(Math.abs(x) - ox) < 0.01;
        const depth = atEnd ? 6 : TRUSS_DEPTH;
        const web = 0.3;
        if (Math.abs(x) < ox - 0.01)
            for (const sz of [-1, 1])
                steel(sz > 0 ? "zp" : "zn").truss(
                    P(x, sz * (oz + 1.6)),
                    P(x, sz * reachZ),
                    depth,
                    6,
                    0.6,
                    web,
                    STEEL,
                );
        else
            steel(x > 0 ? "xp" : "xn").truss(
                P(x, -reachZ),
                P(x, reachZ),
                depth,
                6,
                0.6,
                web,
                STEEL,
            );
    }
    if (quality === "low") return;

    // A secondary truss along each sideline, halfway out to the wall.
    for (const sz of [-1, 1])
        steel(sz > 0 ? "zp" : "zn").truss(
            P(-reachX, sz * (oz + (rz - oz) / 2)),
            P(reachX, sz * (oz + (rz - oz) / 2)),
            TRUSS_DEPTH,
            6,
            0.6,
            0.3,
            STEEL,
        );

    // Catwalks: deck, two handrails, a hanger every 12 m and lamp housings.
    const walkY = catwalkY();
    const zLine = (oz + rz) / 2;
    const xLine = (ox + rx) / 2;
    const catwalk = (m: Members, a: Vector3, b: Vector3, along: "x" | "z") => {
        const up = (p: Vector3, y: number) => p.clone().setY(y);
        const dx = along === "x" ? 0 : 0.62;
        const dz = along === "x" ? 0.62 : 0;
        const off = (p: Vector3, s: number, y: number) =>
            up(p, y).add(new Vector3(s * dx, 0, s * dz));
        m.beam(a, b, 1.3, 0x6e7278, 0.1);
        for (const s of [-1, 1])
            m.beam(off(a, s, walkY + 1), off(b, s, walkY + 1), 0.06, RAIL);
        const len = a.distanceTo(b);
        const hangers = Math.floor(len / 12);
        for (let i = 0; i <= hangers; i++) {
            const p = new Vector3().lerpVectors(a, b, i / hangers);
            m.beam(p, up(p, topY - TRUSS_DEPTH), 0.08, RAIL);
        }
        const lamps = Math.floor(len / 7);
        for (let i = 0; i <= lamps; i++) {
            const p = new Vector3().lerpVectors(a, b, i / lamps);
            m.box(up(p, walkY - 0.25), [0.9, 0.3, 0.9], DARK);
        }
    };
    for (const sz of [-1, 1])
        catwalk(
            steel(sz > 0 ? "zp" : "zn"),
            P(-rx + 22, sz * zLine, walkY),
            P(rx - 22, sz * zLine, walkY),
            "x",
        );
    for (const sx of [-1, 1])
        catwalk(
            steel(sx > 0 ? "xp" : "xn"),
            P(sx * xLine, -rz + 22, walkY),
            P(sx * xLine, rz - 22, walkY),
            "z",
        );
}

/**
 * What breaks up the roof from the air, as boxes in the steel's draw calls:
 * a rib over every cross truss, the rails the panels ride on, a ring beam at
 * each end of the opening and a few mechanical units. Each piece belongs to
 * the frame side it stands on, so it disappears with it in the cutaway. Low
 * quality never shows its roof from above and leaves these off.
 */
function addRoofTop(ctx: ProContext): void {
    if (ctx.quality === "low") return;
    const { cx, cz, rx, rz, ox, oz } = ctx;
    const y = PRO_ROOF_Y + ROOF_THICKNESS / 2;
    const c = FACADE_CORNER;
    const steel = (side: RoofSide) => ctx.steel.get(ctx.bucket(side))!;
    const zSide = (s: number): RoofSide => (s > 0 ? "zp" : "zn");
    const xSide = (s: number): RoofSide => (s > 0 ? "xp" : "xn");
    /** The roof's edge at x: straight, then following the rounded corner. */
    const edgeZ = (x: number) => {
        const over = Math.abs(x) - (rx - c);
        return (
            (over <= 0
                ? rz
                : rz - c + Math.sqrt(Math.max(0, c * c - over * over))) - 1.5
        );
    };
    /** Where the frame's diagonal corner seam crosses x, past the opening. */
    const cornerX = rx - c * (1 - Math.SQRT1_2);
    const cornerZ = rz - c * (1 - Math.SQRT1_2);
    const seamZ = (x: number) =>
        oz + ((Math.abs(x) - ox) * (cornerZ - oz)) / (cornerX - ox);
    const rib = (m: Members, x: number, z0: number, z1: number) => {
        if (z1 - z0 < 1) return;
        m.box(
            new Vector3(cx + x, y + 0.3, cz + (z0 + z1) / 2),
            [1.2, 0.6, z1 - z0],
            ROOF_RIB,
        );
    };
    for (let x = -18 * Math.floor((rx - 2) / 18); x < rx - 2; x += 18) {
        const edge = edgeZ(x);
        if (Math.abs(x) < ox) {
            for (const s of [-1, 1])
                rib(
                    steel(zSide(s)),
                    x,
                    Math.min(s * (oz + 2), s * edge),
                    Math.max(s * (oz + 2), s * edge),
                );
            continue;
        }
        const seam = Math.min(seamZ(x), edge);
        rib(steel(xSide(x)), x, -seam, seam);
        for (const s of [-1, 1])
            rib(
                steel(zSide(s)),
                x,
                Math.min(s * seam, s * edge),
                Math.max(s * seam, s * edge),
            );
    }
    // The rails along the opening's long edges, and its ring beams.
    const railZ = oz + 0.9;
    const beam = (
        m: Members,
        x0: number,
        x1: number,
        z: number,
        size: [number, number] = [1.1, 1.8],
    ) =>
        m.box(
            new Vector3(cx + (x0 + x1) / 2, y + size[0] / 2, cz + z),
            [x1 - x0, size[0], size[1]],
            ROOF_RAIL,
        );
    for (const s of [-1, 1]) {
        beam(steel(zSide(s)), -ox, ox, s * railZ);
        for (const e of [-1, 1]) {
            const [x0, x1] = e > 0 ? [ox, rx - 4] : [-(rx - 4), -ox];
            beam(steel(xSide(e)), x0, x1, s * railZ);
        }
        steel(xSide(s)).box(
            new Vector3(cx + s * ox, y + 0.5, cz),
            [2.2, 1, 2 * oz],
            ROOF_RAIL,
        );
    }
    // Mechanical units, each in the middle of a bay so no rib runs through.
    const rnd = createRng(29);
    const unit = (m: Members, x: number, z: number) => {
        const base = new Vector3(cx + x, y + 1.1, cz + z);
        m.box(base, [8, 2.2, 5 + rnd() * 3], ROOF_UNIT);
        m.box(base.clone().setY(y + 2.35), [5, 0.3, 3], ROOF_RAIL);
    };
    const bay = (k: number) => 9 + 18 * k;
    for (const s of [-1, 1]) {
        for (const k of [-3, -1, 1, 2]) {
            const x = bay(k);
            const near = oz + 6;
            unit(
                steel(zSide(s)),
                x,
                s * (near + rnd() * (edgeZ(x) - 8 - near)),
            );
        }
        for (const z of [-0.45, 0.4]) {
            const x = Math.min(bay(Math.floor((ox + 6) / 18)), rx - 14);
            unit(steel(xSide(s)), s * x, z * oz);
        }
    }
}

/** Builds the roof steel, one instanced mesh per bucket, in the roof group. */
function buildSteel(
    ctx: ProContext,
    roof: Group,
): Map<RoofBucket, InstancedMesh> {
    const material = ctx.shared.std(0xffffff, {
        roughness: 0.6,
        metalness: 0.12,
    });
    const meshes = new Map<RoofBucket, InstancedMesh>();
    for (const [b, members] of ctx.steel) {
        const mesh = members.build(ctx.shared.unitBox, material, "pro.steel");
        mesh.receiveShadow = false;
        roof.add(mesh);
        ctx.own(() => mesh.dispose());
        meshes.set(b, mesh);
    }
    return meshes;
}

/** The boxes on the ground: tunnels and entrance canopies, in one draw. */
function buildStructure(ctx: ProContext): void {
    if (ctx.structure.count === 0) return;
    const mesh = ctx.structure.build(
        ctx.shared.unitBox,
        ctx.shared.std(0xffffff, { roughness: 0.9 }),
        "pro.structure",
    );
    mesh.receiveShadow = true;
    ctx.root.add(mesh);
    ctx.own(() => mesh.dispose());
}

/**
 * Entrance canopies at the middle of each side: a dark steel slab on columns
 * with the home color along its front edge.
 */
function addEntrances(ctx: ProContext): void {
    if (ctx.quality === "low") return;
    const { cx, cz, rx, rz, structure } = ctx;
    const accent = calmAccent(ctx.params);
    const canopy = (x: number, z: number, nx: number, nz: number) => {
        const yaw = Math.atan2(nx, nz);
        const out = new Vector3(nx, 0, nz);
        const along = new Vector3(nz, 0, -nx);
        const base = new Vector3(x, 0, z);
        const center = base.clone().addScaledVector(out, 4.5);
        structure.box(center.clone().setY(5.2), [24, 0.5, 9], 0x2a2c31, yaw);
        structure.box(
            base.clone().addScaledVector(out, 9).setY(5.2),
            [24.4, 0.8, 0.3],
            accent,
            yaw,
        );
        for (const s of [-10, -3.4, 3.4, 10])
            structure.box(
                center
                    .clone()
                    .addScaledVector(along, s)
                    .addScaledVector(out, 3.5)
                    .setY(2.5),
                [0.4, 5, 0.4],
                RAIL,
                yaw,
            );
    };
    canopy(cx, cz + rz, 0, 1);
    canopy(cx, cz - rz, 0, -1);
    canopy(cx + rx, cz, 1, 0);
    canopy(cx - rx, cz, -1, 0);
}

/**
 * End-zone video boards hung from the roof on rods with a catwalk on top,
 * kept clear of the seats. Returns them with their x positions.
 */
function addBoards(ctx: ProContext, upper: BuiltTier) {
    const offset = boardClearOffset(upper);
    const roofBottom = PRO_ROOF_Y - ROOF_THICKNESS / 2;
    const topY = PRO_BOARD.y + PRO_BOARD.height / 2 + ft(2);
    const items: { board: VideoBoard; side: RoofSide }[] = [];
    const xs: number[] = [];
    for (const sx of [-1, 1]) {
        const board = videoBoard(
            PRO_BOARD.width,
            PRO_BOARD.height,
            0,
            ctx.shared,
        );
        const x = ctx.cx + sx * (ctx.ax + offset);
        board.object.position.set(x, PRO_BOARD.y, ctx.cz);
        board.object.rotation.y = (-sx * Math.PI) / 2;
        board.object.traverse((o) => (o.castShadow = false));
        ctx.root.add(board.object);
        ctx.own(() => board.dispose());
        const side: RoofSide = sx > 0 ? "xp" : "xn";
        const members = ctx.steel.get(ctx.bucket(side))!;
        for (const f of [-0.42, -0.14, 0.14, 0.42]) {
            const z = ctx.cz + f * PRO_BOARD.width;
            members.beam(
                new Vector3(x, topY, z),
                new Vector3(x, roofBottom, z),
                0.15,
                RAIL,
            );
        }
        members.box(
            new Vector3(x + sx * 0.4, topY + 0.25, ctx.cz),
            [1.4, 0.3, PRO_BOARD.width + ft(4)],
            0x2a2c31,
        );
        items.push({ board, side });
        xs.push(x);
    }
    return { items, xs };
}

/** Named cameras (design.md section 6), from the demo's seats. */
function proCameras(
    ctx: ProContext,
    lower: BuiltTier,
    upper: BuiltTier,
): CameraSeat[] {
    const { cx, cz, ax, footprint } = ctx;
    const fz = footprint.maxZ + PRO_BOWL_MARGIN; // the bowl's front edge
    const focus: Vector3Tuple = [cx, 0, cz];
    const rowEye = (t: BuiltTier, i: number) => ({
        y: t.base + i * t.rise + EYE,
        d: t.offset + (i + 0.45) * t.depth,
    });
    const lowerRow = rowEye(lower, 12);
    const upperRow = rowEye(upper, 24);
    const endRow = rowEye(upper, 14);
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
    return [
        // Suite level, in front of the glass and below the upper-deck soffit.
        cam(
            "pressBox",
            "seat",
            [cx, ft(45), fz + lower.back + ft(1)],
            [cx, 0, cz - ft(14)],
        ),
        cam(
            "lowerBowl",
            "seat",
            [cx - ft(30), lowerRow.y, fz + lowerRow.d],
            [cx - ft(10), ft(4), cz],
        ),
        // In the middle of a section, not on an aisle.
        cam(
            "upperDeck",
            "seat",
            [cx + ft(77), upperRow.y, fz + upperRow.d],
            [cx, 0, cz - ft(6)],
        ),
        cam("endZone", "seat", [cx + ax + endRow.d, endRow.y, cz], focus),
        cam(
            "sideline",
            "floor",
            [cx - ft(20), ft(6), footprint.maxZ + ft(14)],
            [cx + ft(10), ft(4), footprint.maxZ - ft(60)],
        ),
        cam("blimp", "aerial", [cx - ft(620), ft(640), cz + ft(600)], focus),
        // A tiny +Z offset keeps the front at the bottom of the screen.
        cam("topDown", "topDown", [cx, ft(980), cz + ft(0.5)], focus),
    ];
}

/**
 * Outline offset for the end-zone boards: the demo's spot 30 ft inside the
 * upper tier's back, moved toward the field until the board's frame clears
 * the seated crowd under it.
 */
function boardClearOffset(upper: BuiltTier): number {
    const bottom = PRO_BOARD.y - PRO_BOARD.height / 2 - ft(2);
    const halfThickness = ft(1.5);
    const headroom = ft(1.35) + 0.9 + 0.3; // seat, person, clearance
    let d = upper.back - ft(30);
    const treadAt = (x: number) => {
        const i = Math.floor((x - upper.offset) / upper.depth);
        if (i < 0) return -Infinity;
        return upper.base + Math.min(i, upper.rows - 1) * upper.rise;
    };
    while (d > upper.offset && treadAt(d + halfThickness) + headroom > bottom)
        d -= 0.25;
    return d;
}
