// cspell:ignore concourse vomitory vomitories
import type { Vector3Tuple } from "three";
import { EYE, SEAT_HEIGHT, SEAT_PITCH } from "./frame";
import { ARENA_CENTER_Z, DRAPE_Z, FLOOR, FRONT_CHAMFER } from "./plan";

/**
 * The plan of Nightpound's seating bowl, in kit-root space (`frame.ts`):
 * pure numbers, no meshes, so the cameras and the tests can use it.
 *
 * The lower bowl is an octagon around the arena's center: the floor's
 * outline (front wall, end walls, 45-degree corners) pushed outward row by
 * row. It is cut into eight BANKS, four straight and four corners, that meet
 * along the octagon's mitres. A point of a bank is `d` meters out from the
 * floor wall and `s` meters along it from the bank's middle.
 *
 * Every tread and rise is derived from row counts and photos
 * (docs/3d/nightpound.md); none is a published measurement.
 */

/** One raked tier of seats. */
export interface BowlTier {
    rows: number;
    /** Tread depth. */
    depth: number;
    rise: number;
    /** The first row's front, out from the floor wall. */
    offset: number;
    /** The first tread's height. */
    base: number;
}

const HALF_X = FLOOR.maxX;
const HALF_Z = FLOOR.maxZ - ARENA_CENTER_Z;
/** How fast a row's end moves out along a 45-degree corner's mitre. */
const MITRE = Math.SQRT2 - 1;

const LOWER: BowlTier = {
    rows: 11,
    depth: 0.79,
    rise: 0.27,
    offset: 0,
    base: 0.35,
};
const MID: BowlTier = {
    rows: 16,
    depth: 0.76,
    rise: 0.3,
    offset: 9.89,
    base: 3.35,
};
const CLUB: BowlTier = {
    rows: 2,
    depth: 0.9,
    rise: 0.35,
    offset: 22.05,
    base: 8.2,
};
const UPPER: BowlTier = {
    rows: 34,
    depth: 0.71,
    rise: 0.26,
    offset: 25.45,
    base: 9.6,
};

/** Where a tier ends, out from the floor wall. */
export const tierBack = (t: BowlTier) => t.offset + t.rows * t.depth;
/** A tier's last tread. */
export const tierTop = (t: BowlTier) => t.base + (t.rows - 1) * t.rise;

/**
 * The bowl's numbers. Offsets are out from the floor wall (the face of row
 * A): the front wall at Z = `FLOOR.maxZ`, the end walls at X = +-`halfX`.
 */
export const BOWL = {
    /** The octagon's center: the arena's, not the competition area's. */
    center: { x: 0, z: ARENA_CENTER_Z },
    /** The floor's half extents about that center, and its corner cut. */
    halfX: HALF_X,
    halfZ: HALF_Z,
    chamfer: FRONT_CHAMFER,
    /** The floor wall, and the rail's top above row A's tread. */
    wall: { height: 1.07, rail: 1.07 },
    /** The 100s: telescopic, out on the front, the ends and the front corners. */
    lower: LOWER,
    /** The aisle between the 100s and the 200s, on the fixed structure. */
    crossAisle: { offset: 8.69, width: 1.2, y: 3.05 },
    /** The 200s on the sides and in the corners. */
    mid: MID,
    /** The 200s at the ends stop at row M, under the overhang. */
    midEnd: { ...MID, rows: 13 } as BowlTier,
    /** The two red club rows at the top of the sides' 200s. */
    club: CLUB,
    /** The concourse level and the sides' aisle along it. */
    concourse: { offset: 23.85, width: 1.6, y: 8.6 },
    /** The 300s and 400s: one rake, on the two sides only. */
    upper: UPPER,
    /** The upper decks run this far either side of center. */
    upperHalfX: 27,
    /** The side walls behind the upper decks, out from the floor wall. */
    rearWall: 49.9,
    /** The ends: the fascia the ribbon hangs on, and the concourse's wall. */
    end: {
        fasciaX: 29,
        wallX: 42.5,
        soffit: 12.2,
        ribbon: { y0: 12.4, y1: 13.31, halfZ: 15.25 },
        /** The Flight Deck (+X) behind the ribbon. */
        deck: { floor: 13.3, rail: 14.4, ceiling: 17.5 },
        /** The suites' glass (-X). */
        suites: { y0: 13.55, y1: 16.2 },
    },
    /** Vomitories in the first rows of the upper decks. */
    vomitory: {
        rows: 4,
        width: 2.4,
        height: 2.3,
        at: [-19.286, -3.857, 3.857, 19.286] as readonly number[],
    },
    /** Aisle widths. */
    aisle: { lower: 1.2, upper: 1.1 },
    /** The inner walls' top, under the roof. */
    wallTop: 27.5,
} as const;

