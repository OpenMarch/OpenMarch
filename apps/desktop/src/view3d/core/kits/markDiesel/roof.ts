// cspell:ignore superframe superframes metalness purlin purlins roundel emissivemap subwoofer
import {
    BufferGeometry,
    Color,
    CylinderGeometry,
    DoubleSide,
    Float32BufferAttribute,
    Group,
    InstancedMesh,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    Quaternion,
    Vector3,
    type Material,
} from "three";
import {
    createRng,
    ft,
    paintCanvasTexture,
    setFlushBacking,
} from "../../environment";
import type { LightingPreset } from "../../types";
import { BandBuilder, Members } from "../pro/geometry";
import { roofDeckTexture, ROOF_TILE } from "../pro/textures";
import { DIESEL_FLAG_ASPECT, dieselFlagTexture } from "./brand";
import { dieselRoofCut } from "./cutaway";
import type { DieselCtx, DieselFrame, DieselPart } from "./frame";
import { dieselLighting, dieselRoofGlow } from "./lighting";

/**
 * The roof of the Mark Diesel kit, in kit-root space (`frame.ts`): a gable
 * whose ridge runs along X over the middle of the field.
 *
 * - The fixed deck covers the building outside the 300 ft x 588 ft opening.
 * - Two sliding panels cover the opening. They part at the ridge and roll
 *   down the slope, one to each sideline. Each is a grid of pale translucent
 *   sheets on its own steel: a rafter down the slope every 4.4 m and purlin
 *   trusses across them. The sheets are unlit and glow with the hall's light
 *   (`dieselRoofGlow`), brightest over the middle of the field, so the steel
 *   under them reads as a black lattice, as it does from a seat.
 * - Two superframes run the length of the building over the sidelines: box
 *   trusses two tiers deep on four lattice legs, their heavy diagonals a
 *   row of triangles against the pale clerestory behind the upper tier.
 * - Five transverse box trusses span between them under the panels' rails.
 *   Both of their chords follow the gable, so each is a triangle with its
 *   peak at the ridge; nothing in the roof is level but the superframes
 *   and the catwalks. Outside the superframes the side roofs fall to the
 *   eaves over the upper decks, on rafter trusses and purlins.
 * - Under each superframe hang the walkway with its handrails and, below
 *   it, the fixture rack the sports lights mount on (at `CATWALK_Y`), the
 *   drape's cable batten and the hall's air duct.
 * - Banners hang along the two inner transverse trusses, a flag hangs on
 *   the back superframe, and the speaker cluster (a truss frame, line arrays
 *   and hoist drums) hangs over the 50.
 *
 * Nothing here casts a shadow, so no roof line ever crosses the field. From
 * above, the half of the roof between the camera and the field is cut away
 * (both halves when the camera is over the field), like the pro dome. Low
 * quality hides the whole roof from above. The speaker cluster is cut away
 * as well when a camera is in the air over midfield above it, and the lamp
 * rows go with their halves (`cutaway.ts`).
 */

type Tint = [number, number, number];
const TOP: Tint = [1, 1, 1];
/**
 * The fixed deck's underside: ribbed gray steel deck, lit only by what the
 * hall's light gets up to it, a dim warm gray (`lightingValues`' hemisphere
 * for this venue). Dark as that is, the tone curve's black point would
 * crush the deck to black, so the tint lifts it clear: it reads a dark warm
 * gray behind the black steel (photos 8 and 13), not a void. The blue is
 * a little higher, as the hall's light has less of it. (Tints above 1 are
 * fine; the vertex colors are floats.)
 */
const UNDER: Tint = [2.3, 2.3, 2.5];
const EDGE: Tint = [0.5, 0.51, 0.53];

/**
 * Painted roof steel: a pale gray paint. What the hall's light makes of it
 * is `steelSpill`: gray near the sports lights, near black up in the roof.
 */
const STEEL = 0x7c7d7d;
const STEEL_WEB = 0x858685;
/**
 * The panels' own steel, as a fraction of the sheets' glow: near black, as
 * it reads against them.
 */
const PANEL_STEEL: Tint = [0.035, 0.036, 0.04];
/**
 * The lamps' spill on the steel, and its level at full lamps: a warm white,
 * so with the hall's dim warm-gray hemisphere the steel reads a dark
 * neutral gray (photos 2, 8 and 12).
 */
const STEEL_SPILL = 0xffeee0;
export const DIESEL_STEEL_SPILL = 0.12;
const STEEL_DARK = 0x16171a;
const COLUMN = 0x505256;
const RAIL = 0x3a3d44;
const WALK = 0x1c1d21;
/** Handrails, kick plates and the cable batten: bare aluminum. */
const ALUMINUM = 0xaeb2b9;
/** The speaker frame's truss: pale anodized aluminum. */
const TRUSS = 0xc4c1ab;
const CABINET = 0x25272b;
const GRILLE = 0x0d0e10;
const HOUSE_LIGHT = 0x121316;
/** The hall's air ducts: galvanized sheet. */
const DUCT = 0x8f9396;
const ROOF_RAIL = 0x4c4f55;

/** How far the deck overhangs the outer wall. */
const OVERHANG = 0.8;
/** The panels ride this far above the deck (underside, top). */
const PANEL_UNDER = 0.15;
const PANEL_TOP = 1.5;
/** Fraction of the roof gap closed per 1/60 s frame (as the pro dome). */
const ROOF_EASE = 0.06;
/** The two halves of the roof, by the sign of Z they cover. */
const HALVES = [1, -1] as const;

/**
 * The panels' sheets render at `dieselRoofGlow(preset).intensity` times this
 * over the middle of the field (1 is white before tone mapping).
 */
export const DIESEL_PANEL_GAIN = 50;
/**
 * The sheets' color where they are brightest, and where they are dim: a
 * pale warm gray, as photos 2, 8 and 12 show from the lower bowl.
 */
const SHEET_BRIGHT: Tint = [1, 1, 0.97];
const SHEET_DIM: Tint = [0.9, 0.89, 0.86];

/** Banners along a transverse truss: count, spacing and size, meters. */
export const DIESEL_BANNERS = {
    perTruss: 7,
    spacing: 10,
    width: 3,
    height: 7.5,
};

/**
 * Where the catwalk's parts hang, as meters below `CATWALK_Y` (the height of
 * the sports lights) and across from the superframe's centerline. The
 * drape's cables and the fixtures line up on these.
 */
export const CATWALK = {
    /** The fixture rack's pipes are this far toward the field. */
    rack: 0.9,
    /** The cable batten the drape's cables come down from. */
    batten: 2.2,
    /** The walkway's deck is never higher than this under the bottom chord. */
    deck: 1.7,
    /** The walkway's deck, above the lamps. */
    clear: 1.2,
    width: 1.8,
    /** Spacing of the hanger rods along the walkway. */
    hanger: 8.2,
    /** The air duct: below the lamps, and out from the field. */
    duct: 2.9,
    ductOut: 1.9,
};

/**
 * The superframes' own layout, meters. A station is 24 ft; the heavy
 * diagonals part at the top chord every `bay` (120 ft) and land on the
 * bottom chord `spread` either side, which is what photos 1, 2 and 7 show.
 */
const SUPERFRAME = {
    station: ft(24),
    bay: ft(120),
    spread: ft(36),
    /** Between its two faces, across the building. */
    width: 6,
};
/**
 * A superframe's leg (Modern Steel Construction, March 2009): a 35 ft
 * concrete pier above the street, then steel that splays from 26.6 ft at
 * the pier to 61 ft at the frame.
 */
const LEG = { pier: ft(35), base: ft(26.6), head: ft(61) };
/** Depth of the rafter trusses under the side roofs. */
const SIDE_RAFTER_DEPTH = 3.5;
/** The clerestory's sheeting, as a fraction of the brightest roof sheet. */
const CLERESTORY_LEVEL = 0.42;

