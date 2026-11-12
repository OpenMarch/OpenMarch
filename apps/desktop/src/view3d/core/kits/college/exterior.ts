import type { Color } from "three";
import { samplesBetween, type Horseshoe } from "./horseshoe";
import { type MeshBuilder, type P3 } from "./meshBuilder";
import { type BuiltTier, PANEL_TILE } from "./seating";
import { FACADE_BANDS, FACADE_BAY } from "./textures";

/**
 * The outside of the college stadium: a brick and limestone wall around the
 * horseshoe with a ground floor arcade, setback stories on the two deck
 * sides, a concourse ring around the corners and the closed end, helical
 * ramp towers at the deck ends and three gates with lit canopies. Everything
 * is merged into a few builders; `exterior.lit` is the night-only glow.
 */

/** How far the concourse ring reaches past the back of the lower bowl. */
const CONCOURSE_DEPTH = 7.5;
/** How far the arcade stands proud of the stories above it. */
const ARCADE_PROUD = 1.2;
const ARCADE_H = 13.5;
const STORY_H = 6;
/** Upper walls sit this far behind the rear parapet, so the two don't fight. */
const WALL_OUT = 0.5;
const TOWER_R = 8;
const TOWER_CORE_R = 4.5;
const TOWER_H = 26;
const TOWER_TURNS = 3;
const GATE_W = 12;

export interface ExteriorBuilders {
    facade: MeshBuilder;
    structure: MeshBuilder;
    lit: MeshBuilder;
    metal: MeshBuilder;
}

/** A gate on the outside wall: `n` is its outward direction. */
export interface Gate {
    x: number;
    z: number;
    nx: -1 | 0 | 1;
    nz: -1 | 0 | 1;
}

export interface Extents {
    /** World z of the home wall's outside face. */
    front: number;
    /** World z of the visitor wall's outside face. */
    back: number;
    /** World x of the closed end's outside face. */
    end: number;
}

export interface ExteriorOutput extends Extents {
    gates: Gate[];
}

