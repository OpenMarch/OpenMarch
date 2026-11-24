// cspell:ignore mullion mullions jamb jambs lintel soffit soffits fieldhouse
import {
    BackSide,
    Color,
    Group,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    type BufferGeometry,
    type Material,
} from "three";
import { setFlushBacking } from "../../environment";
import type { LightingPreset } from "../../types";
import { MeshBuilder, type P3 } from "../college/meshBuilder";
import {
    DIESEL_FACADE_BAND_HEIGHT,
    DIESEL_FACADE_BANDS,
    DIESEL_FACADE_BAY,
    dieselFacadeTextures,
    dieselWindowTextures,
    type DieselFacadeBand,
} from "./facadeTextures";
import type { DieselCtx, DieselFrame, DieselPart } from "./frame";
import { dieselLighting } from "./lighting";

/**
 * The outside of the Mark Diesel kit: the wall on the `BUILDING` outline from
 * the ground to the roof, both faces. Outside it is a brick fieldhouse on a
 * limestone base: bays of tall windows between piers, a cornice at the eaves,
 * brick gables at the north and south ends with a big window in each, and a
 * square entry tower at each corner. Inside it is a dark wall; the end windows
 * show the sky by day and go dark, with their steel grid, when the roof is
 * shut.
 *
 * Everything is merged into a handful of meshes, and none of them cast
 * shadows: the envelope must never throw one across the field.
 */

const H = DIESEL_FACADE_BAND_HEIGHT;

/** Limestone surround each side of an end window, meters. */
const WINDOW_FRAME = 3;
/** The corner entry towers: square, one facade bay a side. */
const TOWER_SIZE = DIESEL_FACADE_BAY;
/** How far a tower stands out past both walls it joins. */
const TOWER_PROUD = 5;
const TOWER_TOP = H.base + H.tower;
/** Brick piers between the bays (high quality). */
const PIER_WIDTH = 1.6;
const PIER_DEPTH = 0.7;
/** The fixed window in the south gable mirrors the operable north one. */
const SOUTH_WINDOW = true;

const LIMESTONE = 0xcdc3ab;
const DARK_METAL = new Color(0x2b2e33);
const TOWER_ROOF = new Color(0x3a3d42);

type XZ = [number, number];

/** A straight stretch of wall seen from outside: `t` runs left to right. */
interface Face {
    /** Its left end (seen from outside), in kit-root space. */
    o: XZ;
    /** Unit direction along the wall. */
    t: XZ;
    /** Unit outward normal. */
    n: XZ;
    len: number;
}

/** A flat-topped strip of one atlas band. */
interface Seg {
    band: DieselFacadeBand;
    y0: number;
    y1: number;
}

/** The face centered on `c` that looks along `n`. */
function faceAt(c: XZ, n: XZ, len: number): Face {
    const t: XZ = [n[1], -n[0]];
    return {
        o: [c[0] - (t[0] * len) / 2, c[1] - (t[1] * len) / 2],
        t,
        n,
        len,
    };
}

/** The point `s` meters along a face, `d` meters out from it. */
function at(f: Face, s: number, d = 0): XZ {
    return [f.o[0] + f.t[0] * s + f.n[0] * d, f.o[1] + f.t[1] * s + f.n[1] * d];
}

const p3 = ([x, z]: XZ, y: number): P3 => [x, y, z];

/** Plain brick from `y0` to `y1`, in strips no taller than the band. */
function plainStack(y0: number, y1: number): Seg[] {
    const out: Seg[] = [];
    for (let y = y0; y < y1 - 1e-6; y += H.plain)
        out.push({ band: "plain", y0: y, y1: Math.min(y1, y + H.plain) });
    return out;
}