/** The flag on the back superframe: width, height, and where along X. */
const FLAG = { width: 7 * DIESEL_FLAG_ASPECT, height: 7, x: -21 };

/**
 * The speaker cluster as the photos show it (the frame's `SPEAKER` is the
 * first pass's guess): a truss frame 14 m along the field by 11 m across at
 * 38 m, its line arrays hanging down to about 27 m.
 */
const CLUSTER = { y: 38, halfX: 7, halfZ: 5.5, section: 1 };

/**
 * Where a superframe's bottom chord stops being level: one station in from
 * the head of its leg. The frames land on the corner columns, so the chord
 * holds its height over the corners (where the video boards hang,
 * `boards.ts`) and drops only in a short haunch onto the leg.
 */
export function dieselSuperframeLevelHalf(frame: DieselFrame): number {
    return (
        frame.ROOF.superframes.halfLength - LEG.head / 2 - SUPERFRAME.station
    );
}

/** Height of a superframe's bottom chord at `x` (kit-root space). */
export function dieselSuperframeBottom(frame: DieselFrame, x: number): number {
    const f = frame.ROOF.superframes;
    const level = dieselSuperframeLevelHalf(frame);
    const over = Math.abs(x) - level;
    if (over <= 0) return f.bottomMid;
    const t = Math.min(1, over / (f.halfLength - level));
    return f.bottomMid + (f.bottomEnd - f.bottomMid) * t;
}

export interface DieselRoof extends DieselPart {
    /** Sets the panels' glow directly (color, level before the gain). */
    setPanelGlow(color: number, level: number): void;
}

/** Bays of sheet to a texture tile at low quality, each way. */
const LOW_SHEET_BAYS = 4;

/**
 * Translucent roof sheet, seen from below against the light: fine ribs
 * across the slope, a soft unevenness, and the shade of the steel it sits
 * on round its edge. At high quality one tile is one bay of the panel's
 * steel. At low quality (`bays` 4) one tile is four bays each way, and it
 * also carries what low quality leaves out of the geometry: a tone of its
 * own for every bay, the rafters and purlins between the drawn ones, and
 * the purlin trusses' webs, so the roof keeps its bay-by-bay read without
 * the steel.
 */
function sheetTexture(bays = 1) {
    const cell = bays > 1 ? 128 : 256;
    const size = cell * bays;
    return paintCanvasTexture(
        size,
        size,
        (g) => {
            g.fillStyle = "#f4f4f1";
            g.fillRect(0, 0, size, size);
            const rnd = createRng(11);
            for (let bx = 0; bx < bays; bx++)
                for (let by = 0; by < bays; by++) {
                    g.save();
                    g.translate(bx * cell, by * cell);
                    const c = cell;
                    if (bays > 1) {
                        // Each bay's own tone, as the high roof's levels vary.
                        const t = rnd();
                        g.fillStyle =
                            t > 0.5
                                ? `rgba(255,252,240,${(t - 0.5) * 0.36})`
                                : `rgba(40,38,34,${(0.5 - t) * 0.5})`;
                        g.fillRect(0, 0, c, c);
                    }
                    // Strips of sheet, a little uneven in tone.
                    const strips = 4;
                    for (let i = 0; i < strips; i++) {
                        const tone = rnd() > 0.5 ? "255,255,250" : "70,68,62";
                        g.fillStyle = `rgba(${tone},${0.04 + rnd() * 0.1})`;
                        g.fillRect((i * c) / strips, 0, c / strips, c);
                    }
                    // Fine ribs every half meter, across the slope.
                    const ribs = 12;
                    const k = c / 256;
                    for (let i = 0; i < ribs; i++) {
                        const y = ((i + 0.5) * c) / ribs;
                        g.fillStyle = "rgba(30,29,27,0.3)";
                        g.fillRect(0, y - 1.5 * k, c, Math.max(1, 3 * k));
                        g.fillStyle = "rgba(255,255,245,0.16)";
                        g.fillRect(0, y + 2 * k, c, Math.max(1, 3 * k));
                    }
                    // The lap between the two sheets of a bay, down the slope.
                    g.fillStyle = "rgba(20,20,19,0.6)";
                    g.fillRect(c / 2 - 2 * k, 0, Math.max(1, 4 * k), c);
                    // The steel's shade along the bay's edges.
                    const edge = c * 0.07;
                    for (const [x0, y0, x1, y1] of [
                        [0, 0, edge, 0],
                        [c, 0, c - edge, 0],
                        [0, 0, 0, edge],
                        [0, c, 0, c - edge],
                    ]) {
                        const shade = g.createLinearGradient(x0, y0, x1, y1);
                        shade.addColorStop(0, "rgba(18,18,17,0.75)");
                        shade.addColorStop(1, "rgba(18,18,17,0)");
                        g.fillStyle = shade;
                        g.fillRect(0, 0, c, c);
                    }
                    if (bays > 1) {
                        // The steel itself, crisp: a rafter down the slope
                        // (u) and a purlin across it (v) on the bay's edge.
                        g.fillStyle = "rgba(8,8,9,0.92)";
                        g.fillRect(0, 0, 5, c);
                        g.fillRect(0, 0, c, 4);
                        // Every other purlin is a truss: its webs zigzag
                        // along it, a little below and so softer.
                        if (by % 2 === 0) {
                            g.strokeStyle = "rgba(10,10,11,0.55)";
                            g.lineWidth = 2;
                            g.beginPath();
                            const depth = c * 0.14;
                            const n = 2;
                            for (let j = 0; j <= n * 2; j++) {
                                const x = (j * c) / (n * 2);
                                const y = j % 2 === 0 ? 2 : depth;
                                if (j === 0) g.moveTo(x, y);
                                else g.lineTo(x, y);
                            }
                            g.stroke();
                            g.fillStyle = "rgba(10,10,11,0.6)";
                            g.fillRect(0, depth - 1, c, 3);
                        }
                    }
                    g.restore();
                }
        },
        { repeat: true },
    );
}