export type BankId =
    | "front"
    | "frontEast"
    | "east"
    | "backEast"
    | "back"
    | "backWest"
    | "west"
    | "frontWest";

export type BankKind = "side" | "end" | "corner";

/**
 * One bank of the octagon. `out` points away from the floor; `along` is
 * `out` turned a quarter turn, the same way for every bank, so a bank's
 * `s > 0` end meets the next bank's `s < 0` end.
 */
export interface Bank {
    id: BankId;
    kind: BankKind;
    /** The middle of the bank's floor edge. */
    ox: number;
    oz: number;
    nx: number;
    nz: number;
    tx: number;
    tz: number;
    /** Half the floor edge's length. */
    half: number;
    /** Whether the 100s are out (false where they fold away for WGI). */
    lower: boolean;
}

function bank(
    id: BankId,
    kind: BankKind,
    nx: number,
    nz: number,
    lower: boolean,
): Bank {
    const corner = kind === "corner";
    const k = corner ? Math.SQRT1_2 : 1;
    const [ux, uz] = [nx * k, nz * k];
    const cz = ARENA_CENTER_Z;
    return {
        id,
        kind,
        ox: corner ? nx * (HALF_X - FRONT_CHAMFER / 2) : nx * HALF_X,
        oz: cz + (corner ? nz * (HALF_Z - FRONT_CHAMFER / 2) : nz * HALF_Z),
        nx: ux,
        nz: uz,
        tx: uz,
        tz: -ux,
        half:
            kind === "side"
                ? HALF_X - FRONT_CHAMFER
                : kind === "end"
                  ? HALF_Z - FRONT_CHAMFER
                  : FRONT_CHAMFER * Math.SQRT1_2,
        lower,
    };
}

/** The eight banks, clockwise seen from above starting at the front. */
export const BANKS: Record<BankId, Bank> = {
    front: bank("front", "side", 0, 1, true),
    frontEast: bank("frontEast", "corner", 1, 1, true),
    east: bank("east", "end", 1, 0, true),
    backEast: bank("backEast", "corner", 1, -1, false),
    back: bank("back", "side", 0, -1, false),
    backWest: bank("backWest", "corner", -1, -1, false),
    west: bank("west", "end", -1, 0, true),
    frontWest: bank("frontWest", "corner", -1, 1, true),
};
export const BANK_LIST: Bank[] = Object.values(BANKS);

/** The plan point `d` out and `s` along a bank. */
export function bankPoint(b: Bank, d: number, s: number): [number, number] {
    return [b.ox + b.nx * d + b.tx * s, b.oz + b.nz * d + b.tz * s];
}

/** A plan point in a bank's own `d` (out) and `s` (along). */
export function bankLocal(
    b: Bank,
    x: number,
    z: number,
): { d: number; s: number } {
    const [dx, dz] = [x - b.ox, z - b.oz];
    return { d: dx * b.nx + dz * b.nz, s: dx * b.tx + dz * b.tz };
}

/** Half a bank's length `d` out: its ends run out along the mitres. */
export const mitreHalf = (b: Bank, d: number) => b.half + MITRE * d;

/** The bank whose wedge of the plan holds a point (the nearest one on the floor). */
export function bankAt(
    x: number,
    z: number,
): { bank: Bank; d: number; s: number } {
    let best: { bank: Bank; d: number; s: number } | undefined;
    let bestOver = Infinity;
    for (const b of BANK_LIST) {
        const { d, s } = bankLocal(b, x, z);
        const over = Math.max(0, Math.abs(s) - mitreHalf(b, Math.max(0, d)));
        // Inside a wedge: the bank furthest out wins (on the floor, the
        // nearest wall).
        const score = over > 1e-6 ? over + 1e3 : -d;
        if (score < bestOver) {
            bestOver = score;
            best = { bank: b, d, s };
        }
    }
    return best!;
}

export type TierName = "100" | "200" | "club" | "300";

/** A bank's tiers, from the floor up. */
export function bankTiers(b: Bank): { name: TierName; tier: BowlTier }[] {
    const out: { name: TierName; tier: BowlTier }[] = [];
    if (b.lower) out.push({ name: "100", tier: BOWL.lower });
    out.push({ name: "200", tier: b.kind === "end" ? BOWL.midEnd : BOWL.mid });
    if (b.kind === "side")
        out.push(
            { name: "club", tier: BOWL.club },
            { name: "300", tier: BOWL.upper },
        );
    return out;
}

/**
 * How far back the ends' 100s run: to the drape's line, where the
 * performance openings are, and no further than the fixed corner the back
 * corner's 200s stand on. In the end bank's `s`, as a distance from its
 * middle toward the back.
 */