/** Heights and plan of the facade, from the kit's frame. */
export function dieselFacadeLayout(frame: DieselFrame) {
    const { BUILDING: B, WINDOW_WALL: W, ROOF } = frame;
    const bodyTop = H.base + H.body;
    // The windowed attic and its cornice sit right under the eaves.
    const atticBottom = Math.max(bodyTop, B.eaveY - H.attic);
    return {
        halfX: B.halfX,
        halfZ: B.halfZ,
        corner: B.cornerRadius,
        eaveY: B.eaveY,
        ridgeY: B.ridgeY,
        /**
         * The roof deck's edge covers this much of the wall's top (the deck
         * overhangs the wall); the cornice and copings sit just under it.
         */
        roofEdge: ROOF.thickness,
        baseTop: H.base,
        bodyTop,
        atticBottom,
        /** The wall from the ground to the eaves, bottom to top. */
        stack: [
            { band: "base", y0: 0, y1: H.base },
            { band: "body", y0: H.base, y1: bodyTop },
            ...plainStack(bodyTop, atticBottom),
            { band: "attic", y0: atticBottom, y1: B.eaveY },
        ] as Seg[],
        window: {
            centerZ: W.centerZ,
            halfWidth: W.width / 2,
            bottom: W.bottom,
            top: W.top,
            frame: WINDOW_FRAME,
            /** Kit-root x of each glazed end wall. */
            xs: SOUTH_WINDOW ? [-B.halfX, B.halfX] : [-B.halfX],
        },
        tower: { size: TOWER_SIZE, proud: TOWER_PROUD, top: TOWER_TOP },
    };
}

export type DieselFacadeLayout = ReturnType<typeof dieselFacadeLayout>;

/**
 * What each preset does to the facade, from the venue's own lighting values
 * (`dieselLighting`). When it is dark out the brick is washed from below and
 * the hall glows out through the end windows; from inside, the windows are
 * dark glass and steel with the town's lights behind them. By day they glow
 * with the sky instead.
 */
export function dieselFacadeLighting(preset: LightingPreset) {
    const v = dieselLighting(preset);
    /** 0 by day, 1 at night: how dark it is outside. */
    const dark = v.sky.windows;
    const closed = !v.kit.roofOpen;
    const nightOutside = dark > 0.5;
    return {
        /** The warm wash and lit windows on the brick. */
        wallGlow: 0.55 * dark,
        /** Limestone trim catching the plaza's light. */
        trimGlow: 0.16 * dark,
        /** Canopy soffits. */
        entriesLit: dark > 0,
        /** The hall glowing out through the end windows. */
        glassOutside: Math.max(closed ? 0.35 : 0, 1.7 * dark),
        /** What the end windows show from inside. */
        insideView: nightOutside ? ("night" as const) : ("day" as const),
        /**
         * Nearly black under a shut roof at night: from a seat the ends of
         * the hall are dark above the ribbon boards.
         */
        insideGlow: !nightOutside ? 1.15 : closed ? 0.07 : 0.9,
        /** How much of the hall's light the end windows give back inside. */
        insideShade: nightOutside && closed ? 0.1 : 1,
    };
}

interface SlabOptions {
    color?: Color;
    /** Texture coordinates, for a slab drawn with the wall atlas. */
    uv?: { u0: number; u1: number; side: number; v0: number; v1: number };
    /** The top and bottom faces. Default true. */
    caps?: boolean;
    /** The faces at `s0` and `s1`. Default both. */
    ends?: [boolean, boolean];
}

/**
 * A block standing on a face: its front `d1` meters out, and the faces back
 * to `d0`. There is no back, so nothing shows from inside the building.
 * `ya` is its [bottom, top] at `s0` and `yb` at `s1`.
 */