export function buildDieselRoof(ctx: DieselCtx): DieselRoof {
    const { frame, shared, quality } = ctx;
    const { ROOF, BUILDING, CATWALK_Y } = frame;
    const { roofY } = ROOF;
    const high = quality === "high";
    const object = new Group();
    object.name = "markDiesel.roof";
    const disposers: (() => void)[] = [];
    const mat = (
        params: ConstructorParameters<typeof MeshStandardMaterial>[0],
    ) => {
        const m = new MeshStandardMaterial(params);
        disposers.push(() => {
            m.map?.dispose();
            if (m.emissiveMap !== m.map) m.emissiveMap?.dispose();
            m.dispose();
        });
        return m;
    };
    const mesh = (
        geo: BufferGeometry,
        material: Material,
        name: string,
        parent: Group,
    ) => {
        disposers.push(() => geo.dispose());
        const m = new Mesh(geo, material);
        m.name = name;
        parent.add(m);
        return m;
    };

    const ox = ROOF.opening.halfX;
    const oz = ROOF.opening.halfZ;
    const HX = BUILDING.halfX + OVERHANG;
    const HZ = BUILDING.halfZ + OVERHANG;
    const T = ROOF.thickness;
    /** The panels' own half-extents: they lap the opening's edges. */
    const px = ox + 0.8;
    const pz = oz + 1.2;
    /** Rafter spacing: ten to a bay between transverse trusses. */
    const rafter = (ROOF.transverse.xs[3] - ROOF.transverse.xs[2]) / 10;
    /** Purlin lines of a panel, as |z|: eight bays inside its edge girders. */
    const PURLIN_BAYS = 8;
    const purlinEdge = 0.6;
    const purlinPitch = (pz - 2 * purlinEdge) / PURLIN_BAYS;
    const purlinZ = (k: number) => purlinEdge + k * purlinPitch;

    /** A quad with plan-mapped UVs, into a tinted band builder. */
    const quad = (
        b: BandBuilder,
        points: [number, number, number][],
        tint: Tint,
        uv: (p: [number, number, number]) => [number, number] = (p) => [
            p[0] / ROOF_TILE,
            p[2] / ROOF_TILE,
        ],
    ) => {
        const [p0, p1, p2, p3] = points;
        for (const p of [p0, p1, p2, p0, p2, p3]) {
            b.pos.push(...p);
            b.uv.push(...uv(p));
            b.color.push(...tint);
        }
    };
    /** A sloped rectangle of roof at `lift` above the roof line. */
    const slab = (
        b: BandBuilder,
        x0: number,
        x1: number,
        z0: number,
        z1: number,
        lift: number,
        tint: Tint,
        uv?: (p: [number, number, number]) => [number, number],
    ) =>
        quad(
            b,
            [
                [x0, roofY(z0) + lift, z0],
                [x1, roofY(z0) + lift, z0],
                [x1, roofY(z1) + lift, z1],
                [x0, roofY(z1) + lift, z1],
            ],
            tint,
            uv,
        );
    /** A vertical face along X at `z`, or along Z at `x`, between two lifts. */
    const faceX = (
        b: BandBuilder,
        x0: number,
        x1: number,
        z: number,
        lifts: [number, number],
    ) =>
        quad(
            b,
            [
                [x0, roofY(z) + lifts[0], z],
                [x1, roofY(z) + lifts[0], z],
                [x1, roofY(z) + lifts[1], z],
                [x0, roofY(z) + lifts[1], z],
            ],
            EDGE,
        );
    const faceZ = (
        b: BandBuilder,
        x: number,
        z0: number,
        z1: number,
        lifts: [number, number],
    ) =>
        quad(
            b,
            [
                [x, roofY(z0) + lifts[0], z0],
                [x, roofY(z1) + lifts[0], z1],
                [x, roofY(z1) + lifts[1], z1],
                [x, roofY(z0) + lifts[1], z0],
            ],
            EDGE,
        );

    const deckMat = setFlushBacking(
        mat({
            // Solid deck: the hall's roof has no skylights.
            map: roofDeckTexture({ skylights: false }),
            roughness: 0.75,
            vertexColors: true,
            side: DoubleSide,
        }),
        2,
    );
    // The sheets are lit from behind, not by the hall: unlit, so they stay
    // the color of the glow.
    const sheetMap = sheetTexture(high ? 1 : LOW_SHEET_BAYS);
    /** Bays to a texture tile, each way. */
    const tileBays = high ? 1 : LOW_SHEET_BAYS;
    const panelMat = new MeshBasicMaterial({
        map: sheetMap,
        vertexColors: true,
        side: DoubleSide,
    });
    panelMat.name = "markDiesel.roofPanelGlow";
    disposers.push(() => {
        sheetMap.dispose();
        panelMat.dispose();
    });
    // Paint, not bare metal: it takes the hall's light, not the turf's green
    // from the environment map. The lamps' spill on it is the material's
    // emissive color times each member's own color, which carries how much
    // of that spill reaches it (`steelSpill`).
    const steelMat = shared.std(0xffffff, {
        roughness: 0.7,
        metalness: 0,
        envMapIntensity: 0,
        emissive: STEEL_SPILL,
        emissiveIntensity: 0,
    });
    steelMat.name = "markDiesel.roofSteel";
    steelMat.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
            "#include <emissivemap_fragment>",
            "#include <emissivemap_fragment>\n#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\n\ttotalEmissiveRadiance *= vColor.rgb;\n#endif",
        );
    };
    steelMat.customProgramCacheKey = () => "markDiesel.roofSteel";

    /**
     * How bright a sheet is, 0..1: brightest over the middle of the field,
     * dimmer past the banner trusses and toward the panel's edges.
     */
    const sheetLevel = (x: number, z: number): number => {
        // The two bays over the field, between the banner trusses, take
        // most of its light and stand out from the rest (photo 2); the bays
        // past them fall off toward the ends of the panels (photos 8 and 9).
        const bay = Math.abs(x) < ROOF.transverse.xs[3] ? 1 : 0.24;
        const along = 0.5 + 0.5 * Math.exp(-((x / 58) ** 2));
        // Brightest in a band either side of the ridge, darker over the
        // ridge's own truss and toward the superframes.
        const a = Math.abs(z) / pz;
        const across = a < 0.2 ? 0.58 : a < 0.66 ? 1 : 0.6;
        return 0.06 + 0.94 * bay * along * across;
    };
    /**
     * The roof was sheeted in lots: blocks of four bays that have weathered
     * a little differently, which is what breaks the glow into patches.
     */
    const lot = (i: number, k: number, half: number): number => {
        const n = Math.sin((i >> 2) * 12.9898 + (k >> 1) * 78.233 + half * 37);
        return 0.78 + 0.34 * (n * 43758.5453 - Math.floor(n * 43758.5453));
    };

    // Low quality hides its whole roof from above, so both halves share one
    // group, one deck and one set of steel, and the panels have no top.
    const whole = high
        ? null
        : {
              group: new Group(),
              deck: new BandBuilder(true),
              clerestory: new BandBuilder(true),
              steel: new Members(),
          };
    if (whole) {
        whole.group.name = "markDiesel.roofAll";
        object.add(whole.group);
    }
    const halves = HALVES.map((s) => {
        const group = whole?.group ?? new Group();
        if (!whole) {
            group.name = s > 0 ? "markDiesel.roofWest" : "markDiesel.roofEast";
            object.add(group);
        }

        // The fixed deck: the slope outside the opening, and the two ends.
        const deck = whole?.deck ?? new BandBuilder(true);
        for (const [lift, tint] of [
            [0, TOP],
            [-T, UNDER],
        ] as [number, Tint][]) {
            slab(deck, -HX, HX, s * oz, s * HZ, lift, tint);
            for (const e of [-1, 1])
                slab(
                    deck,
                    Math.min(e * ox, e * HX),
                    Math.max(e * ox, e * HX),
                    0,
                    s * oz,
                    lift,
                    tint,
                );
        }
        faceX(deck, -ox, ox, s * oz, [-T, 0]);
        faceX(deck, -HX, HX, s * HZ, [-T, 0]);
        for (const e of [-1, 1]) {
            faceZ(deck, e * ox, 0, s * oz, [-T, 0]);
            faceZ(deck, e * HX, 0, s * HZ, [-T, 0]);
        }
        if (!whole) mesh(deck.build(), deckMat, "markDiesel.roofDeck", group);

        // The sliding panel over this half of the opening.
        const panel = new Group();
        panel.name = "markDiesel.roofPanel";
        group.add(panel);
        if (high) {
            const top = new BandBuilder(true);
            slab(top, -px, px, 0, s * pz, PANEL_TOP, TOP);
            faceX(top, -px, px, 0, [PANEL_UNDER, PANEL_TOP]);
            faceX(top, -px, px, s * pz, [PANEL_UNDER, PANEL_TOP]);
            for (const e of [-1, 1])
                faceZ(top, e * px, 0, s * pz, [PANEL_UNDER, PANEL_TOP]);
            mesh(top.build(), deckMat, "markDiesel.roofPanelTop", panel);
        }
        // The underside, sheet by sheet: one quad to a bay of the panel's
        // steel, each with its own level, so the closed roof is a patchwork
        // of glowing sheets and not one card.
        const under = new BandBuilder(true);
        const rnd = createRng(s > 0 ? 5 : 9);
        const xs = [-px];
        for (let x = -Math.floor(px / rafter) * rafter; x < px; x += rafter)
            xs.push(x);
        xs.push(px);
        const zs = [0];
        for (let k = 1; k < PURLIN_BAYS; k++) zs.push(purlinZ(k));
        zs.push(pz);
        const sheetUv = (p: [number, number, number]): [number, number] => [
            p[0] / rafter / tileBays,
            (Math.abs(p[2]) - purlinEdge) / purlinPitch / tileBays,
        ];
        // Low quality lays four bays of sheet to a quad.
        const stepX = high ? 1 : 4;
        const stepZ = high ? 1 : 4;
        for (let i = 0; i + 1 < xs.length; i += stepX)
            for (let k = 0; k + 1 < zs.length; k += stepZ) {
                const x0 = xs[i];
                const x1 = xs[Math.min(xs.length - 1, i + stepX)];
                const z0 = zs[k];
                const z1 = zs[Math.min(zs.length - 1, k + stepZ)];
                // Past the last rafter is the panel's edge girder, not sheet.
                const sheet =
                    Math.abs(x0 + x1) / 2 < Math.floor(px / rafter) * rafter;
                const level = sheet
                    ? sheetLevel((x0 + x1) / 2, (z0 + z1) / 2) *
                      lot(i, k, s) *
                      (0.92 + rnd() * 0.16)
                    : 0.02;
                const warm = Math.pow(Math.min(1, level), 0.6);
                const tint = SHEET_DIM.map(
                    (dim, c) => level * (dim + (SHEET_BRIGHT[c] - dim) * warm),
                ) as Tint;
                slab(under, x0, x1, s * z0, s * z1, PANEL_UNDER, tint, sheetUv);
            }
        addPanelSteel(under, s);
        mesh(under.build(), panelMat, "markDiesel.roofPanelUnder", panel);
        const clerestory = whole?.clerestory ?? new BandBuilder(true);
        addClerestory(clerestory, s);
        if (!whole)
            mesh(clerestory.build(), panelMat, "markDiesel.clerestory", group);
        return { s, group, panel, steel: whole?.steel ?? new Members() };
    });
    if (whole) {
        mesh(whole.deck.build(), deckMat, "markDiesel.roofDeck", whole.group);
        mesh(
            whole.clerestory.build(),
            panelMat,
            "markDiesel.clerestory",
            whole.group,
        );
    }
    const steelOf = (z: number) => halves[z >= 0 ? 0 : 1].steel;

    // What hangs over the middle: the speaker cluster, banners and flags.
    const center = new Group();
    center.name = "markDiesel.roofCenter";
    object.add(center);
    // The cluster's frame is its own draw at every quality, so it can be
    // cut away (`dieselRoofCut`); at low quality the arrays share it.
    const rig = new Members();
    // The arrays, the platform and its rods: what hangs under the frame.
    const arrays = whole ? rig : new Members();

    /**
     * How much of the hall's light a piece of roof steel gets, by where it
     * is: the lamps' back-spill and the field's bounce reach the bottom of
     * the superframes and the catwalks, and little gets up under the roof.
     * Baked into the steel's color, as the bowl bakes its own spill.
     */
    const steelSpill = (p: Vector3): number => {
        // What is on top of the roof keeps its own color.
        if (p.y > roofY(p.z) - T) return 1;
        // So does what hangs well below the lights (the speaker cluster).
        if (p.y < CATWALK_Y - 8) return 1;
        const rise = Math.min(
            1,
            Math.max(0, (p.y - CATWALK_Y - 2) / (ROOF.ridgeY - CATWALK_Y - 2)),
        );
        const along = 0.2 + 0.8 * Math.exp(-((p.x / 78) ** 2));
        return (0.16 + 0.7 * (1 - rise) ** 2.2) * along;
    };
    const built: InstancedMesh[] = [];
    const build = (
        members: Members,
        name: string,
        parent: Group,
        spill = false,
    ) => {
        const m = members.build(shared.unitBox, steelMat, name);
        if (spill) {
            const at = new Matrix4();
            const p = new Vector3();
            const c = new Color();
            for (let i = 0; i < m.count; i++) {
                m.getMatrixAt(i, at);
                m.getColorAt(i, c);
                m.setColorAt(
                    i,
                    c.multiplyScalar(steelSpill(p.setFromMatrixPosition(at))),
                );
            }
            if (m.instanceColor) m.instanceColor.needsUpdate = true;
        }
        m.receiveShadow = false;
        parent.add(m);
        built.push(m);
    };

    addSuperframes();
    addTransverse();
    addFixedPurlins();
    addCatwalks();
    addSpeakerCluster();
    if (high) addRoofTop();
    addBanners();
    addFlags();

    if (whole) build(whole.steel, "markDiesel.steel", whole.group, true);
    else
        halves.forEach((h) =>
            build(h.steel, "markDiesel.steel", h.group, true),
        );
    build(rig, "markDiesel.speakerFrame", center);
    if (!whole) build(arrays, "markDiesel.speakerArrays", center);
    disposers.push(() => built.forEach((m) => m.dispose()));

    // 1 is open (each panel parked over its fixed slope), 0 is closed.
    let open = 0;
    let target = 0;
    let first = true;
    const place = () =>
        halves.forEach(({ s, panel }) =>
            panel.position.set(0, -open * oz * ROOF.pitch, s * open * oz),
        );
    const glow = new Color();
    const setPanelGlow = (color: number, level: number) => {
        glow.setHex(color).multiplyScalar(level * DIESEL_PANEL_GAIN);
        panelMat.color.copy(glow);
    };

    return {
        object,
        setPanelGlow,
        setLighting(preset: LightingPreset) {
            const k = dieselLighting(preset).kit;
            // The moon's blue hemisphere otherwise paints the roof top blue.
            const shade = k.lampsOn ? 0.5 : 1;
            deckMat.color.setScalar(shade);
            // Under the lamps the deck's underside takes the hall's light
            // (the hemisphere and its baked tint), not the environment map.
            deckMat.envMapIntensity = k.lampsOn ? 0 : 1;
            // The field's own light is what lifts the closed panels.
            const { color, intensity } = dieselRoofGlow(preset);
            setPanelGlow(color, intensity);
            steelMat.emissiveIntensity = k.lampsOn
                ? DIESEL_STEEL_SPILL * k.barEmissive
                : 0;
            target = k.roofOpen ? 1 : 0;
            if (first) {
                first = false;
                open = target;
                place();
            }
        },
        onFrame({ cameraPosition, dt }) {
            const cut = dieselRoofCut(frame, cameraPosition, high);
            halves.forEach(({ s, group }) => {
                group.visible = !cut.half(s);
            });
            center.visible = !cut.center;
            const gap = target - open;
            if (gap === 0) return;
            const ease = 1 - Math.pow(1 - ROOF_EASE, Math.max(0, dt) * 60);
            open = Math.abs(gap) < 0.001 ? target : open + gap * ease;
            place();
        },
        dispose() {
            disposers.forEach((d) => d());
            object.clear();
        },
    };

    /**
     * A planar truss between chords given as functions of `t` (0..1): the
     * chords, a vertical at every node and Warren diagonals between each
     * pair of chords, mirrored from one tier to the next.
     */
    function lattice(
        m: Members,
        chords: ((t: number) => Vector3)[],
        bays: number,
        size: { chord: number; web: number; post: number },
    ): void {
        for (let i = 0; i <= bays; i++) {
            const here = chords.map((c) => c(i / bays));
            m.beam(here[0], here[here.length - 1], size.post, STEEL_WEB);
            if (i === bays) break;
            const next = chords.map((c) => c((i + 1) / bays));
            here.forEach((p, k) => {
                const outer = k === 0 || k === here.length - 1;
                m.beam(p, next[k], outer ? size.chord : size.web, STEEL);
                if (k + 1 === here.length) return;
                const rising = (i + k) % 2 === 0;
                m.beam(
                    rising ? here[k + 1] : p,
                    rising ? next[k] : next[k + 1],
                    size.web,
                    STEEL_WEB,
                );
            });
        }
    }

    /** Height of a superframe's bottom chord at `x`. */
    function superframeBottom(x: number): number {
        return dieselSuperframeBottom(frame, x);
    }

    /**
     * Heights of a superframe's three chords at `x`: top, middle, bottom.
     * The top and middle chords are level; the bottom one drops to the legs.
     */
    function superframeChords(x: number): [number, number, number] {
        // Under the deck, so nothing pokes through the roof from the air.
        const top = ROOF.superframes.top - T - 0.2;
        return [
            top,
            (top + ROOF.superframes.bottomMid) / 2,
            superframeBottom(x),
        ];
    }

    /**
     * The two superframes: box trusses the length of the building, two
     * tiers deep. What reads from a seat is the row of big triangles: heavy
     * diagonals that part at the top chord and land on the bottom one, every
     * 120 ft. Behind the upper tier is the clerestory's pale sheeting
     * (`addClerestory`); the lower tier is laced with lighter steel, and
     * the catwalk hangs under it. Each end stands on a lattice leg that
     * splays up to the frame from a concrete pier.
     */
    function addSuperframes(): void {
        const f = ROOF.superframes;
        const levelHalf = dieselSuperframeLevelHalf(frame);
        const { station, bay, spread, width } = SUPERFRAME;
        const half = width / 2;
        const faces = high ? [-half, half] : [0];
        const L = f.halfLength;
        const n = Math.floor((L - 1) / station);
        for (const s of HALVES) {
            const m = steelOf(s);
            const z = s * f.z;
            const at = (x: number, k: 0 | 1 | 2, face: number) =>
                new Vector3(x, superframeChords(x)[k], z + face);
            for (const face of faces) {
                m.beam(at(-L, 0, face), at(L, 0, face), 1.3, STEEL);
                m.beam(at(-L, 1, face), at(L, 1, face), 1, STEEL);
                m.beam(
                    at(-levelHalf, 2, face),
                    at(levelHalf, 2, face),
                    1.3,
                    STEEL,
                );
                for (const e of [-1, 1]) {
                    m.beam(
                        at(e * levelHalf, 2, face),
                        at(e * L, 2, face),
                        1.3,
                        STEEL,
                    );
                    m.beam(at(e * L, 0, face), at(e * L, 2, face), 1.1, STEEL);
                }
                // The triangles: a pair of heavy diagonals from each apex
                // on the top chord down to the bottom chord.
                for (let x = bay / 2; x + spread < L; x += bay)
                    for (const e of [-1, 1])
                        for (const foot of [-spread, spread])
                            m.beam(
                                at(e * x, 0, face),
                                at(e * x + foot, 2, face),
                                0.9,
                                STEEL,
                                1.5,
                            );
            }
            if (high) {
                // A girt across the clerestory, just inside its sheeting.
                const girt =
                    (superframeChords(0)[0] + superframeChords(0)[1]) / 2;
                m.beam(
                    new Vector3(-L, girt, z + s * (half - 0.3)),
                    new Vector3(L, girt, z + s * (half - 0.3)),
                    0.25,
                    STEEL_WEB,
                );
                for (let i = -n; i <= n; i++) {
                    const x = i * station;
                    for (const face of faces) {
                        m.beam(at(x, 0, face), at(x, 2, face), 0.4, STEEL_WEB);
                        if (i === n) continue;
                        // The lower tier's lacing.
                        const up = ((i % 2) + 2) % 2 === 0;
                        m.beam(
                            at(x, up ? 2 : 1, face),
                            at(x + station, up ? 1 : 2, face),
                            0.32,
                            STEEL_WEB,
                        );
                    }
                    for (const k of [0, 1, 2] as const)
                        m.beam(at(x, k, -half), at(x, k, half), 0.5, STEEL);
                    if (i === n) continue;
                    // Bracing in the plane of the bottom chords.
                    const flip = ((i % 2) + 2) % 2 === 0 ? half : -half;
                    m.beam(
                        at(x, 2, -flip),
                        at(x + station, 2, flip),
                        0.4,
                        STEEL_WEB,
                    );
                }
            }
            for (const e of [-1, 1]) addLeg(m, e * L, z, faces);
        }
    }

    /**
     * A superframe's leg: a concrete pier to above the street, and on it a
     * steel lattice that splays along the frame as it rises to the bottom
     * chord, with a heavy diagonal from each head up to the top chord.
     */
    function addLeg(m: Members, x: number, z: number, faces: number[]): void {
        const f = ROOF.superframes;
        const half = SUPERFRAME.width / 2;
        const pier = BUILDING.streetY + LEG.pier;
        m.box(
            new Vector3(x, pier / 2, z),
            [LEG.base + 2.6, pier, 2 * half + 2.6],
            COLUMN,
        );
        const lifts = 4;
        const at = (side: number, t: number, face: number) =>
            new Vector3(
                x + (side * (LEG.base + (LEG.head - LEG.base) * t)) / 2,
                pier + (f.bottomEnd - pier) * t,
                z + face,
            );
        const top = superframeChords(x)[0];
        for (const face of faces) {
            for (const side of [-1, 1]) {
                m.beam(at(side, 0, face), at(side, 1, face), 1.1, STEEL);
                m.beam(
                    at(side, 1, face),
                    new Vector3(x, top, z + face),
                    0.9,
                    STEEL,
                    1.3,
                );
            }
            m.beam(at(-1, 1, face), at(1, 1, face), 1.3, STEEL);
            if (!high) continue;
            for (let j = 0; j < lifts; j++) {
                const [t0, t1] = [j / lifts, (j + 1) / lifts];
                m.beam(at(-1, t0, face), at(1, t0, face), 0.45, STEEL_WEB);
                m.beam(at(-1, t0, face), at(1, t1, face), 0.4, STEEL_WEB);
                m.beam(at(1, t0, face), at(-1, t1, face), 0.4, STEEL_WEB);
            }
        }
        if (!high) return;
        for (let j = 0; j <= lifts; j++)
            for (const side of [-1, 1])
                m.beam(
                    at(side, j / lifts, -half),
                    at(side, j / lifts, half),
                    0.45,
                    STEEL_WEB,
                );
    }

    /**
     * The clerestory: pale ribbed sheeting behind the upper tier of a
     * superframe, from the middle chord to the top one. It takes the same
     * glow as the panels, so the frame's triangles stand dark against it.
     */
    function addClerestory(b: BandBuilder, s: number): void {
        const f = ROOF.superframes;
        const { station, width } = SUPERFRAME;
        const z = s * (f.z + width / 2 + 0.15);
        const [top, mid] = superframeChords(0);
        // One bay of sheet to a station, whatever the tile holds.
        const uv = (p: [number, number, number]): [number, number] => [
            (p[1] - mid) / (top - mid) / tileBays,
            p[0] / station / tileBays,
        ];
        const step = station * (high ? 1 : 5);
        const n = Math.ceil(f.halfLength / step);
        for (let i = -n; i < n; i++) {
            const x0 = Math.max(-f.halfLength, i * step);
            const x1 = Math.min(f.halfLength, (i + 1) * step);
            const x = (x0 + x1) / 2;
            const level =
                CLERESTORY_LEVEL * (0.3 + 0.7 * Math.exp(-((x / 62) ** 2)));
            const tint = SHEET_DIM.map((c) => c * level) as Tint;
            quad(
                b,
                [
                    [x0, mid, z],
                    [x1, mid, z],
                    [x1, top, z],
                    [x0, top, z],
                ],
                tint,
                uv,
            );
        }
    }

    /**
     * Height of a transverse truss's top and bottom chords at `z`. Between
     * the superframes both follow the gable, `ROOF.transverse.depth` apart:
     * the truss is a triangle with its peak at the ridge. The top chord runs
     * clear under the sliding panels' own steel. Over the side roofs the
     * same line carries on as a shallow rafter truss down to the eave.
     */
    function transverseChords(z: number): [top: number, bottom: number] {
        const t = ROOF.transverse;
        if (Math.abs(z) <= t.halfSpan) return [t.topY(z) - 1.7, t.bottomY(z)];
        const top = roofY(z) - T - 0.2;
        return [top, top - SIDE_RAFTER_DEPTH];
    }

    /**
     * Five peaked box trusses from superframe to superframe, under the
     * panels' rails, one half in each half of the roof. The middle one
     * carries the spine of ducts and cable trays. Outside the superframes
     * each carries on as a rafter truss under the side roof.
     */
    function addTransverse(): void {
        const t = ROOF.transverse;
        const bays = high ? 5 : 3;
        const faces = high ? [-t.width / 2, t.width / 2] : [0];
        const sideFrom = t.halfSpan + SUPERFRAME.width / 2 + 0.2;
        const sideTo = BUILDING.halfZ - 1.5;
        for (const x of t.xs)
            for (const s of HALVES) {
                const m = steelOf(s);
                const at = (which: 0 | 1, face: number) => (k: number) =>
                    new Vector3(
                        x + face,
                        transverseChords(s * t.halfSpan * k)[which],
                        s * t.halfSpan * k,
                    );
                for (const face of faces)
                    lattice(m, [at(0, face), at(1, face)], bays, {
                        chord: 0.95,
                        web: 0.6,
                        post: 0.45,
                    });
                if (faces.length > 1)
                    for (let i = 0; i <= bays; i++) {
                        const k = i / bays;
                        for (const which of [0, 1] as const)
                            m.beam(
                                at(which, faces[0])(k),
                                at(which, faces[1])(k),
                                0.45,
                                STEEL,
                            );
                        if (i === bays) break;
                        // Bracing in the plane of the bottom chords.
                        for (const flip of [0, 1])
                            m.beam(
                                at(1, faces[flip])(k),
                                at(1, faces[1 - flip])((i + 1) / bays),
                                0.3,
                                STEEL_WEB,
                            );
                    }
                // The rafter truss over the side roof.
                const side = (which: 0 | 1) => (k: number) => {
                    const z = s * (sideFrom + (sideTo - sideFrom) * k);
                    return new Vector3(x, transverseChords(z)[which], z);
                };
                if (high)
                    lattice(m, [side(0), side(1)], 8, {
                        chord: 0.5,
                        web: 0.3,
                        post: 0.3,
                    });
                else m.beam(side(1)(0), side(1)(1), 0.5, STEEL);
                const end = s * (ROOF.opening.halfZ - 4);
                if (Math.abs(x) === t.xs[3]) {
                    // The banner trusses carry a service walkway.
                    m.beam(
                        new Vector3(x, transverseChords(0)[1] + 0.5, 0),
                        new Vector3(x, transverseChords(end)[1] + 0.5, end),
                        1.5,
                        STEEL_DARK,
                        0.3,
                    );
                }
                if (x !== 0) continue;
                // The spine: a duct and cable trays hung under the truss.
                m.beam(
                    new Vector3(0, transverseChords(0)[1] - 0.9, 0),
                    new Vector3(0, transverseChords(end)[1] - 0.9, end),
                    2.6,
                    STEEL_DARK,
                    1.3,
                );
            }
    }

    /**
     * A sliding panel's own steel, which slides with it: a rafter down the
     * slope under every seam between sheets, and across them a purlin truss
     * every other bay with a plain purlin between. It is only ever seen
     * against the sheets, so it is drawn with them, as unlit dark faces.
     */
    function addPanelSteel(b: BandBuilder, s: number): void {
        const side = new Vector3();
        const up = new Vector3();
        const dir = new Vector3();
        const corner = new Vector3();
        /** The underside and the two sides of a beam, `w` wide and `h` deep. */
        const beam = (p: Vector3, q: Vector3, w: number, h = w) => {
            dir.subVectors(q, p).normalize();
            side.set(dir.z, 0, -dir.x).normalize();
            up.crossVectors(dir, side);
            const at = (end: Vector3, i: number, j: number) => {
                corner
                    .copy(end)
                    .addScaledVector(side, (i * w) / 2)
                    .addScaledVector(up, (j * h) / 2);
                return [corner.x, corner.y, corner.z] as [
                    number,
                    number,
                    number,
                ];
            };
            const faces: [number, number, number, number][] = [
                [-1, -1, 1, -1],
                [-1, -1, -1, 1],
                [1, -1, 1, 1],
            ];
            for (const [i0, j0, i1, j1] of faces)
                quad(
                    b,
                    [
                        at(p, i0, j0),
                        at(q, i0, j0),
                        at(q, i1, j1),
                        at(p, i1, j1),
                    ],
                    PANEL_STEEL,
                    () => [0.5, 0.5],
                );
        };
        const lift = (y: number, z: number) => roofY(z) + y;
        const n = Math.floor(px / rafter);
        const every = high ? 1 : 2;
        for (let i = -n; i <= n; i += every) {
            const x = i * rafter;
            // A heavier rafter at each transverse truss and between.
            const heavy = i % 5 === 0;
            beam(
                new Vector3(x, lift(-0.25, 0), 0),
                new Vector3(x, lift(-0.25, pz), s * pz),
                heavy ? 0.5 : 0.3,
                0.6,
            );
        }
        for (let k = 0; k <= PURLIN_BAYS; k += every) {
            const z = s * purlinZ(k);
            const at = (x: number, y: number) => new Vector3(x, lift(y, z), z);
            if (k % 2 === 1) {
                beam(at(-px, -0.75), at(px, -0.75), 0.24);
                continue;
            }
            const [top, bottom] = [-0.75, -2.15];
            beam(at(-px, top), at(px, top), 0.3);
            beam(at(-px, bottom), at(px, bottom), 0.3);
            if (!high) continue;
            // Warren webs, a peak over every rafter.
            for (let i = -n; i < n; i++) {
                const mid = (i + 0.5) * rafter;
                beam(at(i * rafter, top), at(mid, bottom), 0.16);
                beam(at(mid, bottom), at((i + 1) * rafter, top), 0.16);
            }
        }
    }

    /**
     * Steel under the fixed deck, so it reads as framed and not a flat lid:
     * purlins across the side slopes with a rafter down the slope at every
     * other station of the superframes, and rafters over each end.
     */
    function addFixedPurlins(): void {
        if (!high) return;
        const y = -T - 0.35;
        const from = oz + SUPERFRAME.width / 2 + 0.2;
        for (const s of HALVES) {
            const m = steelOf(s);
            for (let z = oz + 5.8; z < HZ - 2; z += 5.8)
                m.beam(
                    new Vector3(-HX + 1, roofY(z) + y, s * z),
                    new Vector3(HX - 1, roofY(z) + y, s * z),
                    0.2,
                    STEEL,
                    0.4,
                );
            const pitch = 2 * SUPERFRAME.station;
            for (let x = pitch / 2; x < HX - 1; x += pitch)
                for (const e of [-1, 1])
                    m.beam(
                        new Vector3(e * x, roofY(from) + y - 0.5, s * from),
                        new Vector3(
                            e * x,
                            roofY(HZ - 1) + y - 0.5,
                            s * (HZ - 1),
                        ),
                        0.3,
                        STEEL,
                        0.8,
                    );
            for (const e of [-1, 1])
                for (let x = ox + rafter; x < HX - 1; x += rafter)
                    m.beam(
                        new Vector3(e * x, roofY(0.4) + y, s * 0.4),
                        new Vector3(e * x, roofY(oz) + y, s * oz),
                        0.2,
                        STEEL,
                        0.4,
                    );
        }
    }

    /**
     * What hangs under each superframe. The walkway runs just over the
     * lamps, on hanger rods from the bottom chord: a grating deck with kick plates and two handrails, on
     * hanger rods. Under it, on the field side, is the fixture rack: two
     * pipes at the height of the sports lights (`CATWALK_Y`), on drops from
     * the walkway. Below the lamps run the cable batten the drape hangs
     * from and, on the far side from the field, the hall's long air duct
     * with the house lights under it.
     */
    function addCatwalks(): void {
        const f = ROOF.superframes;
        const reach = Math.abs(frame.CATWALK_CORNERS[0][0]) + 4;
        // The walkway rides just over the lamps, on long hangers from the
        // chord (photo 2: the lamps hang a good way under the frame).
        const deckY = Math.min(
            f.bottomMid - CATWALK.deck,
            CATWALK_Y + CATWALK.clear,
        );
        const ductY = CATWALK_Y - CATWALK.duct;
        for (const s of HALVES) {
            const m = steelOf(s);
            const z = s * f.z;
            const run = (y: number, dz: number, w: number, c: number, h = w) =>
                m.beam(
                    new Vector3(-reach, y, z + dz),
                    new Vector3(reach, y, z + dz),
                    w,
                    c,
                    h,
                );
            run(deckY - 0.06, 0, CATWALK.width, WALK, 0.12);
            // The fixture rack, toward the field.
            const rackZ = -s * CATWALK.rack;
            for (const dy of high ? [0.45, -0.45] : [0]) {
                run(CATWALK_Y + dy, rackZ, 0.1, RAIL);
            }
            run(CATWALK_Y - CATWALK.batten, 0, 0.12, ALUMINUM);
            // The duct, in lengths with a gap at every other hanger.
            const ductZ = s * CATWALK.ductOut;
            const length = 2 * CATWALK.hanger;
            for (let x = -reach + 3; x + length - 1.2 <= reach; x += length)
                m.beam(
                    new Vector3(x, ductY, z + ductZ),
                    new Vector3(x + length - 1.2, ductY, z + ductZ),
                    1.1,
                    DUCT,
                    1,
                );
            if (!high) {
                run(deckY + 1.1, -s * 0.85, 0.07, ALUMINUM);
                continue;
            }
            for (const side of [-0.85, 0.85]) {
                run(deckY + 0.08, side, 0.04, ALUMINUM, 0.16);
                run(deckY + 0.55, side, 0.05, ALUMINUM);
                run(deckY + 1.1, side, 0.06, ALUMINUM);
            }
            const post = CATWALK.hanger / 4;
            let i = 0;
            for (let x = -reach; x <= reach + 0.01; x += post, i++) {
                for (const side of [-0.85, 0.85])
                    m.beam(
                        new Vector3(x, deckY, z + side),
                        new Vector3(x, deckY + 1.1, z + side),
                        0.05,
                        ALUMINUM,
                    );
                if (i % 4 === 0) {
                    // Hanger rods, the rack's drop and the duct's straps.
                    const chord = superframeBottom(x);
                    for (const side of [-0.85, 0.85])
                        m.beam(
                            new Vector3(x, deckY, z + side),
                            new Vector3(x, chord, z + side),
                            0.07,
                            RAIL,
                        );
                    m.beam(
                        new Vector3(x, CATWALK_Y - 0.6, z + rackZ),
                        new Vector3(x, deckY, z + rackZ),
                        0.08,
                        RAIL,
                    );
                    m.beam(
                        new Vector3(x, ductY, z + ductZ),
                        new Vector3(x, deckY, z + ductZ),
                        0.05,
                        RAIL,
                    );
                } else if (i % 4 === 2) {
                    // A house light under the duct, dark during a show.
                    m.box(
                        new Vector3(x, ductY - 1.25, z + ductZ),
                        [0.55, 0.6, 0.55],
                        HOUSE_LIGHT,
                    );
                    m.beam(
                        new Vector3(x, ductY - 0.95, z + ductZ),
                        new Vector3(x, ductY - 0.5, z + ductZ),
                        0.04,
                        RAIL,
                    );
                }
            }
        }
    }

    /**
     * A box truss from `a` to `b`: four chords `width` apart across and
     * `depth` apart down, laced on all four faces.
     */
    function boxTruss(
        m: Members,
        a: Vector3,
        b: Vector3,
        width: number,
        depth: number,
        bay: number,
        color: number,
    ): void {
        const along = new Vector3().subVectors(b, a);
        const bays = Math.max(1, Math.round(along.length() / bay));
        const side = new Vector3(-along.z, 0, along.x)
            .normalize()
            .multiplyScalar(width / 2);
        const corner = (t: number, k: number) =>
            new Vector3()
                .lerpVectors(a, b, t)
                .addScaledVector(side, k < 2 ? -1 : 1)
                .setY(a.y + (b.y - a.y) * t - (k % 3 === 0 ? 0 : depth));
        // Corners in order round the section: 0 top, 1 bottom, 2 bottom, 3 top.
        for (let k = 0; k < 4; k++)
            m.beam(corner(0, k), corner(1, k), 0.09, color);
        if (!high) return;
        for (let i = 0; i <= bays; i++)
            for (let k = 0; k < 4; k++) {
                const t = i / bays;
                m.beam(corner(t, k), corner(t, (k + 1) % 4), 0.05, color);
                if (i === bays) continue;
                const flip = i % 2 === 0 ? k : (k + 1) % 4;
                const other = i % 2 === 0 ? (k + 1) % 4 : k;
                m.beam(
                    corner(t, flip),
                    corner((i + 1) / bays, other),
                    0.05,
                    color,
                );
            }
    }

    /**
     * A line array hanging from `top`: cabinets that face `out` at the top
     * and tip further down and in toward the bottom, the J of a real hang.
     */
    function lineArray(
        top: Vector3,
        out: Vector3,
        boxes: number,
        tip: number,
    ): void {
        const [w, h, d] = [1.25, 0.48, 0.8];
        const p = top.clone();
        // Low quality hangs a few long cabinets in the same curve.
        const merge = high ? 1 : 4;
        for (let k = 0; k < boxes; k += merge) {
            const n = Math.min(merge, boxes - k);
            const a = tip * ((k + n / 2) / boxes) ** 1.7;
            const down = out
                .clone()
                .multiplyScalar(-Math.sin(a))
                .setY(-Math.cos(a));
            const face = out.clone().multiplyScalar(Math.cos(a));
            face.y = -Math.sin(a);
            const c = p.clone().addScaledVector(down, (h * n) / 2);
            arrays.beam(
                c.clone().addScaledVector(face, -d / 2),
                c.clone().addScaledVector(face, d / 2),
                w,
                CABINET,
                h * n * 0.95,
            );
            if (high)
                arrays.beam(
                    c.clone().addScaledVector(face, d / 2),
                    c.clone().addScaledVector(face, d / 2 + 0.06),
                    w * 0.96,
                    GRILLE,
                    h * 0.9,
                );
            p.addScaledVector(down, h * n);
        }
    }

    /**
     * The center-hung speaker cluster: a rectangle of aluminum box truss on
     * rods from the middle transverse truss, two cross trusses inside it, a
     * pair of line arrays hanging off each side and curling in under it, and
     * in the middle a round platform with the hoist drums on it and the
     * subwoofer stack under it.
     */
    function addSpeakerCluster(): void {
        const { x, z } = frame.SPEAKER;
        const { y, halfX, halfZ, section } = CLUSTER;
        const at = (dx: number, dy: number, dz: number) =>
            new Vector3(x + dx, y + dy, z + dz);
        const corners = [
            at(-halfX, 0, -halfZ),
            at(halfX, 0, -halfZ),
            at(halfX, 0, halfZ),
            at(-halfX, 0, halfZ),
        ];
        corners.forEach((a, i) =>
            boxTruss(rig, a, corners[(i + 1) % 4], section, section, 1, TRUSS),
        );
        for (const dz of [-halfZ / 3, halfZ / 3])
            boxTruss(
                rig,
                at(-halfX, 0, dz),
                at(halfX, 0, dz),
                0.6,
                section,
                1,
                TRUSS,
            );
        // Rods up to the truss overhead, and a bridle from each corner.
        const trussHalf = ROOF.transverse.width / 2;
        for (const sx of [-1, 1])
            for (const sz of [-1, 1]) {
                const hang = (dz: number) =>
                    new Vector3(
                        x + sx * trussHalf,
                        transverseChords(z + dz)[1],
                        z + dz,
                    );
                rig.beam(
                    at(sx * trussHalf, 0, sz * halfZ),
                    hang(sz * halfZ),
                    0.07,
                    RAIL,
                );
                rig.beam(
                    at(sx * halfX, 0, sz * halfZ),
                    hang(sz * 2),
                    0.06,
                    RAIL,
                );
            }

        // Two arrays to a side: the long ones play to the two sidelines.
        const hangY = -section - 0.35;
        for (const sz of [-1, 1])
            for (const sx of [-1, 1]) {
                lineArray(
                    at(sx * 3.4, hangY, sz * (halfZ - 0.2)),
                    new Vector3(0, 0, sz),
                    20,
                    0.95,
                );
                lineArray(
                    at(sx * (halfX - 0.2), hangY, sz * 2.6),
                    new Vector3(sx, 0, 0),
                    12,
                    0.8,
                );
            }

        // The middle: the subwoofer stack under a round platform.
        const platformY = y - 4.6;
        arrays.box(at(0, -4.6 - 2.1, 0), [1.9, 3.6, 1.9], GRILLE);
        for (const sx of [-1, 1])
            for (const sz of [-1, 1])
                arrays.beam(
                    new Vector3(x + sx * 2, platformY, z + sz * 1.6),
                    at(sx * 2, -section, (sz * halfZ) / 3),
                    0.06,
                    RAIL,
                );

        // Hoist drums and the platform: a handful of cylinders, one draw.
        if (!high) return;
        const cans: [Vector3, number, number, number][] = [
            [new Vector3(x, platformY - 0.2, z), 2.7, 0.4, GRILLE],
            [new Vector3(x - 0.75, platformY + 0.9, z), 0.6, 1.6, ALUMINUM],
            [new Vector3(x + 0.75, platformY + 0.75, z), 0.5, 1.3, ALUMINUM],
            [at(-1.1, 1.35, -halfZ), 0.95, 2.3, ALUMINUM],
            [at(1.0, 0.95, -halfZ), 0.6, 1.5, ALUMINUM],
            [at(1.1, 1.35, halfZ), 0.95, 2.3, ALUMINUM],
            [at(-1.0, 0.95, halfZ), 0.6, 1.5, ALUMINUM],
        ];
        const canGeo = new CylinderGeometry(1, 1, 1, 20);
        const canMat = shared.std(0xffffff, {
            roughness: 0.35,
            metalness: 0.7,
        });
        const canMesh = new InstancedMesh(canGeo, canMat, cans.length);
        canMesh.name = "markDiesel.speakerCans";
        const q = new Quaternion();
        cans.forEach(([p, r, h, color], i) => {
            canMesh.setMatrixAt(
                i,
                new Matrix4().compose(p, q, new Vector3(r, h, r)),
            );
            canMesh.setColorAt(i, new Color(color));
        });
        canMesh.instanceMatrix.needsUpdate = true;
        if (canMesh.instanceColor) canMesh.instanceColor.needsUpdate = true;
        center.add(canMesh);
        disposers.push(() => {
            canGeo.dispose();
            canMesh.dispose();
        });
    }

    /**
     * What breaks up the roof from the air: the five rails the panels ride
     * on and a cap along the ridge of the fixed ends.
     */
    function addRoofTop(): void {
        for (const s of HALVES) {
            const m = steelOf(s);
            for (const x of ROOF.transverse.xs)
                m.beam(
                    new Vector3(x, roofY(0) + 0.3, 0),
                    new Vector3(x, roofY(HZ) + 0.3, s * (HZ - 1)),
                    1.2,
                    ROOF_RAIL,
                    0.5,
                );
            for (const e of [-1, 1])
                m.box(
                    new Vector3(e * (ox + HX) * 0.5, roofY(0) + 0.3, s * 0.6),
                    [HX - ox, 0.6, 1.2],
                    ROOF_RAIL,
                );
        }
    }

    /** Two-sided vertical cards, one UV square each, in one geometry. */
    function cards(
        list: { center: Vector3; along: Vector3; w: number; h: number }[],
    ): BufferGeometry {
        const pos: number[] = [];
        const uv: number[] = [];
        for (const { center: c, along, w, h } of list) {
            const normal = new Vector3(-along.z, 0, along.x);
            // One face each way; a thin gap keeps them apart.
            for (const face of [1, -1]) {
                const o = c.clone().addScaledVector(normal, face * 0.03);
                const half = along.clone().multiplyScalar((face * w) / 2);
                const [l, r] = [o.clone().sub(half), o.clone().add(half)];
                const quad = [
                    [l, -h / 2, 0, 0],
                    [r, -h / 2, 1, 0],
                    [r, h / 2, 1, 1],
                    [l, -h / 2, 0, 0],
                    [r, h / 2, 1, 1],
                    [l, h / 2, 0, 1],
                ] as [Vector3, number, number, number][];
                for (const [p, dy, u, v] of quad) {
                    pos.push(p.x, p.y + dy, p.z);
                    uv.push(u, v);
                }
            }
        }
        const geo = new BufferGeometry();
        geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
        geo.setAttribute("uv", new Float32BufferAttribute(uv, 2));
        geo.computeVertexNormals();
        return geo;
    }

    /**
     * Where the rafter banners hang along the two inner transverse trusses,
     * in the plane of the truss, so they face the ends of the field. The
     * banners themselves are `banners.ts` (`markDiesel.rafterBanners`); this
     * hidden mesh only marks their slots under the trusses built here.
     */
    function addBanners(): void {
        const { perTruss, spacing, width, height } = DIESEL_BANNERS;
        const list = [ROOF.transverse.xs[1], ROOF.transverse.xs[3]].flatMap(
            (x) =>
                Array.from({ length: perTruss }, (_, i) => {
                    const z = (i - (perTruss - 1) / 2) * spacing;
                    const top = transverseChords(z)[1] - 0.5;
                    return {
                        center: new Vector3(x, top - height / 2, z),
                        along: new Vector3(0, 0, -1),
                        w: width,
                        h: height,
                    };
                }),
        );
        mesh(cards(list), steelMat, "markDiesel.banners", center).visible =
            false;
    }

    /**
     * The hall's flag, on the field side of the back superframe, hung by
     * its top edge in front of the diagonals.
     */
    function addFlags(): void {
        const f = ROOF.superframes;
        // Only the back superframe's: it faces the audience. The front one
        // would hang edge-on over the seats it faces away from.
        const list = [-1].map((s) => ({
            center: new Vector3(
                -s * FLAG.x,
                f.bottomMid + 1.2 + FLAG.height / 2,
                s * (f.z - 3.4),
            ),
            along: new Vector3(-s, 0, 0),
            w: FLAG.width,
            h: FLAG.height,
        }));
        const map = dieselFlagTexture();
        mesh(
            cards(list),
            mat({
                map,
                roughness: 0.85,
                emissive: 0xffffff,
                emissiveMap: map,
                emissiveIntensity: 0.14,
            }),
            "markDiesel.flags",
            center,
        );
    }
}