export function buildExterior(
    hs: Horseshoe,
    tiers: { lower: BuiltTier; homeUpper: BuiltTier; awayUpper: BuiltTier },
    b: ExteriorBuilders,
    high: boolean,
    trim: Color,
): ExteriorOutput {
    const { lower, homeUpper, awayUpper } = tiers;
    const { facade, structure, lit } = b;
    const { cx, cz, halfX, halfZ } = hs.spec;
    const P = (s: number, d: number, y: number): P3 => {
        const [x, z] = hs.point(s, d);
        return [x, y, z];
    };
    const band = (name: keyof typeof FACADE_BANDS) => ({
        vA: FACADE_BANDS[name][0],
        vB: FACADE_BANDS[name][1],
    });
    /** A wall strip at offset `d` from y0 to y1, using one atlas band. */
    const wall = (
        ss: number[],
        d: number,
        y0: number,
        y1: number,
        name: keyof typeof FACADE_BANDS,
    ) =>
        facade.strip(
            ss.map((s) => P(s, d, y0)),
            ss.map((s) => P(s, d, y1)),
            { tile: FACADE_BAY, ...band(name) },
        );
    const flat = (ss: number[], d0: number, d1: number, y: number) =>
        structure.strip(
            ss.map((s) => P(s, d0, y)),
            ss.map((s) => P(s, d1, y)),
            {
                tile: PANEL_TILE,
                vA: d0 / PANEL_TILE,
                vB: d1 / PANEL_TILE,
            },
        );
    /** The thin lit line along a cornice. */
    const cornice = (ss: number[], d: number, y: number) =>
        lit.strip(
            ss.map((s) => P(s, d + 0.03, y - 0.34)),
            ss.map((s) => P(s, d + 0.03, y - 0.12)),
            { tile: 8 },
        );

    const [front, , , , back] = hs.segments;
    const walls: { face: number; top: number }[] = [];

    // The two deck sides: an arcade base with setback stories above.
    const deckWall = (t: BuiltTier) => {
        const ss = samplesBetween(hs, t.from, t.to);
        const d = t.back + WALL_OUT;
        const out = d + ARCADE_PROUD;
        const top = t.top + (t.rim ?? 1.4);
        wall(ss, out, 0, ARCADE_H, "arcade");
        cornice(ss, out, ARCADE_H);
        flat(ss, d, out, ARCADE_H);
        const stories = Math.max(0, Math.floor((top - 2 - ARCADE_H) / STORY_H));
        for (let i = 0; i < stories; i++) {
            wall(
                ss,
                d,
                ARCADE_H + i * STORY_H,
                ARCADE_H + (i + 1) * STORY_H,
                "story",
            );
        }
        const atticY = ARCADE_H + stories * STORY_H;
        wall(ss, d, atticY, top, "attic");
        cornice(ss, d, top);
        flat(ss, t.back, d, top);
        walls.push({ face: out, top });
        if (high) {
            // Pilasters every other bay, full height.
            const x0 = hs.at(t.from).x;
            const x1 = hs.at(t.to).x;
            const nz = Math.sign(hs.at(t.from).nz);
            const z = hs.at(t.from).z;
            const n = Math.max(1, Math.floor(Math.abs(x1 - x0) / 24));
            for (let i = 0; i <= n; i++) {
                const x = x0 + ((x1 - x0) * i) / n;
                structure.box(x, top / 2, z + nz * (out + 0.35), 0.9, top, 0.9);
            }
        }
    };
    deckWall(homeUpper);
    deckWall(awayUpper);

    // The concourse ring around both corners and the closed end.
    const ringS = samplesBetween(hs, front.s1, back.s0);
    const ringD = lower.back + CONCOURSE_DEPTH;
    const ringOut = ringD + ARCADE_PROUD;
    const ringTop = lower.top + (lower.rim ?? 1.2) + 0.2;
    wall(ringS, ringOut, 0, ARCADE_H, "arcade");
    wall(ringS, ringOut, ARCADE_H, ringTop, "attic");
    cornice(ringS, ringOut, ARCADE_H);
    cornice(ringS, ringOut, ringTop);
    flat(ringS, lower.back, ringOut, ringTop - 0.05);

    // Arcades across the two open faces of each deck, so the ends aren't blank.
    const openFace = (s: number, out: number, tier: BuiltTier) => {
        const zAt = (d: number) => hs.point(s, d)[1];
        const x = hs.point(s, 0)[0] + out * 0.3;
        const d0 = lower.back;
        const d1 = tier.back + WALL_OUT + ARCADE_PROUD;
        const uv = (d1 - d0) / FACADE_BAY;
        const [vA, vB] = FACADE_BANDS.arcade;
        const quad = (a: number, c: number) =>
            facade.quad(
                [x, 0, zAt(a)],
                [x, 0, zAt(c)],
                [x, ARCADE_H, zAt(c)],
                [x, ARCADE_H, zAt(a)],
                [
                    [0, vA],
                    [uv, vA],
                    [uv, vB],
                    [0, vB],
                ],
            );
        quad(d0, d1);
    };
    openFace(front.s0, -1, homeUpper);
    openFace(front.s1, 1, homeUpper);
    openFace(back.s0, 1, awayUpper);
    openFace(back.s1, -1, awayUpper);

    // Ramp towers at the four deck ends.
    const towerAt = (s: number, side: -1 | 1, tier: BuiltTier) => {
        const d = (ringD + tier.back + WALL_OUT + ARCADE_PROUD) / 2 + 3.5;
        const [x, z] = hs.point(s, d);
        addTower(b, x + side * (TOWER_R + 1.2), z, high);
    };
    towerAt(front.s0, -1, homeUpper);
    towerAt(front.s1, 1, homeUpper);
    towerAt(back.s0, 1, awayUpper);
    towerAt(back.s1, -1, awayUpper);

    const frontMid = (front.s0 + front.s1) / 2;
    const backMid = (back.s0 + back.s1) / 2;
    const homeFace = walls[0].face;
    const awayFace = walls[1].face;
    const gates: Gate[] = [
        gateAt(hs, frontMid, homeFace, 0, 1, b, trim),
        gateAt(hs, backMid, awayFace, 0, -1, b, trim),
        gateAt(hs, hs.length / 2, ringOut, 1, 0, b, trim),
    ];

    return {
        front: cz + halfZ + homeFace,
        back: cz - halfZ - awayFace,
        end: cx + halfX + ringOut,
        gates,
    };
}

function gateAt(
    hs: Horseshoe,
    s: number,
    d: number,
    nx: -1 | 0 | 1,
    nz: -1 | 0 | 1,
    b: ExteriorBuilders,
    trim: Color,
): Gate {
    const [x, z] = hs.point(s, d);
    return gateBox(x, z, nx, nz, b, trim);
}