function slab(
    b: MeshBuilder,
    f: Face,
    s0: number,
    s1: number,
    ya: [number, number],
    yb: [number, number],
    d0: number,
    d1: number,
    { color, uv, caps = true, ends = [true, true] }: SlabOptions = {},
): void {
    const P = (s: number, y: number, d: number) => p3(at(f, s, d), y);
    const front = uv
        ? [
              [uv.u0, uv.v0],
              [uv.u1, uv.v0],
              [uv.u1, uv.v1],
              [uv.u0, uv.v1],
          ]
        : undefined;
    const side = uv
        ? [
              [0.01, uv.v0],
              [uv.side, uv.v0],
              [uv.side, uv.v1],
              [0.01, uv.v1],
          ]
        : undefined;
    type UVs = [number[], number[], number[], number[]];
    b.quad(
        P(s0, ya[0], d1),
        P(s1, yb[0], d1),
        P(s1, yb[1], d1),
        P(s0, ya[1], d1),
        front as UVs | undefined,
        color,
    );
    if (ends[0])
        b.quad(
            P(s0, ya[0], d0),
            P(s0, ya[0], d1),
            P(s0, ya[1], d1),
            P(s0, ya[1], d0),
            side as UVs | undefined,
            color,
        );
    if (ends[1])
        b.quad(
            P(s1, yb[0], d1),
            P(s1, yb[0], d0),
            P(s1, yb[1], d0),
            P(s1, yb[1], d1),
            side as UVs | undefined,
            color,
        );
    if (!caps) return;
    b.quad(
        P(s0, ya[1], d1),
        P(s1, yb[1], d1),
        P(s1, yb[1], d0),
        P(s0, ya[1], d0),
        undefined,
        color,
    );
    b.quad(
        P(s0, ya[0], d0),
        P(s1, yb[0], d0),
        P(s1, yb[0], d1),
        P(s0, ya[0], d1),
        undefined,
        color,
    );
}

interface RunOptions {
    /** Meters of wall per atlas tile. */
    tile: number;
    stack: Seg[];
    /** Plain brick from this height up to `top`. */
    fillFrom?: number;
    /** The wall's top at a point; needed with `fillFrom`. */
    top?: (x: number, z: number) => number;
    /** Extra breaks, in meters along the run, where `top` changes slope. */
    cuts?: number[];
}

/**
 * A stretch of wall from `a` to `c`, facing the side `c - a` turns right
 * from. Each `stack` strip is one quad; the fill above follows `top`.
 */
function run(b: MeshBuilder, a: XZ, c: XZ, o: RunOptions): void {
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (len < 1e-6) return;
    const point = (s: number): XZ => [
        a[0] + ((c[0] - a[0]) * s) / len,
        a[1] + ((c[1] - a[1]) * s) / len,
    ];
    // The strips break where the fill above them does, so their edges meet
    // vertex to vertex.
    const stops = [
        0,
        ...(o.cuts ?? []).filter((s) => s > 1e-6 && s < len - 1e-6),
        len,
    ].sort((p, q) => p - q);
    for (const seg of o.stack) {
        const [vA, vB] = DIESEL_FACADE_BANDS[seg.band];
        const part = Math.min(1, (seg.y1 - seg.y0) / H[seg.band]);
        const v1 = vA + (vB - vA) * part;
        for (let i = 0; i + 1 < stops.length; i++) {
            const q0 = point(stops[i]);
            const q1 = point(stops[i + 1]);
            const u0 = stops[i] / o.tile;
            const u1 = stops[i + 1] / o.tile;
            b.quad(
                p3(q0, seg.y0),
                p3(q1, seg.y0),
                p3(q1, seg.y1),
                p3(q0, seg.y1),
                [
                    [u0, vA],
                    [u1, vA],
                    [u1, v1],
                    [u0, v1],
                ],
            );
        }
    }
    if (o.fillFrom === undefined || !o.top) return;
    const [vA, vB] = DIESEL_FACADE_BANDS.plain;
    const v = (h: number) => vA + (vB - vA) * (h / H.plain);
    for (let i = 0; i + 1 < stops.length; i++) {
        const s0 = stops[i];
        const s1 = stops[i + 1];
        const q0 = point(s0);
        const q1 = point(s1);
        const top0 = o.top(q0[0], q0[1]);
        const top1 = o.top(q1[0], q1[1]);
        for (
            let y = o.fillFrom;
            y < Math.max(top0, top1) - 1e-6;
            y += H.plain
        ) {
            const h0 = Math.min(H.plain, Math.max(0, top0 - y));
            const h1 = Math.min(H.plain, Math.max(0, top1 - y));
            const uv = [
                [s0 / o.tile, vA],
                [s1 / o.tile, vA],
                [s1 / o.tile, v(h1)],
                [s0 / o.tile, v(h0)],
            ];
            // Where the gable meets the strip's foot the quad is a triangle.
            if (h1 > 1e-6)
                b.tri(
                    p3(q0, y),
                    p3(q1, y),
                    p3(q1, y + h1),
                    uv[0],
                    uv[1],
                    uv[2],
                );
            if (h0 > 1e-6)
                b.tri(
                    p3(q0, y),
                    p3(q1, y + h1),
                    p3(q0, y + h0),
                    uv[0],
                    uv[2],
                    uv[3],
                );
        }
    }
}

