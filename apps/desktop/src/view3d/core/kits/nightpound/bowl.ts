// cspell:ignore concourse vomitory vomitories soffit soffits emissivemap
import {
    BoxGeometry,
    BufferGeometry,
    Color,
    DoubleSide,
    Float32BufferAttribute,
    Group,
    Mesh,
    MeshBasicMaterial,
    MeshLambertMaterial,
    MeshStandardMaterial,
    Vector3,
    type Material,
    type Object3D,
    type Texture,
    type Vector3Tuple,
} from "three";
import { SIGN_RIBBON, signRibbonTexture } from "../../environment";
import type { LightingPreset, SeatRow } from "../../types";
import { mergedBoxes, type BoxSpec } from "../arena/geometry";
import {
    DIESEL_SUITE_TILE,
    dieselSectionNumberTexture,
    dieselSuiteFrontTexture,
    sectionAtlasCell,
} from "../markDiesel/seatTextures";
import { Members } from "../pro/geometry";
import {
    BANK_LIST,
    BANKS,
    BOWL,
    SEAT,
    bankPoint,
    bankTiers,
    bowlFill,
    endIsAisle,
    mitreHalf,
    nightpoundSectionNumber,
    rowExtent,
    rowSeats,
    tierAisles,
    tierBack,
    tierTop,
    type Bank,
    type TierName,
} from "./bowlPlan";
import {
    BOARD_ASPECT,
    TREAD_PLAIN,
    TREAD_TILE,
    BOARD_MARKS,
    nightpoundBoardTexture,
    nightpoundSeatTexture,
    nightpoundTreadTexture,
} from "./bowlTextures";
import {
    SEAT_HEIGHT,
    SEAT_PITCH,
    type NightpoundCtx,
    type NightpoundPart,
} from "./frame";
import { ARENA_CENTER_Z, DRAPE_Z, FLOOR } from "./plan";

export {
    BANKS,
    BOWL,
    bowlEye,
    bowlFill,
    nightpoundSectionNumber,
    type BankId,
    type BowlTier,
    type TierName,
} from "./bowlPlan";

/** The seating bowl: the stands, their walls and rails, and the two ends. */
export interface NightpoundBowl extends NightpoundPart {
    /** Seat rows in kit-root space, for the crowd and pick-a-seat. */
    seatRows: SeatRow[];
    /** How full the seat at a kit-root point is, 0 to 1. */
    fill(x: number, y: number, z: number): number;
}

type Tint = [number, number, number];
type Quad = [Vector3, Vector3, Vector3, Vector3];
type UvRect = [number, number, number, number];

const lin = (hex: number): Tint => {
    const c = new Color(hex);
    return [c.r, c.g, c.b];
};
const scale = ([r, g, b]: Tint, k: number): Tint => [r * k, g * k, b * k];
const mix = (a: number, b: number, t: number) =>
    a + (b - a) * Math.min(1, Math.max(0, t));

/**
 * Colors, from the 2022 to 2025 photos (docs/3d/nightpound.md). The seat
 * tints are brighter than the plastic's own color: the seat texture's grays
 * bring them back down.
 */
const SEAT_NAVY = scale(lin(0x1f2747), 1.5);
const SEAT_RED = scale(lin(0xc8102e), 1.7);
const CONCRETE = scale(lin(0x8a8782), 0.8);
const STEP = 0x7d7a75;
const NOSING = 0x2c2b29;
const WALL_NAVY = lin(0x14213d);
const WALL_ROYAL = lin(0x1f4fa3);
const FASCIA = lin(0x16181d);
const BLACK = lin(0x0e0f11);
const RED = lin(0xc8102e);
const BRICK = lin(0xb5532a);
const CARPET = lin(0x2b2d33);
const STEEL = 0x8d9196;
const STEEL_DARK = 0x33363c;
const PLAIN: Tint = [1, 1, 1];
const UV01: UvRect = [0, 0, 1, 1];

/**
 * The house lights on the bowl, by preset: the level each house-lit
 * material glows at, times its own color and each face's baked share
 * (`spill`). The stands stay readable in the show's light, as in WGI's
 * photos, and come up with the house lights.
 */
export const NIGHTPOUND_HOUSE = {
    seats: { house: 1.05, show: 0.42 },
    concrete: { house: 0.7, show: 0.26 },
    steel: { house: 0.32, show: 0.12 },
};

/**
 * Scales a material's emissive light by its vertex (or instance) colors, so
 * a house-lit surface glows in its own color with the stands' baked
 * falloff. Every material it patches shares one program per material type.
 */
function houseLit<M extends MeshLambertMaterial>(material: M): M {
    material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
            "#include <emissivemap_fragment>",
            "#include <emissivemap_fragment>\n#if defined( USE_COLOR )\n\ttotalEmissiveRadiance *= vColor.rgb;\n#endif",
        );
    };
    material.customProgramCacheKey = () => "nightpound.houseLit";
    return material;
}

/** Non-indexed quads and fans with UVs and vertex colors. */
class Quads {
    readonly pos: number[] = [];
    readonly uv: number[] = [];
    readonly color: number[] = [];

    get triangles(): number {
        return this.pos.length / 9;
    }

    /** `a`, `b` along the bottom, `c` above `b`, `d` above `a`. */
    add([a, b, c, d]: Quad, [u0, v0, u1, v1]: UvRect, tint: Tint): this {
        for (const p of [a, b, c, a, c, d]) this.pos.push(p.x, p.y, p.z);
        this.uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
        for (let k = 0; k < 6; k++) this.color.push(...tint);
        return this;
    }

    /** A convex polygon as a fan; `uv` maps each point. */
    poly(
        pts: Vector3[],
        tint: Tint,
        uv: (p: Vector3) => [number, number] = () => [0, 0.5],
    ): this {
        for (let i = 1; i + 1 < pts.length; i++)
            for (const p of [pts[0], pts[i], pts[i + 1]]) {
                this.pos.push(p.x, p.y, p.z);
                this.uv.push(...uv(p));
                this.color.push(...tint);
            }
        return this;
    }