/** A gate: two pylons, a lintel with a trim line, and a lit canopy. */
function gateBox(
    x: number,
    z: number,
    nx: -1 | 0 | 1,
    nz: -1 | 0 | 1,
    { structure, lit, metal }: ExteriorBuilders,
    trim: Color,
): Gate {
    // tangent = n rotated in plan; boxes are axis aligned, so swap sizes.
    const tx = nz !== 0 ? 1 : 0;
    const tz = nx !== 0 ? 1 : 0;
    const size = (t: number, y: number, n: number): [number, number, number] =>
        tx ? [t, y, n] : [n, y, t];
    const at = (t: number, y: number, n: number): [number, number, number] => [
        x + tx * t + nx * n,
        y,
        z + tz * t + nz * n,
    ];
    for (const sd of [-1, 1]) {
        const [px, py, pz] = at(sd * (GATE_W / 2 + 1.3), 5, 1.6);
        structure.box(px, py, pz, ...size(2.6, 10, 3.2));
    }
    const [lx, ly, lz] = at(0, 10.8, 1.6);
    structure.box(lx, ly, lz, ...size(GATE_W + 6, 1.6, 3.6));
    const [tx0, ty, tz0] = at(0, 11.7, 1.6);
    metal.box(tx0, ty, tz0, ...size(GATE_W + 6.4, 0.3, 4), trim);
    const [cx, cy, cz] = at(0, 8.4, 5);
    structure.box(cx, cy, cz, ...size(GATE_W + 4, 0.5, 7));
    // The lit soffit under the canopy.
    const hw = GATE_W / 2 + 1;
    const y = 8.14;
    const corner = (t: number, n: number): P3 => [
        x + tx * t + nx * n,
        y,
        z + tz * t + nz * n,
    ];
    lit.quad(corner(-hw, 2.2), corner(hw, 2.2), corner(hw, 8), corner(-hw, 8));
    return { x, z, nx, nz };
}

/** A helical ramp around a brick core, with columns and a lit handrail. */
function addTower(
    { facade, structure, lit, metal }: ExteriorBuilders,
    x: number,
    z: number,
    high: boolean,
): void {
    const perTurn = high ? 36 : 12;
    const steps = TOWER_TURNS * perTurn;
    const ring = (r: number, t: number, y: number): P3 => {
        const a = t * TOWER_TURNS * Math.PI * 2;
        return [x + Math.cos(a) * r, y, z + Math.sin(a) * r];
    };
    const circle = (r: number, y: number) => {
        const out: P3[] = [];
        for (let i = 0; i <= perTurn; i++) {
            const a = (i / perTurn) * Math.PI * 2;
            out.push([x + Math.cos(a) * r, y, z + Math.sin(a) * r]);
        }
        return out;
    };
    // The core: brick to the top, then a precast cap.
    facade.strip(circle(TOWER_CORE_R, 0), circle(TOWER_CORE_R, TOWER_H + 1.6), {
        tile: FACADE_BAY,
        vA: FACADE_BANDS.plain[0],
        vB: FACADE_BANDS.plain[1],
    });
    const cap = circle(TOWER_CORE_R + 0.4, TOWER_H + 1.6);
    for (let i = 0; i + 1 < cap.length; i++) {
        structure.tri(
            [x, TOWER_H + 2.3, z],
            cap[i],
            cap[i + 1],
            [0.5, 0.5],
            [0, 0],
            [1, 0],
        );
    }

    const along = (r: number, y: (t: number) => number) => {
        const out: P3[] = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            out.push(ring(r, t, y(t)));
        }
        return out;
    };
    const slab = (t: number) => t * TOWER_H + 0.3;
    structure.strip(along(TOWER_CORE_R, slab), along(TOWER_R, slab), {
        tile: 6,
    });
    const rail = (t: number) => slab(t) + 1.15;
    structure.strip(along(TOWER_R, slab), along(TOWER_R, rail), { tile: 6 });
    lit.strip(
        along(TOWER_R + 0.03, (t) => rail(t) - 0.16),
        along(TOWER_R + 0.03, rail),
        { tile: 8 },
    );
    // Columns under the ramp's outer edge.
    const n = high ? 6 : 4;
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        metal.box(
            x + Math.cos(a) * (TOWER_R - 0.4),
            TOWER_H / 2,
            z + Math.sin(a) * (TOWER_R - 0.4),
            0.5,
            TOWER_H,
            0.5,
        );
    }
}