/** A tile width near the bay that fits a whole number of bays into `len`. */
function bayTile(len: number): { bays: number; tile: number } {
    const bays = Math.max(1, Math.round(len / DIESEL_FACADE_BAY));
    return { bays, tile: len / bays };
}

interface Builders {
    /** The envelope's outside face. */
    wall: MeshBuilder;
    /** The envelope's inside face: a few big polygons that share vertices. */
    inner: MeshBuilder;
    /** Towers and piers, in the wall atlas; seen from outside only. */
    brick: MeshBuilder;
    /** Limestone trim. */
    trim: MeshBuilder;
    /** Canopies and the towers' roofs, vertex colored. */
    metal: MeshBuilder;
    /** Canopy soffits, lit at night. */
    lit: MeshBuilder;
    glassOut: MeshBuilder;
    glassIn: MeshBuilder;
}

/** Brick piers on the bay lines of a run that starts at `s0` on `f`. */
function addPiers(
    b: Builders,
    f: Face,
    s0: number,
    bays: number,
    tile: number,
    stack: Seg[],
    top: number,
    ends: [boolean, boolean],
): void {
    const half = PIER_WIDTH / 2;
    for (let i = ends[0] ? 0 : 1; i <= (ends[1] ? bays : bays - 1); i++) {
        const s = s0 + i * tile;
        for (const seg of stack) {
            if (seg.y0 >= top) break;
            const y1 = Math.min(seg.y1, top);
            const [vA, vB] = DIESEL_FACADE_BANDS[seg.band];
            const y: [number, number] = [seg.y0, y1];
            slab(b.brick, f, s - half, s + half, y, y, 0, PIER_DEPTH, {
                caps: false,
                uv: {
                    u0: -half / tile,
                    u1: half / tile,
                    side: 0.04,
                    v0: vA,
                    v1: vA + ((vB - vA) * (y1 - seg.y0)) / H[seg.band],
                },
            });
        }
        const cap: [number, number] = [top, top + 0.6];
        slab(b.trim, f, s - half - 0.2, s + half + 0.2, cap, cap, 0, 0.95);
    }
}

/** A flat metal canopy over a row of doors, with a lit soffit. */
function addCanopy(b: Builders, f: Face, center: number, width: number): void {
    const s0 = center - width / 2;
    const s1 = center + width / 2;
    const y: [number, number] = [5.4, 5.9];
    slab(b.metal, f, s0, s1, y, y, 0, 3.6, { color: DARK_METAL });
    const P = (s: number, d: number) => p3(at(f, s, d), y[0] - 0.08);
    b.lit.quad(
        P(s0 + 0.3, 0.2),
        P(s1 - 0.3, 0.2),
        P(s1 - 0.3, 3.3),
        P(s0 + 0.3, 3.3),
    );
}

/** A side wall: the stack to the eaves, piers, a cornice and a mid entry. */
function addSideWall(
    b: Builders,
    f: Face,
    l: DieselFacadeLayout,
    high: boolean,
): void {
    const { bays, tile } = bayTile(f.len);
    run(b.wall, at(f, 0), at(f, f.len), { tile, stack: l.stack });
    if (!high) return;
    addPiers(b, f, 0, bays, tile, l.stack, l.atticBottom, [false, false]);
    const under = l.eaveY - l.roofEdge;
    const cornice: [number, number] = [under - 1.4, under];
    slab(b.trim, f, 0, f.len, cornice, cornice, 0, 0.6);
    addCanopy(b, f, f.len / 2, 2 * tile - 2);
}

/**
 * An end wall: two flanks like the side walls, a gable above them, and the
 * portal in the middle that holds the big window (when `glazed`).
 */
