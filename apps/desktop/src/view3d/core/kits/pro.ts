// cspell:ignore metalness
import {
    DoubleSide,
    Group,
    Mesh,
    MeshStandardMaterial,
    PlaneGeometry,
    SpotLight,
    type BufferGeometry,
    type Material,
    type Vector3Tuple,
} from "three";
import {
    createSharedMaterials,
    ft,
    lightingValues,
    ribbonTexture,
    videoBoard,
    type SharedMaterials,
} from "../environment";
import type {
    CameraSeat,
    FieldFootprint,
    KitBuilder,
    LightingPreset,
    VenueParams,
} from "../types";
import {
    bandGeometry,
    bowlOutline,
    bowlTiers,
    type BowlOutline,
    type BowlTier,
    type BuiltTier,
} from "./bowl";

/**
 * The pro dome kit (P2.4), a Lucas Oil-like stadium ported from the reference
 * demo's `buildPro` (design.md section 6, "pro"). Everything is placed
 * relative to the footprint: the bowl's inner outline is the footprint plus
 * 7.6 m on each side, with a 21.3 m corner radius.
 */

/** Gap between the footprint and the bowl's first row, on every side. */
export const PRO_BOWL_MARGIN = ft(25);
export const PRO_CORNER_RADIUS = ft(70);

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
    },
];

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
/** End-zone video boards. */
export const PRO_BOARD = { width: ft(110), height: ft(58), y: ft(128) };
/** Seated eye height above the tread (ui.md UI-3). */
const EYE = 1.2;
/** Fraction of the roof gap closed per 1/60 s frame (the demo's 0.06). */
const ROOF_EASE = 0.06;

const PRESETS: LightingPreset[] = ["day", "night", "roofClosed"];