function endBackLimit(d: number): number {
    const toDrape = ARENA_CENTER_Z - DRAPE_Z;
    const toCorner =
        HALF_Z - FRONT_CHAMFER + Math.SQRT2 * BOWL.crossAisle.offset - d;
    return Math.min(toDrape, toCorner);
}

/** The ends of a bank's rows `d` out, as `[s0, s1]`. */
export function rowExtent(
    b: Bank,
    name: TierName,
    d: number,
): [number, number] {
    if (name === "300") return [-BOWL.upperHalfX, BOWL.upperHalfX];
    const h = mitreHalf(b, d);
    if (name === "100" && b.kind === "end") {
        // The end banks' `s` grows toward the back at +X and toward the
        // front at -X.
        return b.id === "east" ? [-h, endBackLimit(d)] : [-endBackLimit(d), h];
    }
    return [-h, h];
}

/** Whether a row end is an aisle along the mitre (true) or a wall (false). */
export function endIsAisle(b: Bank, name: TierName, end: 0 | 1): boolean {
    if (name === "300") return true;
    if (name === "100" && b.kind === "end")
        return b.id === "east" ? end === 0 : end === 1;
    return true;
}

/** The middles of a tier's aisles between its ends, in the bank's `s`. */
export function tierAisles(b: Bank, name: TierName): number[] {
    if (name === "300")
        return [-19.286, -11.571, -3.857, 3.857, 11.571, 19.286];
    if (b.kind === "side")
        return name === "100" ? [-7.4, 0, 7.4] : [-14.8, -7.4, 0, 7.4, 14.8];
    if (b.kind === "end") {
        if (name === "200") return [0];
        // Between 108 and 109 (116 and 101): the middle of the rows that
        // run back to the drape's line.
        const mid = (endBackLimit(0) - b.half) / 2;
        return [b.id === "east" ? mid : -mid];
    }
    return name === "200" ? [0] : [];
}

/** Where a row sits on its tread. */
export const SEAT = {
    /** The crowd's line, in from the tread's back. */
    setback: 0.3,
    /** Half an aisle left clear at a row's end on a mitre. */
    endClear: 0.6,
};

export interface RowSeats {
    /** The row's front, out from the floor wall, and its tread height. */
    d: number;
    y: number;
    /** Runs of whole seats along the seat line, as `[s0, s1]`. */
    runs: [number, number][];
}

/** The seats of row `i` of a tier: whole seats between the aisles. */
export function rowSeats(
    b: Bank,
    name: TierName,
    tier: BowlTier,
    i: number,
): RowSeats {
    const d = tier.offset + i * tier.depth;
    const y = tier.base + i * tier.rise;
    const seatD = d + tier.depth - SEAT.setback;
    const upper = name === "300";
    const aisle = upper ? BOWL.aisle.upper : BOWL.aisle.lower;
    const [e0, e1] = rowExtent(b, name, seatD);
    const lo =
        e0 + (endIsAisle(b, name, 0) ? (upper ? aisle : SEAT.endClear) : 0.15);
    const hi =
        e1 - (endIsAisle(b, name, 1) ? (upper ? aisle : SEAT.endClear) : 0.15);
    const gaps: [number, number][] = tierAisles(b, name).map((s) => [
        s - aisle / 2,
        s + aisle / 2,
    ]);
    if (upper && i < BOWL.vomitory.rows)
        for (const s of BOWL.vomitory.at)
            gaps.push([
                s - BOWL.vomitory.width / 2 - 0.2,
                s + BOWL.vomitory.width / 2 + 0.2,
            ]);
    gaps.sort((p, q) => p[0] - q[0]);
    const runs: [number, number][] = [];
    let from = lo;
    const close = (to: number) => {
        const n = Math.floor((to - from + 1e-6) / SEAT_PITCH);
        if (n >= 1) {
            const pad = (to - from - n * SEAT_PITCH) / 2;
            runs.push([from + pad, from + pad + n * SEAT_PITCH]);
        }
    };
    for (const [g0, g1] of gaps) {
        if (g1 <= from) continue;
        if (g0 >= hi) break;
        close(Math.min(g0, hi));
        from = Math.max(from, g1);
    }
    if (from < hi) close(hi);
    return { d, y, runs };
}

/**
 * The bank whose seats a plan point belongs to. As `bankAt`, except that
 * the ends' 100s run back past the corner's mitre to the drape's line:
 * there the seats are the end's, not the back corner's.
 */
export function seatBank(
    x: number,
    z: number,
): { bank: Bank; d: number; s: number } {
    const at = bankAt(x, z);
    if (at.bank.id !== "backEast" && at.bank.id !== "backWest") return at;
    const end = at.bank.id === "backEast" ? BANKS.east : BANKS.west;
    const { d, s } = bankLocal(end, x, z);
    if (d < 0 || d > BOWL.crossAisle.offset) return at;
    const [s0, s1] = rowExtent(end, "100", d);
    return s >= s0 - 1e-6 && s <= s1 + 1e-6 ? { bank: end, d, s } : at;
}