function addEndWall(
    b: Builders,
    f: Face,
    l: DieselFacadeLayout,
    roofY: (z: number) => number,
    glazed: boolean,
    high: boolean,
): void {
    const w = l.window;
    const top = (_x: number, z: number) => roofY(z);
    const zAt = (s: number) => at(f, s)[1];
    // `s` of the window's center: the face runs along z, either way.
    const center = (w.centerZ - f.o[1]) / f.t[1];
    const pA = center - w.halfWidth - w.frame;
    const pB = center + w.halfWidth + w.frame;
    /** Breaks where the gable crosses a strip of the fill, and the ridge. */
    const cuts = (from: number, s0: number, s1: number): number[] => {
        const out: number[] = [];
        const z0 = zAt(s0);
        const z1 = zAt(s1);
        const add = (z: number) => {
            const k = (z - z0) / (z1 - z0);
            if (k > 0 && k < 1) out.push(k * (s1 - s0));
        };
        add(0);
        const slope = roofY(0) - roofY(1);
        if (slope <= 0) return out;
        for (let y = from + H.plain; y < roofY(0); y += H.plain) {
            const z = (roofY(0) - y) / slope;
            add(z);
            add(-z);
        }
        return out;
    };
    const span = (s0: number, s1: number, o: Omit<RunOptions, "top">) =>
        run(b.wall, at(f, s0), at(f, s1), {
            ...o,
            top,
            cuts:
                o.fillFrom === undefined
                    ? []
                    : [...cuts(o.fillFrom, s0, s1), ...(o.cuts ?? [])],
        });

    // Flanks: the side walls' stack, then brick up into the gable.
    const flanks: [number, number][] = [
        [0, pA],
        [pB, f.len],
    ];
    flanks.forEach(([s0, s1], i) => {
        const { bays, tile } = bayTile(s1 - s0);
        span(s0, s1, { tile, stack: l.stack, fillFrom: l.eaveY });
        if (high)
            addPiers(b, f, s0, bays, tile, l.stack, l.atticBottom, [
                i === 1,
                i === 0,
            ]);
    });

    // The portal: doors under the window, brick over it.
    const { tile } = bayTile(pB - pA);
    const below: Seg[] = [
        { band: "base", y0: 0, y1: l.baseTop },
        ...plainStack(l.baseTop, w.bottom),
    ];
    span(pA, pB, {
        tile,
        stack: below,
        fillFrom: w.top,
        cuts: [w.frame, pB - pA - w.frame],
    });
    const between = plainStack(w.bottom, w.top);
    if (glazed) {
        span(pA, pA + w.frame, { tile, stack: between });
        span(pB - w.frame, pB, { tile, stack: between });
        const gA = pA + w.frame;
        const gB = pB - w.frame;
        const P = (s: number, y: number, d: number) => p3(at(f, s, d), y);
        b.glassOut.quad(
            P(gA, w.bottom, 0),
            P(gB, w.bottom, 0),
            P(gB, w.top, 0),
            P(gA, w.top, 0),
        );
        // The inside face, a hair in from the wall, reads left to right
        // for someone standing on the field.
        b.glassIn.quad(
            P(gB, w.bottom, -0.05),
            P(gA, w.bottom, -0.05),
            P(gA, w.top, -0.05),
            P(gB, w.top, -0.05),
        );
    } else {
        span(pA, pB, { tile, stack: between });
    }

    if (!high) return;
    // Limestone coping up both rakes of the gable, under the roof's edge.
    const mid = (0 - f.o[1]) / f.t[1];
    const rake = (s0: number, s1: number) => {
        const y0 = roofY(zAt(s0)) - l.roofEdge;
        const y1 = roofY(zAt(s1)) - l.roofEdge;
        slab(b.trim, f, s0, s1, [y0 - 1.2, y0], [y1 - 1.2, y1], 0, 0.6);
    };
    rake(0, mid);
    rake(mid, f.len);
    addCanopy(b, f, center, 2 * w.halfWidth * 0.62);
    if (!glazed) return;
    // The window's limestone surround: sill, jambs and lintel.
    const jamb: [number, number] = [w.bottom, w.top];
    slab(b.trim, f, pA, pA + w.frame, jamb, jamb, 0, 0.9);
    slab(b.trim, f, pB - w.frame, pB, jamb, jamb, 0, 0.9);
    const sill: [number, number] = [w.bottom - 1.5, w.bottom];
    slab(b.trim, f, pA - 0.6, pB + 0.6, sill, sill, 0, 1.3);
    const lintel: [number, number] = [w.top, w.top + 2.2];
    slab(b.trim, f, pA - 0.6, pB + 0.6, lintel, lintel, 0, 1.2);
}