    build(): BufferGeometry {
        const geo = new BufferGeometry();
        geo.setAttribute("position", new Float32BufferAttribute(this.pos, 3));
        geo.setAttribute("uv", new Float32BufferAttribute(this.uv, 2));
        geo.setAttribute("color", new Float32BufferAttribute(this.color, 3));
        geo.computeVertexNormals();
        return geo;
    }
}

/**
 * The share of the hall's light on the stands `d` out and `y` up: full at
 * the floor wall, lower up the bowl and lowest at the top of the upper
 * decks. Baked into the vertex colors.
 */
function spill(d: number, y: number): number {
    if (y < BOWL.concourse.y + 0.5) return mix(1, 0.74, d / 24);
    return mix(0.72, 0.5, (y - BOWL.upper.base) / 11.5);
}

/**
 * Nightpound's seating bowl, in kit-root space (`bowlPlan.ts` has the
 * plan):
 *
 * - the lower bowl, an octagon of eight banks: the telescopic 100s (out on
 *   the front, the ends and the front corners; folded away on the back for
 *   the drape and the tunnel), the cross aisle, the 200s, and on the two
 *   sides the red club rows and the concourse aisle;
 * - the 300s and 400s, one rake on the two sides only, with vomitories in
 *   their first rows;
 * - the ends: an open concourse behind the 200s under a black soffit, the
 *   LED ribbon on its fascia, the Flight Deck above it at +X and suites at
 *   -X; a terrace box over each corner;
 * - the navy floor wall with its cable rail and the boards on the end walls.
 *
 * Seats are textured cards (a back and a folded pan per row of a section),
 * so the whole bowl is a few thousand triangles of stands plus the rails
 * and aisle steps, which are instances of one box.
 */