const mix = (a: number, b: number, t: number) =>
    a + (b - a) * Math.min(1, Math.max(0, t));

/**
 * How full the seat at a kit-root point is on a finals night: the front
 * side nearly full, the front corners and the ends fuller low than high,
 * the back side (behind the performers) about half, and nobody on the end
 * concourses.
 */
export function bowlFill(x: number, y: number, z: number): number {
    const { bank: b, d } = seatBank(x, z);
    const upper = y > BOWL.concourse.y + 1 && d > BOWL.upper.offset - 1;
    const up = (d - BOWL.upper.offset) / (BOWL.upper.rows * BOWL.upper.depth);
    switch (b.id) {
        case "front":
            return upper ? mix(0.88, 0.62, up) : 0.92;
        case "back":
            return upper ? mix(0.55, 0.4, up) : 0.55;
        case "frontEast":
        case "frontWest":
            return d > tierBack(BOWL.mid) ? 0.5 : mix(0.9, 0.55, d / 22);
        case "east":
        case "west":
            if (x * b.nx > BOWL.end.fasciaX) return y > 11 ? 0.45 : 0;
            return d > tierBack(BOWL.midEnd) ? 0 : mix(0.86, 0.45, d / 19.8);
        default:
            return d > tierBack(BOWL.mid)
                ? 0.35
                : mix(0.5, 0.35, (d - 9.9) / 12);
    }
}

/** The 300s and 400s are seven sections a side. */
const UPPER_SECTION = (2 * BOWL.upperHalfX) / 7;

/**
 * The section number at a kit-root point, numbered as the arena is: sixteen
 * 100s and twenty-four 200s clockwise seen from above, 101 and 201 in the
 * back half of the exit end; seven 300s and 400s a side, 311 and 411 at
 * front center, 304 and 404 at back center.
 */
export function nightpoundSectionNumber(
    x: number,
    z: number,
    level: 1 | 2 | 3 | 4,
): number {
    if (level >= 3) {
        const front = z > ARENA_CENTER_Z;
        const k = Math.min(
            6,
            Math.max(
                0,
                Math.floor(
                    ((front ? -x : x) + BOWL.upperHalfX) / UPPER_SECTION,
                ),
            ),
        );
        return level * 100 + (front ? 8 : 1) + k;
    }
    const { bank: b, s } = level === 1 ? seatBank(x, z) : bankAt(x, z);
    // Sections of each bank in the order of its `s` (clockwise).
    const lower: Record<BankId, number[]> = {
        front: [111, 112, 113, 114],
        frontWest: [115],
        west: [116, 101],
        backWest: [102],
        back: [103, 104, 105, 106],
        backEast: [107],
        east: [108, 109],
        frontEast: [110],
    };
    const mid: Record<BankId, number[]> = {
        front: [216, 217, 218, 219, 220, 221],
        frontWest: [222, 223],
        west: [224, 201],
        backWest: [202, 203],
        back: [204, 205, 206, 207, 208, 209],
        backEast: [210, 211],
        east: [212, 213],
        frontEast: [214, 215],
    };
    const list = (level === 1 ? lower : mid)[b.id];
    // Every bank's `s` runs counterclockwise seen from above (toward +X
    // along the front); the sections are numbered clockwise.
    const cw = -s;
    const cuts =
        b.kind === "side"
            ? level === 1
                ? [-7.4, 0, 7.4]
                : [-14.8, -7.4, 0, 7.4, 14.8]
            : list.length === 2
              ? [level === 1 && b.kind === "end" ? -tierAisles(b, "100")[0] : 0]
              : [];
    let k = 0;
    while (k < cuts.length && cw > cuts[k]) k++;
    return list[k];
}

/**
 * The eye of someone seated in row `row` (0 = row A) of a bank's tier, `s`
 * meters along the bank from its middle, in kit-root space.
 */
export function bowlEye(
    id: BankId,
    name: TierName,
    row: number,
    s = 0,
): Vector3Tuple {
    const b = BANKS[id];
    const tier = bankTiers(b).find((t) => t.name === name)?.tier;
    if (!tier) throw new Error(`bowlEye: ${id} has no ${name}`);
    const d = tier.offset + row * tier.depth + tier.depth - SEAT.setback;
    const [x, z] = bankPoint(b, d, s);
    return [x, tier.base + row * tier.rise + EYE, z];
}

/** The crowd's seat height above a tread (`frame.ts`). */
export const BOWL_SEAT_HEIGHT = SEAT_HEIGHT;