/** A rounded corner of the envelope, from the ground to the roof. */
function addCorner(
    b: Builders,
    l: DieselFacadeLayout,
    roofY: (z: number) => number,
    sx: number,
    sz: number,
    startDeg: number,
    segments: number,
): void {
    const r = l.corner;
    const cx = sx * (l.halfX - r);
    const cz = sz * (l.halfZ - r);
    const pt = (i: number): XZ => {
        const a = ((startDeg - (90 * i) / segments) * Math.PI) / 180;
        return [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
    };
    for (let i = 0; i < segments; i++)
        run(b.wall, pt(i), pt(i + 1), {
            tile: DIESEL_FACADE_BAY,
            stack: [],
            fillFrom: 0,
            top: (_x, z) => roofY(z),
        });
}

/**
 * A corner entry tower: a brick box on a limestone base with doors on its
 * two street faces, standing out past both walls. Only the parts outside
 * the envelope are drawn.
 */
function addTower(
    b: Builders,
    l: DieselFacadeLayout,
    sx: number,
    sz: number,
    high: boolean,
): void {
    const { size, proud, top } = l.tower;
    const inset = size - proud;
    const outX = sx * (l.halfX + proud);
    const outZ = sz * (l.halfZ + proud);
    const midX = sx * (l.halfX + proud - size / 2);
    const midZ = sz * (l.halfZ + proud - size / 2);
    const stack: Seg[] = [
        { band: "base", y0: 0, y1: l.baseTop },
        { band: "tower", y0: l.baseTop, y1: top },
    ];
    const street = [
        faceAt([outX, midZ], [sx, 0], size),
        faceAt([midX, outZ], [0, sz], size),
    ];
    const returns = [
        faceAt(
            [sx * (l.halfX + proud / 2), sz * (l.halfZ - inset)],
            [0, -sz],
            proud,
        ),
        faceAt(
            [sx * (l.halfX - inset), sz * (l.halfZ + proud / 2)],
            [-sx, 0],
            proud,
        ),
    ];
    for (const f of [...street, ...returns])
        run(b.brick, at(f, 0), at(f, f.len), { tile: size, stack });

    // A flat roof over everything outside the envelope, so nobody looks
    // down into the tower from the air.
    const roofY = top - 0.4;
    const deck = (x0: number, x1: number, z0: number, z1: number) => {
        const [xa, xb] = [Math.min(x0, x1), Math.max(x0, x1)];
        const [za, zb] = [Math.min(z0, z1), Math.max(z0, z1)];
        b.metal.quad(
            [xa, roofY, zb],
            [xb, roofY, zb],
            [xb, roofY, za],
            [xa, roofY, za],
            undefined,
            TOWER_ROOF,
        );
    };
    const inX = sx * (l.halfX - inset);
    const inZ = sz * (l.halfZ - inset);
    deck(sx * l.halfX, outX, inZ, outZ);
    deck(inX, sx * l.halfX, sz * l.halfZ, outZ);
    deck(
        sx * (l.halfX - l.corner),
        sx * l.halfX,
        sz * (l.halfZ - l.corner),
        sz * l.halfZ,
    );

    if (!high) return;
    const parapet: [number, number] = [top - 1.2, top + 0.3];
    // An end that lies on the envelope would show from inside: leave it off.
    const onEnvelope = ([x, z]: XZ) =>
        Math.abs(x) < l.halfX + 1e-6 && Math.abs(z) < l.halfZ + 1e-6;
    for (const f of [...street, ...returns])
        slab(b.trim, f, 0, f.len, parapet, parapet, -0.5, 0.35, {
            ends: [!onEnvelope(at(f, 0)), !onEnvelope(at(f, f.len))],
        });
    for (const f of street) addCanopy(b, f, size / 2, size - 3);
}

/**
 * The inside face of the envelope, wound like the outside (the material
 * draws its back). Each wall is one polygon and neighbors share their
 * corner vertices, so no light leaks through a seam into the dark bowl.
 */
function addInterior(
    b: Builders,
    l: DieselFacadeLayout,
    roofY: (z: number) => number,
    arc: number,
): void {
    const { halfX: hx, halfZ: hz, corner: r, window: w } = l;
    const loop: XZ[] = [];
    const corner = (sx: number, sz: number, startDeg: number) => {
        for (let i = 1; i < arc; i++) {
            const a = ((startDeg - (90 * i) / arc) * Math.PI) / 180;
            loop.push([
                sx * (hx - r) + Math.cos(a) * r,
                sz * (hz - r) + Math.sin(a) * r,
            ]);
        }
    };
    loop.push([-(hx - r), hz], [hx - r, hz]);
    corner(1, 1, 90);
    loop.push([hx, hz - r], [hx, -(hz - r)]);
    corner(1, -1, 0);
    loop.push([hx - r, -hz], [-(hx - r), -hz]);
    corner(-1, -1, -90);
    loop.push([-hx, -(hz - r)], [-hx, hz - r]);
    corner(-1, 1, 180);
    const uv = [0, 0];
    const tri = (p: P3, q: P3, s: P3) => b.inner.tri(p, q, s, uv, uv, uv);
    loop.forEach((a, i) => {
        const c = loop[(i + 1) % loop.length];
        const A = p3(a, 0);
        const B = p3(c, 0);
        const C = p3(c, roofY(c[1]));
        const D = p3(a, roofY(a[1]));
        const end = Math.abs(a[0]) === hx && a[0] === c[0];
        if (!end) {
            tri(A, B, C);
            tri(A, C, D);
            return;
        }
        const R: P3 = [a[0], roofY(0), 0];
        if (!w.xs.includes(a[0])) {
            tri(A, B, C);
            tri(A, C, R);
            tri(A, R, D);
            return;
        }
        // Around the window: `h1`/`h4` are its corners on `a`'s side.
        const za = w.centerZ + Math.sign(a[1] - c[1]) * w.halfWidth;
        const zc = w.centerZ - Math.sign(a[1] - c[1]) * w.halfWidth;
        const h1: P3 = [a[0], w.bottom, za];
        const h2: P3 = [a[0], w.bottom, zc];
        const h3: P3 = [a[0], w.top, zc];
        const h4: P3 = [a[0], w.top, za];
        tri(A, B, h2);
        tri(A, h2, h1);
        tri(B, C, h3);
        tri(B, h3, h2);
        tri(C, R, h3);
        tri(R, h4, h3);
        tri(R, D, h4);
        tri(D, A, h1);
        tri(D, h1, h4);
    });
}

/** The Mark Diesel kit's outer wall, end windows and corner towers. */
export function buildDieselFacade(ctx: DieselCtx): DieselPart {
    const { frame, quality } = ctx;
    const high = quality === "high";
    const l = dieselFacadeLayout(frame);
    const roofY = frame.BUILDING.roofY;
    const b: Builders = {
        wall: new MeshBuilder(),
        inner: new MeshBuilder(),
        brick: new MeshBuilder(),
        trim: new MeshBuilder(),
        metal: new MeshBuilder(),
        lit: new MeshBuilder(),
        glassOut: new MeshBuilder(),
        glassIn: new MeshBuilder(),
    };

    const r = l.corner;
    const sideLen = 2 * (l.halfX - r);
    const endLen = 2 * (l.halfZ - r);
    // West (+Z) and east (-Z): the long walls under the eaves.
    addSideWall(b, faceAt([0, l.halfZ], [0, 1], sideLen), l, high);
    addSideWall(b, faceAt([0, -l.halfZ], [0, -1], sideLen), l, high);
    // North (-X) holds the operable window; south (+X) a fixed one.
    addEndWall(b, faceAt([-l.halfX, 0], [-1, 0], endLen), l, roofY, true, high);
    addEndWall(
        b,
        faceAt([l.halfX, 0], [1, 0], endLen),
        l,
        roofY,
        SOUTH_WINDOW,
        high,
    );
    const arc = high ? 4 : 2;
    addCorner(b, l, roofY, 1, 1, 90, arc);
    addCorner(b, l, roofY, 1, -1, 0, arc);
    addCorner(b, l, roofY, -1, -1, -90, arc);
    addCorner(b, l, roofY, -1, 1, 180, arc);
    for (const sx of [-1, 1])
        for (const sz of [-1, 1]) addTower(b, l, sx, sz, high);
    addInterior(b, l, roofY, arc);

    const root = new Group();
    root.name = "diesel.facade";
    const geometries: BufferGeometry[] = [];
    const materials: Material[] = [];
    const add = (
        name: string,
        builder: MeshBuilder,
        material: Material,
    ): Mesh | null => {
        const geo = builder.build();
        if (!geo) return null;
        geometries.push(geo);
        const mesh = new Mesh(geo, material);
        mesh.name = name;
        // Nothing here casts: the envelope must not shade the field.
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        root.add(mesh);
        return mesh;
    };
    const own = <M extends Material>(m: M): M => {
        materials.push(m);
        return m;
    };

    const textures = dieselFacadeTextures(high ? 1 : 0.5);
    const outsideMat = own(
        new MeshStandardMaterial({
            map: textures.map,
            emissive: 0xffffff,
            emissiveMap: textures.emissive,
            emissiveIntensity: 0,
            roughness: 0.9,
        }),
    );
    // Behind the trim, piers and roof edge that sit flush on it.
    setFlushBacking(outsideMat);
    add("diesel.facade.wall", b.wall, outsideMat);
    add("diesel.facade.brick", b.brick, outsideMat);

    // The wall from inside: dark, as everything above the lights is.
    const insideMat = own(
        new MeshStandardMaterial({
            color: 0x15171b,
            roughness: 0.95,
            side: BackSide,
        }),
    );
    setFlushBacking(insideMat);
    add("diesel.facade.interior", b.inner, insideMat);

    const trimMat = own(
        new MeshStandardMaterial({
            color: LIMESTONE,
            roughness: 0.85,
            emissive: 0xd8c9a8,
            emissiveIntensity: 0,
        }),
    );
    add("diesel.facade.trim", b.trim, trimMat);
    const metalMat = own(
        new MeshStandardMaterial({
            color: 0xffffff,
            vertexColors: true,
            roughness: 0.6,
        }),
    );
    add("diesel.facade.metal", b.metal, metalMat);
    const litMat = own(new MeshBasicMaterial({ color: 0xffdcae }));
    const lit = add("diesel.facade.lit", b.lit, litMat);

    const glass = dieselWindowTextures();
    const glassParams = {
        color: 0xffffff,
        map: glass.map,
        emissive: 0xffffff,
        emissiveIntensity: 0,
        roughness: 0.25,
        metalness: 0.2,
    };
    const glassOutMat = own(
        new MeshStandardMaterial({
            ...glassParams,
            emissiveMap: glass.interiorGlow,
        }),
    );
    const glassInMat = own(
        new MeshStandardMaterial({
            ...glassParams,
            emissiveMap: glass.dayView,
        }),
    );
    add("diesel.windowWall.outside", b.glassOut, glassOutMat);
    add("diesel.windowWall.inside", b.glassIn, glassInMat);

    return {
        object: root,
        setLighting(preset) {
            const k = dieselFacadeLighting(preset);
            outsideMat.emissiveIntensity = k.wallGlow;
            trimMat.emissiveIntensity = k.trimGlow;
            if (lit) lit.visible = k.entriesLit;
            glassOutMat.emissiveIntensity = k.glassOutside;
            glassInMat.emissiveMap =
                k.insideView === "day" ? glass.dayView : glass.nightView;
            glassInMat.emissiveIntensity = k.insideGlow;
            glassInMat.color.setScalar(k.insideShade);
            glassInMat.envMapIntensity = k.insideShade;
        },
        dispose() {
            geometries.forEach((g) => g.dispose());
            materials.forEach((m) => m.dispose());
            textures.map.dispose();
            textures.emissive.dispose();
            Object.values(glass).forEach((t) => t.dispose());
        },
    };
}