export function buildBowl(ctx: NightpoundCtx): NightpoundBowl {
    const high = ctx.quality === "high";
    const object = new Group();
    object.name = "nightpound.bowl";
    const disposers: (() => void)[] = [];

    const treads = new Quads();
    const walls = new Quads();
    const seats = new Quads();
    const glass = new Quads();
    const ribbon = new Quads();
    const boards = new Quads();
    const suites = new Quads();
    const steel = new Members();
    const glow: BoxSpec[] = [];
    const seatRows: SeatRow[] = [];
    const plaquesAt: { quad: Quad; label: string }[] = [];

    const cz = ARENA_CENTER_Z;
    const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
    const P = (b: Bank, d: number, s: number, y: number) => {
        const [x, z] = bankPoint(b, d, s);
        return new Vector3(x, y, z);
    };
    const yaw = (b: Bank) => Math.atan2(b.nx, b.nz);

    /** A vertical wall from `a` to `b` (plan), `y0` to `y1`. */
    const wall = (
        a: Vector3,
        b: Vector3,
        y0: number,
        y1: number,
        tint: Tint,
        into = walls,
        uv: UvRect = UV01,
    ) =>
        into.add(
            [
                a.clone().setY(y0),
                b.clone().setY(y0),
                b.clone().setY(y1),
                a.clone().setY(y1),
            ],
            uv,
            tint,
        );
    /** A flat slab in the plain band of the tread texture. */
    const slab = (pts: Vector3[], tint: Tint) =>
        treads.poly(pts, tint, (p) => [
            (p.x + p.z) / TREAD_TILE,
            mix(TREAD_PLAIN[0], TREAD_PLAIN[1], 0.5),
        ]);

    /** A post-and-rail run from `a` to `b` (base points), `h` tall. */
    const railRun = (
        a: Vector3,
        b: Vector3,
        h: number,
        o: { post?: number; cables?: number; color?: number } = {},
    ) => {
        const len = a.distanceTo(b);
        if (len < 0.25) return;
        const color = o.color ?? STEEL;
        const up = V(0, h, 0);
        steel.beam(a.clone().add(up), b.clone().add(up), 0.05, color);
        const n = Math.max(
            1,
            Math.round(len / ((o.post ?? 1.5) * (high ? 1 : 2))),
        );
        for (let k = 0; k <= n; k++) {
            const p = a.clone().lerp(b, k / n);
            steel.beam(p, p.clone().add(up), 0.04, color);
        }
        if (!high) return;
        const cables = o.cables ?? 2;
        for (let c = 1; c <= cables; c++) {
            const lift = V(0, (h * c) / (cables + 1), 0);
            steel.beam(a.clone().add(lift), b.clone().add(lift), 0.014, color);
        }
    };
    /** A rail along a bank at offset `d`, between `[s0, s1]` less `gaps`. */
    const bankRail = (
        b: Bank,
        d: number,
        y: number,
        h: number,
        [s0, s1]: [number, number],
        gaps: [number, number][] = [],
        o: Parameters<typeof railRun>[3] = {},
    ) => {
        let from = s0;
        for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
            if (g1 <= from || g0 >= s1) continue;
            if (g0 > from) railRun(P(b, d, from, y), P(b, d, g0, y), h, o);
            from = Math.max(from, g1);
        }
        if (from < s1) railRun(P(b, d, from, y), P(b, d, s1, y), h, o);
    };
    /** A glass rail: a pane with a metal cap and end posts. */
    const glassRail = (a: Vector3, b: Vector3, h: number) => {
        wall(a, b, a.y, a.y + h, [0.62, 0.7, 0.75], glass);
        const up = V(0, h, 0);
        steel.beam(a.clone().add(up), b.clone().add(up), 0.05, STEEL);
        const n = Math.max(1, Math.round(a.distanceTo(b) / (high ? 1.8 : 6)));
        for (let k = 0; k <= n; k++) {
            const p = a.clone().lerp(b, k / n);
            steel.beam(p, p.clone().add(up), 0.035, STEEL);
        }
    };
    const aisleGaps = (b: Bank, name: TierName, width: number) =>
        tierAisles(b, name).map((s): [number, number] => [
            s - width / 2,
            s + width / 2,
        ]);
    /** A row's ends pulled in where an aisle runs along the mitre. */
    const railExtent = (
        b: Bank,
        name: TierName,
        d: number,
    ): [number, number] => {
        const [e0, e1] = rowExtent(b, name, d);
        return [
            e0 + (endIsAisle(b, name, 0) ? SEAT.endClear : 0),
            e1 - (endIsAisle(b, name, 1) ? SEAT.endClear : 0),
        ];
    };

    // ---- The banks: treads, risers, seats, aisle steps and handrails ----
    for (const b of BANK_LIST) {
        for (const { name, tier } of bankTiers(b)) {
            const upper = name === "300";
            const aisleW = upper ? BOWL.aisle.upper : BOWL.aisle.lower;
            const aisles = tierAisles(b, name);
            const flankBase = upper ? BOWL.concourse.y : 0;
            const seatTint = name === "club" ? SEAT_RED : SEAT_NAVY;
            // What the first riser stands on (none where a wall or a
            // fascia fronts the tier).
            const frontBase =
                name === "200"
                    ? BOWL.crossAisle.y
                    : name === "club"
                      ? tierTop(BOWL.mid)
                      : undefined;
            const vom = BOWL.vomitory;
            for (let i = 0; i < tier.rows; i++) {
                const d0 = tier.offset + i * tier.depth;
                const d1 = d0 + tier.depth;
                const y = tier.base + i * tier.rise;
                const light = spill(d0, y);
                const [a0, b0] = rowExtent(b, name, d0);
                const [a1, b1] = rowExtent(b, name, d1);
                const holes: [number, number][] =
                    upper && i < vom.rows
                        ? vom.at.map((s) => [
                              s - vom.width / 2,
                              s + vom.width / 2,
                          ])
                        : [];
                // The tread and its riser, in pieces between the holes.
                let from: [number, number] = [a0, a1];
                const piece = (to: [number, number]) => {
                    treads.add(
                        [
                            P(b, d0, from[0], y),
                            P(b, d0, to[0], y),
                            P(b, d1, to[1], y),
                            P(b, d1, from[1], y),
                        ],
                        [from[0] / TREAD_TILE, 0, to[0] / TREAD_TILE, 1],
                        scale(CONCRETE, light),
                    );
                    const below = i > 0 ? y - tier.rise : frontBase;
                    if (below !== undefined)
                        wall(
                            P(b, d0, from[0], 0),
                            P(b, d0, to[0], 0),
                            below,
                            y,
                            scale(CONCRETE, light * 0.62),
                        );
                };
                for (const [h0, h1] of holes) {
                    piece([h0, h0]);
                    from = [h1, h1];
                    // The vomitory's side walls under this row.
                    for (const s of [h0, h1])
                        wall(
                            P(b, d0, s, 0),
                            P(b, d1, s, 0),
                            BOWL.concourse.y,
                            y,
                            scale(FASCIA, 1.6),
                        );
                }
                piece([b0, b1]);
                // The row's ends: a wall down to the floor (hidden where
                // the next bank's rows meet it).
                const flank = scale(
                    name === "100" ? WALL_NAVY : upper ? FASCIA : CONCRETE,
                    upper ? 1.5 : light * 0.6,
                );
                for (const [e0, e1] of [
                    [a0, a1],
                    [b0, b1],
                ])
                    wall(P(b, d0, e0, 0), P(b, d1, e1, 0), flankBase, y, flank);

                // Seats: a back and a folded pan per run, and the crowd's row.
                const row = rowSeats(b, name, tier, i);
                const tint = scale(seatTint, light);
                for (const [s0, s1] of row.runs) {
                    const n = Math.round((s1 - s0) / SEAT_PITCH);
                    const card = (
                        dLo: number,
                        yLo: number,
                        dHi: number,
                        yHi: number,
                        v0: number,
                    ) =>
                        seats.add(
                            [
                                P(b, d1 - dLo, s0, y + yLo),
                                P(b, d1 - dLo, s1, y + yLo),
                                P(b, d1 - dHi, s1, y + yHi),
                                P(b, d1 - dHi, s0, y + yHi),
                            ],
                            [0, v0, n, v0 + 0.5],
                            tint,
                        );
                    card(0.15, 0.38, 0.07, 0.88, 0.5);
                    if (high) card(0.33, 0.2, 0.2, 0.62, 0);
                    const line = d1 - SEAT.setback;
                    const at = (s: number): Vector3Tuple => {
                        const p = P(b, line, s, y + SEAT_HEIGHT);
                        return [p.x, p.y, p.z];
                    };
                    seatRows.push({
                        points: [at(s0 + SEAT_PITCH / 2), at(s1)],
                        closed: false,
                        depth: tier.depth,
                        side: "neutral",
                    });
                }

                // Aisle steps: a half step on each tread, in the aisles
                // between sections and along the mitres at the bank's ends.
                const more =
                    i + 1 < tier.rows || (name === "200" && b.kind !== "end");
                const stepAt = (s: number, w: number) => {
                    if (!more) return;
                    const c = P(
                        b,
                        d0 + 0.75 * tier.depth,
                        s,
                        y + tier.rise / 4,
                    );
                    steel.box(
                        c,
                        [w, tier.rise / 2, tier.depth / 2],
                        new Color(STEP).multiplyScalar(light).getHex(),
                        yaw(b),
                    );
                    if (high)
                        steel.box(
                            P(
                                b,
                                d0 + 0.5 * tier.depth + 0.035,
                                s,
                                y + tier.rise / 2 + 0.004,
                            ),
                            [w, 0.012, 0.07],
                            NOSING,
                            yaw(b),
                        );
                };
                for (const s of aisles) {
                    if (upper && i < vom.rows && vom.at.includes(s)) continue;
                    stepAt(s, aisleW);
                }
                const dStep = d0 + 0.75 * tier.depth;
                const [x0, x1] = rowExtent(b, name, dStep);
                if (upper) {
                    stepAt(x0 + aisleW / 2, aisleW);
                    stepAt(x1 - aisleW / 2, aisleW);
                } else {
                    if (endIsAisle(b, name, 0)) stepAt(x0 + 0.34, 0.72);
                    if (endIsAisle(b, name, 1)) stepAt(x1 - 0.34, 0.72);
                }
            }

            // Handrails up the middle of the aisles, in short runs.
            const first = upper ? vom.rows + 1 : 1;
            const stride = high ? 4 : 8;
            const handrail = (sAt: (d: number) => number) => {
                for (let i = first; i + 2 < tier.rows; i += stride) {
                    const at = (k: number) => {
                        const d = tier.offset + (k + 0.5) * tier.depth;
                        return P(b, d, sAt(d), tier.base + k * tier.rise);
                    };
                    const [p, q] = [at(i), at(i + 2)];
                    const up = V(0, 0.95, 0);
                    steel.beam(
                        p.clone().add(up),
                        q.clone().add(up),
                        0.045,
                        STEEL,
                    );
                    for (const f of [p, q])
                        steel.beam(f, f.clone().add(up), 0.04, STEEL);
                }
            };
            for (const s of aisles) handrail(() => s);
            if (!upper && high && endIsAisle(b, name, 1))
                handrail((d) => rowExtent(b, name, d)[1]);
        }

        // ---- The cross aisle between the 100s and the 200s ----
        const ca = BOWL.crossAisle;
        const caBack = ca.offset + ca.width;
        {
            const [f0, f1] = rowExtent(b, "200", ca.offset);
            const [r0, r1] = rowExtent(b, "200", caBack);
            const tint = scale(CONCRETE, spill(ca.offset, ca.y) * 0.95);
            treads.add(
                [
                    P(b, ca.offset, f0, ca.y),
                    P(b, ca.offset, f1, ca.y),
                    P(b, caBack, r1, ca.y),
                    P(b, caBack, r0, ca.y),
                ],
                [
                    f0 / TREAD_TILE,
                    TREAD_PLAIN[0],
                    f1 / TREAD_TILE,
                    TREAD_PLAIN[1],
                ],
                tint,
            );
            // The rail in front of the 200s, on their curb.
            bankRail(
                b,
                caBack + 0.04,
                BOWL.mid.base,
                0.9,
                railExtent(b, "200", caBack),
                aisleGaps(b, "200", BOWL.aisle.lower),
                { color: STEEL_DARK },
            );
        }
        if (b.lower) {
            // The rail behind the 100s' last row, along the aisle.
            bankRail(
                b,
                ca.offset + 0.03,
                ca.y,
                1.07,
                railExtent(b, "100", ca.offset),
                aisleGaps(b, "100", BOWL.aisle.lower),
            );
            addFloorWall(b);
        }

        // ---- Behind the 200s ----
        if (b.kind === "side") addSide(b);
        else if (b.kind === "end") addEnd(b);
        else addCorner(b);
        addPlaques(b);
    }
    addBackCorners();
    addEnclosure();

    /**
     * The floor wall in front of row A: navy (royal blue on the corners),
     * 1.07 m tall with a cap and a post-and-cable rail, and on the end
     * walls the black boards facing the floor.
     */
    function addFloorWall(b: Bank) {
        const h = BOWL.wall.height;
        const [s0, s1] = rowExtent(b, "100", 0);
        const tint = b.kind === "corner" ? WALL_ROYAL : WALL_NAVY;
        wall(P(b, 0, s0, 0), P(b, 0, s1, 0), 0, h, scale(tint, 1.25));
        const [c0, c1] = rowExtent(b, "100", 0.14);
        walls.poly(
            [
                P(b, 0, s0, h),
                P(b, 0, s1, h),
                P(b, 0.14, c1, h),
                P(b, 0.14, c0, h),
            ],
            scale(tint, 1.7),
        );
        wall(
            P(b, 0.14, c0, 0),
            P(b, 0.14, c1, 0),
            BOWL.lower.base,
            h,
            scale(tint, 0.9),
        );
        const top = BOWL.lower.base + BOWL.wall.rail;
        bankRail(b, 0.07, h, top - h, [s0, s1], [], { cables: 1 });
        if (b.kind !== "end") return;
        // Boards along the end wall, from the front corner to the drape.
        const bh = 0.9;
        const bw = bh * BOARD_ASPECT;
        const gap = 0.12;
        const n = Math.floor((s1 - s0 - 0.4 + gap) / (bw + gap));
        const start = (s0 + s1) / 2 - (n * (bw + gap) - gap) / 2;
        for (let k = 0; k < n; k++) {
            const a = start + k * (bw + gap);
            // Logo, On The Move, address, in turn (`BOARD_MARKS`).
            const v0 = 1 - ((k % BOARD_MARKS) + 1) / BOARD_MARKS;
            wall(
                P(b, -0.03, a, 0),
                P(b, -0.03, a + bw, 0),
                0.08,
                0.08 + bh,
                PLAIN,
                boards,
                // Seen from the floor a bank's `s` runs right to left.
                [1, v0, 0, v0 + 1 / BOARD_MARKS],
            );
        }
    }

    /**
     * A side (front or back): the club rows' rails, the concourse aisle and
     * the slab under the upper deck, the deck's fascia with its vomitories,
     * and its rails.
     */
    function addSide(b: Bank) {
        const club = BOWL.club;
        const cc = BOWL.concourse;
        const up = BOWL.upper;
        const vom = BOWL.vomitory;
        const gaps = aisleGaps(b, "club", BOWL.aisle.lower);
        bankRail(
            b,
            club.offset + 0.04,
            club.base,
            0.9,
            railExtent(b, "club", club.offset),
            gaps,
            { color: STEEL_DARK },
        );
        bankRail(
            b,
            cc.offset - 0.04,
            cc.y,
            1,
            railExtent(b, "club", cc.offset),
            gaps,
            { color: STEEL_DARK },
        );
        // The curb from the last club row up to the aisle.
        {
            const [e0, e1] = rowExtent(b, "club", cc.offset);
            wall(
                P(b, cc.offset, e0, 0),
                P(b, cc.offset, e1, 0),
                tierTop(club),
                cc.y,
                scale(CONCRETE, 0.45),
            );
        }
        // The concourse level: the aisle, and on under the deck to the wall.
        const [n0, n1] = rowExtent(b, "club", cc.offset);
        const [w0, w1] = rowExtent(b, "club", BOWL.rearWall);
        slab(
            [
                P(b, cc.offset, n0, cc.y),
                P(b, cc.offset, n1, cc.y),
                P(b, BOWL.rearWall, w1, cc.y),
                P(b, BOWL.rearWall, w0, cc.y),
            ],
            scale(CONCRETE, 0.5),
        );
        // Where the corner's concourse stands above the club rows.
        for (const e of [0, 1] as const)
            wall(
                P(b, club.offset, rowExtent(b, "club", club.offset)[e], 0),
                P(b, cc.offset, rowExtent(b, "club", cc.offset)[e], 0),
                club.base - 0.4,
                cc.y,
                scale(FASCIA, 1.6),
            );

        // The upper deck's fascia, open at the vomitories.
        const half = BOWL.upperHalfX;
        const fd = up.offset - 0.01;
        const holes = vom.at.map((s): [number, number] => [
            s - vom.width / 2,
            s + vom.width / 2,
        ]);
        let from = -half;
        for (const [h0, h1] of [...holes, [half, half] as [number, number]]) {
            wall(
                P(b, fd, from, 0),
                P(b, fd, h0, 0),
                cc.y,
                up.base,
                scale(FASCIA, 1.5),
            );
            // A pale band along the fascia's top edge, as the slab's edge.
            wall(
                P(b, fd - 0.01, from, 0),
                P(b, fd - 0.01, h0, 0),
                up.base - 0.14,
                up.base,
                scale(CONCRETE, 0.55),
            );
            railRun(
                P(b, up.offset + 0.03, from, up.base),
                P(b, up.offset + 0.03, h0, up.base),
                1,
                { color: STEEL_DARK },
            );
            from = h1;
        }
        const backD = up.offset + vom.rows * up.depth;
        const backY = up.base + vom.rows * up.rise;
        for (const s of vom.at) {
            const [h0, h1] = [s - vom.width / 2, s + vom.width / 2];
            // The wall at the vomitory's back, with the lit door to the
            // concourse and an exit sign over it.
            wall(
                P(b, backD, h0, 0),
                P(b, backD, h1, 0),
                cc.y,
                backY,
                scale(FASCIA, 1.6),
            );
            const door = P(b, backD - 0.04, s, cc.y + 1.08);
            glow.push(
                {
                    p: [door.x, door.y, door.z],
                    s: [vom.width - 0.5, 2.16, 0.05],
                    ry: yaw(b),
                    color: 0xf1e7d2,
                },
                {
                    p: [door.x, cc.y + 2.42, door.z],
                    s: [0.5, 0.18, 0.07],
                    ry: yaw(b),
                    color: 0x2cff7c,
                },
            );
            // Rails round the opening: up both sides and across the back.
            for (const e of [h0, h1])
                railRun(
                    P(b, up.offset + 0.03, e, up.base),
                    P(b, backD, e, backY),
                    1,
                    { color: STEEL_DARK, post: 1.4 },
                );
            railRun(P(b, backD, h0, backY), P(b, backD, h1, backY), 1, {
                color: STEEL_DARK,
            });
        }
        // The deck's ends: a rail up the rake.
        const topD = tierBack(up);
        const topY = tierTop(up);
        for (const e of [-half, half])
            railRun(P(b, up.offset, e, up.base), P(b, topD, e, topY), 1, {
                color: STEEL_DARK,
                post: 2.13,
                cables: 1,
            });
        // The walkway behind the last row, to the rear wall.
        treads.add(
            [
                P(b, topD, -half, topY),
                P(b, topD, half, topY),
                P(b, BOWL.rearWall, half, topY),
                P(b, BOWL.rearWall, -half, topY),
            ],
            [0, TREAD_PLAIN[0], (2 * half) / TREAD_TILE, TREAD_PLAIN[1]],
            scale(CONCRETE, 0.45),
        );
    }

    /**
     * An end: the wall behind the 200s' last row up to the open concourse,
     * its standing rail, and the concourse's floor back to its wall.
     */
    function addEnd(b: Bank) {
        const cc = BOWL.concourse;
        const d = tierBack(BOWL.midEnd);
        const dWall = BOWL.end.wallX - BOWL.halfX;
        const [e0, e1] = rowExtent(b, "200", d);
        const [w0, w1] = rowExtent(b, "200", dWall);
        wall(
            P(b, d, e0, 0),
            P(b, d, e1, 0),
            tierTop(BOWL.midEnd),
            cc.y,
            scale(FASCIA, 1.7),
        );
        railRun(P(b, d + 0.05, e0, cc.y), P(b, d + 0.05, e1, cc.y), 1.07, {
            color: STEEL_DARK,
        });
        slab(
            [
                P(b, d, e0, cc.y),
                P(b, d, e1, cc.y),
                P(b, dWall, w1, cc.y),
                P(b, dWall, w0, cc.y),
            ],
            scale(CONCRETE, 0.26),
        );
        // Along each mitre the concourse stands above the corner's last
        // rows: a wall and a rail.
        const dc = tierBack(BOWL.mid);
        for (const e of [0, 1] as const) {
            const p = P(b, d, rowExtent(b, "200", d)[e], cc.y);
            const q = P(b, dc, rowExtent(b, "200", dc)[e], cc.y);
            wall(p, q, tierTop(BOWL.midEnd) - 0.1, cc.y, scale(FASCIA, 1.7));
            railRun(p, q, 1.07, { color: STEEL_DARK });
        }
    }

    /**
     * A corner: the concourse behind the 200s, out to the walls, and the
     * terrace box on it: a red front wall under a glass rail, low red side
     * walls, a red back wall and a flat canopy.
     */
    function addCorner(b: Bank) {
        const cc = BOWL.concourse;
        const d = tierBack(BOWL.mid);
        const h = mitreHalf(b, d);
        const T = { half: 3, depth: 3.6, top: 12 };
        // The curb behind the last row: red along the terrace.
        const curb = (s0: number, s1: number, tint: Tint) =>
            wall(
                P(b, d, s0, 0),
                P(b, d, s1, 0),
                tierTop(BOWL.mid),
                cc.y + 0.1,
                tint,
            );
        curb(-h, -T.half, scale(FASCIA, 1.7));
        curb(-T.half, T.half, scale(RED, 0.9));
        curb(T.half, h, scale(FASCIA, 1.7));
        for (const [s0, s1] of [
            [-h + SEAT.endClear, -T.half],
            [T.half, h - SEAT.endClear],
        ])
            railRun(P(b, d + 0.05, s0, cc.y), P(b, d + 0.05, s1, cc.y), 1.07, {
                color: STEEL_DARK,
            });
        // The concourse: out to the building's corner between the mitres.
        const sx = Math.sign(b.nx);
        const sz = Math.sign(b.nz);
        const ends = [P(b, d, -h, cc.y), P(b, d, h, cc.y)].sort(
            (p, q) => Math.abs(q.x) - Math.abs(p.x),
        );
        const dEnd = BOWL.end.wallX - BOWL.halfX;
        const rear = cz + sz * (BOWL.halfZ + BOWL.rearWall);
        slab(
            [
                ends[0],
                V(
                    sx * BOWL.end.wallX,
                    cc.y,
                    cz + sz * mitreHalf(BANKS.east, dEnd),
                ),
                V(sx * BOWL.end.wallX, cc.y, rear),
                V(sx * mitreHalf(BANKS.front, BOWL.rearWall), cc.y, rear),
                ends[1],
            ],
            scale(CONCRETE, 0.26),
        );
        // The terrace box.
        glassRail(
            P(b, d + 0.06, -T.half, cc.y + 0.1),
            P(b, d + 0.06, T.half, cc.y + 0.1),
            1,
        );
        for (const s of [-T.half, T.half])
            wall(
                P(b, d, s, 0),
                P(b, d + T.depth, s, 0),
                cc.y,
                cc.y + 1.1,
                scale(RED, 0.8),
            );
        wall(
            P(b, d + T.depth, -T.half - 0.6, 0),
            P(b, d + T.depth, T.half + 0.6, 0),
            cc.y,
            T.top,
            scale(BRICK, 0.9),
        );
        walls.poly(
            [
                P(b, d + 0.7, -T.half - 0.6, T.top),
                P(b, d + 0.7, T.half + 0.6, T.top),
                P(b, d + T.depth, T.half + 0.6, T.top),
                P(b, d + T.depth, -T.half - 0.6, T.top),
            ],
            scale(BLACK, 1.4),
        );
        wall(
            P(b, d + 0.7, -T.half - 0.6, 0),
            P(b, d + 0.7, T.half + 0.6, 0),
            T.top,
            T.top + 0.3,
            scale(FASCIA, 1.5),
        );
        for (const s of [-T.half - 0.5, T.half + 0.5])
            steel.beam(
                P(b, d + 0.8, s, cc.y),
                P(b, d + 0.8, s, T.top),
                0.14,
                STEEL_DARK,
            );
        for (const s of [-1.9, 0, 1.9]) {
            const lamp = P(b, d + 2, s, T.top - 0.03);
            glow.push({
                p: [lamp.x, lamp.y, lamp.z],
                s: [0.3, 0.04, 0.3],
                color: 0xffe9c4,
            });
            if (high)
                steel.box(
                    P(b, d + 2.3, s, cc.y + 0.52),
                    [0.7, 1.04, 0.7],
                    0x1c1d21,
                    yaw(b),
                );
        }
        const at = (s: number): Vector3Tuple => {
            const p = P(b, d + 0.75, s, cc.y + SEAT_HEIGHT);
            return [p.x, p.y, p.z];
        };
        seatRows.push({
            points: [at(-T.half + 0.5), at(T.half - 0.3)],
            closed: false,
            depth: 0.9,
            side: "neutral",
            standing: 1,
        });
    }

    /**
     * The back corners in WGI trim. With the corner 100s folded away, the
     * fixed structure under the 200s shows: its navy wall beside each
     * performance opening and along the drape's line to the end stand, the
     * platform on top (level with the cross aisle), and the rail round it.
     * The back stand's own fixed wall runs behind the folded 100s.
     */
    function addBackCorners() {
        const ca = BOWL.crossAisle;
        const navy = scale(WALL_NAVY, 1.15);
        const back = BANKS.back;
        const hb = mitreHalf(back, ca.offset);
        wall(
            P(back, ca.offset, -hb, 0),
            P(back, ca.offset, hb, 0),
            0,
            ca.y,
            navy,
        );
        railRun(
            P(back, ca.offset + 0.03, -hb, ca.y),
            P(back, ca.offset + 0.03, hb, ca.y),
            1.07,
        );
        const toDrape = cz - DRAPE_Z;
        for (const end of [BANKS.east, BANKS.west]) {
            const sx = Math.sign(end.nx);
            // In the end bank's `s`, toward the back.
            const k = end.id === "east" ? 1 : -1;
            const dB =
                BOWL.halfZ - BOWL.chamfer + Math.SQRT2 * ca.offset - toDrape;
            const A = P(end, 0, k * toDrape, 0);
            const B = P(end, dB, k * toDrape, 0);
            const C = P(end, ca.offset, k * (toDrape - (ca.offset - dB)), 0);
            const W = V(sx * BOWL.halfX, 0, FLOOR.minZ);
            const M = V(sx * hb, 0, FLOOR.minZ);
            wall(A, W, 0, ca.y, navy);
            wall(A, B, 0, ca.y, navy);
            wall(B, C, 0, ca.y, navy);
            slab(
                [A, B, M, W].map((p) => p.clone().setY(ca.y)),
                scale(CONCRETE, 0.9),
            );
            const lift = (p: Vector3) => p.clone().setY(ca.y);
            railRun(lift(W), lift(A), 1.07);
            railRun(lift(A), lift(B), 1.07);
            railRun(lift(B), lift(C), 1.07);
        }
    }

    /**
     * The hall's inner walls and the two ends above the concourse: black
     * walls behind the upper decks and over the ends, the soffit over the
     * end concourses with the LED ribbon on its fascia, the Flight Deck
     * behind the ribbon at +X and the suites' glass at -X.
     */
    function addEnclosure() {
        const cc = BOWL.concourse;
        const E = BOWL.end;
        const top = BOWL.wallTop;
        const rear = BOWL.halfZ + BOWL.rearWall;
        const black = scale(BLACK, 1.3);
        for (const sz of [-1, 1])
            wall(
                V(-E.wallX, 0, cz + sz * rear),
                V(E.wallX, 0, cz + sz * rear),
                cc.y,
                top,
                black,
            );
        const r = E.ribbon;
        for (const sx of [-1, 1]) {
            const east = sx > 0;
            const xw = sx * E.wallX;
            const xf = sx * E.fasciaX;
            const z0 = cz - rear;
            const z1 = cz + rear;
            // The concourse's back wall, with lit openings, and its soffit.
            wall(
                V(xw, 0, z0),
                V(xw, 0, z1),
                cc.y,
                E.soffit,
                scale(FASCIA, 2.2),
            );
            walls.poly(
                [
                    V(xf, E.soffit, z0),
                    V(xf, E.soffit, z1),
                    V(xw, E.soffit, z1),
                    V(xw, E.soffit, z0),
                ],
                black,
            );
            for (let z = cz - 24; z <= cz + 24.01; z += 8) {
                glow.push(
                    {
                        p: [xw - sx * 0.04, cc.y + 1.15, z],
                        s: [0.05, 2.3, 2.6],
                        color: 0x5a4a34,
                    },
                    {
                        p: [xw - sx * 0.08, cc.y + 2.55, z],
                        s: [0.05, 0.22, 2.2],
                        color: 0x9a958a,
                    },
                );
                if (high)
                    for (const x of [xf + sx * 2.4, xf + sx * 5.6])
                        glow.push({
                            p: [x, E.soffit - 0.02, z + 4],
                            s: [0.34, 0.03, 0.34],
                            color: 0xffedcf,
                        });
            }
            // The upper wall: solid outside the ribbon's run.
            wall(V(xf, 0, z0), V(xf, 0, cz - r.halfZ), E.soffit, top, black);
            wall(V(xf, 0, cz + r.halfZ), V(xf, 0, z1), E.soffit, top, black);
            // The fascia the ribbon hangs on, and the ribbon just off it.
            wall(
                V(xf, 0, cz - r.halfZ),
                V(xf, 0, cz + r.halfZ),
                E.soffit,
                r.y1,
                scale(FASCIA, 0.8),
            );
            const tile = (r.y1 - r.y0) * SIGN_RIBBON.tileHeights;
            const u = r.halfZ / tile;
            wall(
                V(xf - sx * 0.05, 0, cz - r.halfZ),
                V(xf - sx * 0.05, 0, cz + r.halfZ),
                r.y0,
                r.y1,
                PLAIN,
                ribbon,
                // Reads left to right from the floor at both ends.
                east ? [0.5 - u, 0, 0.5 + u, 1] : [0.5 + u, 0, 0.5 - u, 1],
            );
            if (east) {
                // The Flight Deck: an open deck behind a glass rail, red
                // walls, a low lit ceiling, and a red band above.
                const D = E.deck;
                const a = cz - r.halfZ;
                const c = cz + r.halfZ;
                walls.poly(
                    [
                        V(xf, D.floor, a),
                        V(xf, D.floor, c),
                        V(xw, D.floor, c),
                        V(xw, D.floor, a),
                    ],
                    scale(CARPET, 1.2),
                );
                walls.poly(
                    [
                        V(xf, D.ceiling, a),
                        V(xf, D.ceiling, c),
                        V(xw, D.ceiling, c),
                        V(xw, D.ceiling, a),
                    ],
                    scale(BLACK, 1.6),
                );
                wall(
                    V(xw, 0, a),
                    V(xw, 0, c),
                    D.floor,
                    D.ceiling,
                    scale(BRICK, 0.85),
                );
                for (const z of [a, c])
                    wall(
                        V(xf, 0, z),
                        V(xw, 0, z),
                        D.floor,
                        D.ceiling,
                        scale(RED, 0.75),
                    );
                glassRail(
                    V(xf - 0.03, r.y1, a),
                    V(xf - 0.03, r.y1, c),
                    D.rail - r.y1,
                );
                wall(
                    V(xf, 0, a),
                    V(xf, 0, c),
                    D.ceiling,
                    D.ceiling + 1.3,
                    scale(RED, 0.95),
                );
                wall(V(xf, 0, a), V(xf, 0, c), D.ceiling + 1.3, top, black);
                for (let z = a + 2.5; z < c; z += 5) {
                    for (const x of [xf + 2, xf + 5.5])
                        glow.push({
                            p: [x, D.ceiling - 0.03, z],
                            s: [0.5, 0.04, 0.5],
                            color: 0xffe6c0,
                        });
                    if (high)
                        steel.box(
                            V(xf + 3.2, D.floor + 0.52, z),
                            [0.7, 1.04, 0.7],
                            0x1c1d21,
                        );
                }
                // The bar along the back wall, and people at the rail.
                steel.box(
                    V(xw - 0.7, D.floor + 0.55, cz),
                    [0.8, 1.1, 14],
                    0x2a2320,
                );
                seatRows.push({
                    points: [
                        [xf + 0.7, D.floor + SEAT_HEIGHT, a + 1],
                        [xf + 0.7, D.floor + SEAT_HEIGHT, c - 1],
                    ],
                    closed: false,
                    depth: 1,
                    side: "neutral",
                    standing: 1,
                });
            } else {
                // The suites: a band of lit glass over the ribbon.
                const S = E.suites;
                const us = r.halfZ / DIESEL_SUITE_TILE;
                wall(
                    V(xf, 0, cz - r.halfZ),
                    V(xf, 0, cz + r.halfZ),
                    r.y1,
                    S.y0,
                    scale(FASCIA, 1.2),
                );
                wall(
                    V(xf, 0, cz - r.halfZ),
                    V(xf, 0, cz + r.halfZ),
                    S.y0,
                    S.y1,
                    PLAIN,
                    suites,
                    [0.5 + us, 0, 0.5 - us, 1],
                );
                wall(
                    V(xf, 0, cz - r.halfZ),
                    V(xf, 0, cz + r.halfZ),
                    S.y1,
                    top,
                    black,
                );
            }
        }
    }

    /**
     * Section numbers, numbered as the arena's (`nightpoundSectionNumber`):
     * the 100s on the rail behind their last row, the 200s on their front
     * rail, the 300s on the upper deck's fascia.
     */
    function addPlaques(b: Bank) {
        const put = (
            name: TierName,
            row: number,
            level: 1 | 2 | 3,
            d: number,
            y0: number,
            w: number,
            share: number,
        ) => {
            const tier = bankTiers(b).find((t) => t.name === name)?.tier;
            if (!tier) return;
            for (const [s0, s1] of rowSeats(b, name, tier, row).runs) {
                if (s1 - s0 < 2.5) continue;
                const s = s0 + (s1 - s0) * share;
                const mid = P(b, d, (s0 + s1) / 2, 0);
                const label = String(
                    nightpoundSectionNumber(mid.x, mid.z, level),
                );
                // Two faces a little apart, so the number reads from the
                // floor and from the stand behind it.
                for (const [dd, flip] of [
                    [d, false],
                    [d + 0.03, true],
                ] as const) {
                    const [a, c] = flip
                        ? [s + w / 2, s - w / 2]
                        : [s - w / 2, s + w / 2];
                    plaquesAt.push({
                        quad: [
                            P(b, dd, a, y0),
                            P(b, dd, c, y0),
                            P(b, dd, c, y0 + w / 2),
                            P(b, dd, a, y0 + w / 2),
                        ],
                        label,
                    });
                }
            }
        };
        const ca = BOWL.crossAisle;
        put(
            "100",
            BOWL.lower.rows - 1,
            1,
            ca.offset - 0.02,
            ca.y + 0.5,
            0.9,
            0.5,
        );
        put("200", 0, 2, ca.offset + ca.width, BOWL.mid.base + 0.42, 0.8, 0.5);
        if (b.kind === "side")
            put(
                "300",
                BOWL.vomitory.rows,
                3,
                BOWL.upper.offset - 0.04,
                BOWL.concourse.y + 0.5,
                1.3,
                0.5,
            );
    }

    // ---- Meshes: one per material ----
    const own = <T extends { dispose(): void }>(thing: T): T => {
        disposers.push(() => thing.dispose());
        return thing;
    };
    const addMesh = (geo: BufferGeometry, material: Material, name: string) => {
        const mesh = new Mesh(own(geo), material);
        mesh.name = name;
        object.add(mesh);
        return mesh;
    };
    const matte = (
        params: ConstructorParameters<typeof MeshLambertMaterial>[0],
    ) =>
        own(
            houseLit(
                new MeshLambertMaterial({
                    vertexColors: true,
                    side: DoubleSide,
                    emissive: 0xffffff,
                    emissiveIntensity: 0,
                    ...params,
                }),
            ),
        );
    const lit = (map: Texture, emissiveIntensity: number, roughness = 0.8) =>
        own(
            new MeshStandardMaterial({
                color: 0xffffff,
                map,
                emissive: 0xffffff,
                emissiveMap: map,
                emissiveIntensity,
                roughness,
                side: DoubleSide,
            }),
        );

    const treadMap = own(nightpoundTreadTexture());
    const treadMat = matte({ map: treadMap, emissiveMap: treadMap });
    const treadMesh = addMesh(treads.build(), treadMat, "nightpound.treads");
    treadMesh.receiveShadow = high;

    const seatMap = own(nightpoundSeatTexture());
    const seatMat = matte({
        map: seatMap,
        emissiveMap: seatMap,
        alphaTest: 0.5,
    });
    addMesh(seats.build(), seatMat, "nightpound.seats");

    const wallMat = matte({});
    addMesh(walls.build(), wallMat, "nightpound.walls");

    const unit = own(new BoxGeometry(1, 1, 1));
    const steelMat = matte({ vertexColors: false });
    object.add(own(steel.build(unit, steelMat, "nightpound.rails")));

    const glassMat = own(
        new MeshBasicMaterial({
            color: 0x9fb4c0,
            vertexColors: true,
            transparent: true,
            opacity: 0.16,
            depthWrite: false,
            side: DoubleSide,
        }),
    );
    addMesh(glass.build(), glassMat, "nightpound.glass");

    const ribbonMap = own(signRibbonTexture());
    const ribbonMat = own(
        new MeshStandardMaterial({
            color: 0x000000,
            emissive: 0xffffff,
            emissiveMap: ribbonMap,
            emissiveIntensity: 1,
            side: DoubleSide,
        }),
    );
    addMesh(ribbon.build(), ribbonMat, "nightpound.ribbons");

    const boardMat = lit(own(nightpoundBoardTexture()), 0.06);
    addMesh(boards.build(), boardMat, "nightpound.boards");

    const suiteMat = lit(own(dieselSuiteFrontTexture()), 0.6, 0.25);
    addMesh(suites.build(), suiteMat, "nightpound.suites");

    // The plaques' atlas: one cell per label.
    const labels = [...new Set(plaquesAt.map((p) => p.label))];
    const plaques = new Quads();
    for (const p of plaquesAt)
        plaques.add(
            p.quad,
            sectionAtlasCell(labels.indexOf(p.label), labels.length),
            PLAIN,
        );
    const plaqueMat = lit(own(dieselSectionNumberTexture(labels)), 0.25);
    addMesh(plaques.build(), plaqueMat, "nightpound.sectionNumbers");

    const glowMat = own(new MeshBasicMaterial({ vertexColors: true }));
    addMesh(mergedBoxes(glow), glowMat, "nightpound.glow");

    const pickTargets: Object3D[] = [treadMesh];
    return {
        object,
        seatRows,
        fill: bowlFill,
        pickTargets,
        setLighting(preset: LightingPreset) {
            const k = preset === "house" ? "house" : "show";
            const H = NIGHTPOUND_HOUSE;
            seatMat.emissiveIntensity = H.seats[k];
            treadMat.emissiveIntensity = H.concrete[k];
            wallMat.emissiveIntensity = H.concrete[k];
            steelMat.emissiveIntensity = H.steel[k];
        },
        dispose() {
            disposers.forEach((d) => d());
            object.clear();
        },
    };
}