/** What the part builders share while one kit is being built. */
interface ProContext {
    root: Group;
    shared: SharedMaterials;
    shadows: boolean;
    footprint: FieldFootprint;
    ring: BowlOutline;
    /** Field center and the bowl's inner half-extents. */
    cx: number;
    cz: number;
    ax: number;
    az: number;
    /** Adds a mesh to the root and frees its geometry on dispose. */
    addMesh(
        geo: BufferGeometry,
        mat: Material,
        name: string,
        castShadow?: boolean,
    ): Mesh;
    /** Registers cleanup for resources the shared set doesn't own. */
    own(dispose: () => void): void;
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
    const ctx: ProContext = {
        root,
        shared,
        shadows,
        footprint,
        ring: bowlOutline({
            centerX: cx,
            centerZ: cz,
            halfX: ax,
            halfZ: az,
            cornerRadius: PRO_CORNER_RADIUS,
        }),
        cx,
        cz,
        ax,
        az,
        addMesh(geo, mat, name, castShadow = shadows) {
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
    };

    addGround(ctx);
    const bowl = addBowl(ctx, params);
    const roof = addRoof(ctx, bowl.upper);
    addBoards(ctx, bowl.upper, params);
    const defaultLighting: LightingPreset = "roofClosed";
    roof.setLighting(defaultLighting, true);

    return {
        root,
        focus: [cx, 0, cz],
        cameras: proCameras(ctx, bowl.lower, bowl.upper),
        seatRows: bowl.seatRows,
        pickTargets: [bowl.treads],
        lightingPresets: [...PRESETS],
        defaultLighting,
        setLighting: (preset) => roof.setLighting(preset, false),
        onFrame({ cameraPosition, dt }) {
            const below = cameraPosition[1] < PRO_ROOF_Y - ft(2);
            roof.group.visible = below;
            bowl.clerestory.visible = below;
            roof.step(dt);
        },
        dispose() {
            disposers.forEach((d) => d());
            shared.dispose();
            root.clear();
        },
    };
};

/** Ground outside and the floor inside the bowl. */
function addGround(ctx: ProContext): void {
    const { shared, cx, cz, ax, az } = ctx;
    const ground = ctx.addMesh(
        new PlaneGeometry(ft(9000), ft(9000)),
        shared.std(0x55575c, { roughness: 1 }),
        "pro.ground",
        false,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -ft(0.3);
    const floor = ctx.addMesh(
        new PlaneGeometry(2 * ax + ft(10), 2 * az + ft(10)),
        shared.std(0x3a7330, { roughness: 1 }),
        "pro.floor",
        false,
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, -ft(0.1), cz);
}

/**
 * The bowl: treads, concrete (risers, walls, soffits, suite ledge and
 * ceiling), the LED fascia, the suite glass and the clerestory.
 */
function addBowl(ctx: ProContext, params: VenueParams) {
    const { ring, shared } = ctx;
    const bowl = bowlTiers(ring, PRO_TIERS);
    const [lower, upper] = bowl.tiers as [BuiltTier, BuiltTier];
    const ribbonMat = new MeshStandardMaterial({
        color: 0x000000,
        emissive: 0xffffff,
        emissiveMap: ribbonTexture(params.endZoneText || "OPENMARCH"),
        emissiveIntensity: 1.2,
        side: DoubleSide,
    });
    const clerestoryMat = new MeshStandardMaterial({
        color: 0x9fb6cc,
        transparent: true,
        opacity: 0.28,
        roughness: 0.1,
        side: DoubleSide,
        depthWrite: false,
    });
    // The rings run counterclockwise seen from above, so from the field the
    // band's U runs right to left; mirror it so the text reads.
    ribbonMat.emissiveMap?.repeat.set(-1, 1);
    ctx.own(() => {
        ribbonMat.emissiveMap?.dispose();
        ribbonMat.dispose();
        clerestoryMat.dispose();
    });

    const g = PRO_SUITE_GLASS;
    const suiteFront = lower.back + g.inset;
    const concrete = [
        ...bowl.risers,
        // The suites' front ledge, where the press box camera stands.
        { a: ring(lower.back, g.bottom), b: ring(suiteFront, g.bottom) },
        {
            a: ring(lower.back - g.inset, SUITE_CEILING),
            b: ring(upper.offset + g.inset * 2, SUITE_CEILING),
        },
    ];
    const side = { side: DoubleSide };
    const treads = ctx.addMesh(
        bandGeometry(bowl.treads),
        shared.std(0x1f3f8f, { roughness: 0.8, ...side }),
        "pro.treads",
    );
    ctx.addMesh(
        bandGeometry(concrete),
        shared.std(0x9a9ca3, { roughness: 0.95, ...side }),
        "pro.concrete",
    );
    ctx.addMesh(bandGeometry(bowl.fascia), ribbonMat, "pro.fascia");
    ctx.addMesh(
        bandGeometry([
            { a: ring(suiteFront, g.bottom), b: ring(suiteFront, g.top) },
        ]),
        shared.std(0x16202e, {
            roughness: 0.15,
            metalness: 0.5,
            emissive: 0x3a3020,
            emissiveIntensity: 0.6,
            ...side,
        }),
        "pro.suites",
    );
    const rimTop = upper.top + ft(4);
    const clerestory = ctx.addMesh(
        bandGeometry([
            { a: ring(upper.back, rimTop), b: ring(upper.back, PRO_ROOF_Y) },
        ]),
        clerestoryMat,
        "pro.clerestory",
        false,
    );
    return { lower, upper, treads, clerestory, seatRows: bowl.seatRows };
}

/**
 * The roof: a fixed frame around the opening, two panels that slide over the
 * ends, and light bars and spots on the opening's edges. `setLighting` sets
 * the panels' target from the preset; `step` eases them toward it.
 */
function addRoof(ctx: ProContext, upper: BuiltTier) {
    const { shared, cx, cz, footprint } = ctx;
    const group = new Group();
    group.name = "pro.roof";
    const rx = ctx.ax + upper.back + ft(6);
    const rz = ctx.az + upper.back + ft(6);
    const ox = (footprint.maxX - footprint.minX) / 2 + OPENING_MARGIN_X;
    const oz = (footprint.maxZ - footprint.minZ) / 2 + OPENING_MARGIN_Z;
    const roofMat = shared.std(0xb9bcc2, { roughness: 0.7, side: DoubleSide });
    const slab = (
        name: string,
        [x0, x1, z0, z1]: [number, number, number, number],
        y = PRO_ROOF_Y,
    ) => {
        const m = new Mesh(shared.unitBox, roofMat);
        m.name = name;
        m.scale.set(x1 - x0, ROOF_THICKNESS, z1 - z0);
        m.position.set(cx + (x0 + x1) / 2, y, cz + (z0 + z1) / 2);
        m.castShadow = ctx.shadows;
        group.add(m);
        return m;
    };
    slab("pro.roofFrame", [-rx, rx, oz, rz]);
    slab("pro.roofFrame", [-rx, rx, -rz, -oz]);
    slab("pro.roofFrame", [-rx, -ox, -oz, oz]);
    slab("pro.roofFrame", [ox, rx, -oz, oz]);
    const panelY = PRO_ROOF_Y + PANEL_LIFT;
    const panels = [
        slab("pro.roofPanel", [-ox, 0, -oz, oz], panelY),
        slab("pro.roofPanel", [0, ox, -oz, oz], panelY),
    ];
    const panelX0 = panels.map((p) => p.position.x);
    const lights = addRoofLights(ctx, group, ox, oz);
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
        setLighting(preset: LightingPreset, snap: boolean) {
            if (!PRESETS.includes(preset)) return;
            const k = lightingValues(preset).kit;
            lights.set(k.barEmissive, k.roofSpotIntensity);
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

/** Light bars (in the roof group) and six spots on the opening's edges. */
function addRoofLights(ctx: ProContext, roof: Group, ox: number, oz: number) {
    const { shared, cx, cz } = ctx;
    const barMat = shared.std(0x30333a, {
        emissive: 0xffffff,
        emissiveIntensity: 0,
    });
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
        const bar = new Mesh(shared.unitBox, barMat);
        bar.name = "pro.roofBar";
        bar.scale.set(z ? ft(60) : ft(3), ft(3), z ? ft(3) : ft(60));
        bar.position.set(cx + x, PRO_ROOF_Y - ft(4), cz + z);
        roof.add(bar);
        const spot = new SpotLight(0xfff3e0, 0, 0, 0.7, 0.6, 0);
        spot.name = "pro.roofSpot";
        spot.position.set(cx + x, PRO_ROOF_Y - ft(6), cz + z);
        spot.target.position.set(cx + x * 0.2, 0, cz + z * 0.2);
        ctx.root.add(spot, spot.target);
        spots.push(spot);
    }
    ctx.own(() => spots.forEach((s) => s.dispose()));
    return {
        set(barEmissive: number, spotIntensity: number) {
            barMat.emissiveIntensity = barEmissive;
            spots.forEach((s) => (s.intensity = spotIntensity));
        },
    };
}

/** End-zone video boards hung under the roof, kept clear of the seats. */
function addBoards(ctx: ProContext, upper: BuiltTier, params: VenueParams) {
    const offset = boardClearOffset(upper);
    for (const sx of [-1, 1]) {
        const b = videoBoard(
            PRO_BOARD.width,
            PRO_BOARD.height,
            0,
            params.endZoneText || "OPENMARCH",
            "3D View",
            ctx.shared,
        );
        const x = ctx.cx + sx * (ctx.ax + offset);
        b.object.position.set(x, PRO_BOARD.y, ctx.cz);
        b.object.rotation.y = (-sx * Math.PI) / 2;
        b.object.traverse((o) => (o.castShadow = ctx.shadows && o.castShadow));
        ctx.root.add(b.object);
        ctx.own(() => b.dispose());
    }
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
        cam(
            "upperDeck",
            "seat",
            [cx + ft(60), upperRow.y, fz + upperRow.d],
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
