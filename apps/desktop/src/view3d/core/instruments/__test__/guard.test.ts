// apps/desktop/src/view3d/core/instruments/__test__/guard.test.ts
// cspell:words tris
import { describe, expect, it } from "vitest";
import {
    bounds,
    triangleCount,
    PART_BLACK,
    PART_SILK,
    PART_CHROME,
    PART_WOOD,
    PART_METAL,
} from "../mesh";
import {
    guardModel,
    sectionAt,
    FLAG6_SILK,
    RIFLE_STATIONS,
    RIFLE_SWIVELS,
    SWING_FLAG,
    SWING_SILK,
} from "../guard";
import { hold, HOLD_STATES, type Hold } from "../holds";
import type { Piece, Vec3 } from "../mesh";
import type { Detail, GuardModelId, InstrumentModel, SilkSpec } from "../model";
import { SILK_GRID, silkCutProfile, silkPoint } from "../silkWave";
import { silkShape } from "../../sizes/silkShapes";

/** Triangles drawn for a model: its pieces and its silks' grids. */
const drawn = (m: InstrumentModel, detail: Detail) =>
    triangleCount(m.pieces) +
    (m.silks?.length ?? 0) *
        2 *
        SILK_GRID[detail].fly *
        SILK_GRID[detail].header;

/** A silk-frame point in the instrument frame. */
function silkToInstrument(silk: SilkSpec, p: number[]): Vec3 {
    const b = silk.basis;
    return [0, 1, 2].map(
        (r) =>
            b[r * 3] * p[0] +
            b[r * 3 + 1] * p[1] +
            b[r * 3 + 2] * p[2] +
            silk.origin[r],
    ) as Vec3;
}

/** The silk's points over a grid, in the instrument frame, moving or at rest. */
function silkPoints(silk: SilkSpec, speed = 0, turn = 0): Vec3[] {
    const out: Vec3[] = [];
    const p = [0, 0, 0];
    for (let i = 0; i <= 6; i++)
        for (let j = 0; j <= 4; j++) {
            silkPoint(
                i / 6,
                j / 4,
                {
                    fly: silk.fly,
                    header: silk.header,
                    mirror: silk.mirror,
                    cut: silk.cut
                        ? silkCutProfile(silkShape(silk.cut).path)
                        : undefined,
                    wavePhase: 1,
                    bellyPhase: 1,
                    speed,
                    turn,
                },
                p,
            );
            out.push(silkToInstrument(silk, p));
        }
    return out;
}

const det = (b: SilkSpec["basis"]) =>
    b[0] * (b[4] * b[8] - b[5] * b[7]) -
    b[1] * (b[3] * b[8] - b[5] * b[6]) +
    b[2] * (b[3] * b[7] - b[4] * b[6]);

const INCH = 0.0254;
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: Vec3): Vec3 => {
    const l = Math.hypot(a[0], a[1], a[2]);
    return [a[0] / l, a[1] / l, a[2] / l];
};

/** An instrument-frame point placed in the body frame by a hold, as the window places it. */
function placer(h: Hold) {
    const z = unit(h.instrument.bellAxis);
    const c = h.instrument.capsAxis;
    const y = unit(
        sub(c, [z[0] * dot(c, z), z[1] * dot(c, z), z[2] * dot(c, z)]),
    );
    const x: Vec3 = [
        y[1] * z[2] - y[2] * z[1],
        y[2] * z[0] - y[0] * z[2],
        y[0] * z[1] - y[1] * z[0],
    ];
    const o = h.instrument.origin;
    return (p: Vec3): Vec3 => [
        o[0] + x[0] * p[0] + y[0] * p[1] + z[0] * p[2],
        o[1] + x[1] * p[0] + y[1] * p[1] + z[1] * p[2],
        o[2] + x[2] * p[0] + y[2] * p[1] + z[2] * p[2],
    ];
}

/**
 * Every silk point a model draws, in the instrument frame: its silk pieces
 * (the sleeve) and its silks' grids at rest and waving.
 */
function silkCloud(
    m: InstrumentModel,
    { rightOnly = false }: { rightOnly?: boolean } = {},
): Vec3[] {
    const out: Vec3[] = [];
    for (const p of m.pieces) {
        if (p.part !== PART_SILK || (rightOnly && p.bone)) continue;
        for (let i = 0; i < p.positions.length; i += 3)
            out.push([p.positions[i], p.positions[i + 1], p.positions[i + 2]]);
    }
    for (const silk of m.silks ?? []) {
        if (rightOnly && silk.bone) continue;
        for (const [speed, turn] of [
            [0, 0],
            [1.5, 0],
            [1.4, 0.6],
            [1.4, -0.6],
        ])
            out.push(...silkPoints(silk, speed, turn));
    }
    return out;
}

/** The distance from `p` to the segment from `a` to `b`. */
function toSegment(p: Vec3, a: Vec3, b: Vec3): number {
    const ab = sub(b, a);
    const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / dot(ab, ab)));
    return Math.hypot(
        ...sub(p, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]),
    );
}

const IDS: GuardModelId[] = [
    "flag6",
    "swingFlag",
    "doubleSwingFlag",
    "rifle",
    "sabre",
];

describe("guard equipment", () => {
    it.each(IDS)("%s stays within the triangle budgets", (id) => {
        expect(drawn(guardModel(id, "high"), "high")).toBeLessThanOrEqual(
            12000,
        );
        expect(drawn(guardModel(id, "high"), "high")).toBeGreaterThanOrEqual(
            1000,
        );
        expect(drawn(guardModel(id, "low"), "low")).toBeLessThanOrEqual(3500);
    });

    it("makes a 6 ft flag: pole along +Z with a silk at the top", () => {
        const m = guardModel("flag6");
        const pole = m.pieces.filter((p) => p.part === PART_CHROME);
        const b = bounds(pole);
        expect(b.max[2] - b.min[2]).toBeCloseTo(1.83, 1);
        // the silk is drawn by the silk mesh, not with the pieces
        expect(m.pieces.some((p) => p.part === PART_SILK)).toBe(false);
        expect(m.silks).toHaveLength(1);
        const silk = m.silks![0];
        expect(silk).toMatchObject({ ...FLAG6_SILK, mirror: 1 });
        expect(det(silk.basis)).toBeCloseTo(1, 12);
        // flat and lifted, it hangs from the pole's top out along +X
        const s = bounds([
            {
                part: PART_SILK,
                positions: silkPoints(silk, 1.5).flat(),
                normals: [],
                indices: [],
            },
        ]);
        expect(s.max[2]).toBeCloseTo(b.max[2], 6);
        expect(s.min[2]).toBeCloseTo(b.max[2] - 0.9, 6);
        expect(s.max[0]).toBeCloseTo(1.37 + 0.012, 1);
    });

    it("makes the swing flag the 44 by 66 in cut on a 52 in, half-inch pole", () => {
        const m = guardModel("swingFlag");
        const pole = bounds(m.pieces.filter((p) => p.part === PART_CHROME));
        expect(pole.max[2] - pole.min[2]).toBeCloseTo(52 * INCH, 3);
        expect(pole.max[0] - pole.min[0]).toBeCloseTo(0.5 * INCH, 3);
        // gripped near the butt, not partway up the pole
        expect(pole.min[2]).toBeLessThan(0);
        expect(pole.min[2]).toBeGreaterThan(-0.1);
        expect(m.silks).toHaveLength(1);
        const silk = m.silks![0];
        expect(silk.header).toBeCloseTo(44 * INCH, 6); // along the pole
        expect(silk.fly).toBeCloseTo(66 * INCH, 6);
        // the sheet starts at the pole's surface
        expect(silk.origin[0]).toBeCloseTo(SWING_FLAG.radius, 6);
        // the header runs down from the pole's top and ends above the hand
        expect(silk.origin[2]).toBeCloseTo(pole.max[2], 3);
        expect(silk.origin[2] - silk.header).toBeGreaterThan(0.1);
    });

    it("makes both of the double swing's flags the 44 by 66 in cut", () => {
        const m = guardModel("doubleSwingFlag");
        for (const silk of m.silks!)
            expect(silk).toMatchObject({
                fly: SWING_SILK.fly,
                header: SWING_SILK.header,
            });
    });

    it.each(["swingFlag", "doubleSwingFlag"] as const)(
        "keeps the %s silks off the forearms in every state of its hold",
        (id) => {
            // a forearm's radius in its sleeve, generously
            const FOREARM = 0.04;
            const silk = silkCloud(guardModel(id));
            for (const state of HOLD_STATES) {
                const h = hold(id, state);
                const place = placer(h);
                let nearest = Infinity;
                for (const p of silk) {
                    const v = place(p);
                    nearest = Math.min(
                        nearest,
                        toSegment(v, h.right.elbow, h.right.wrist),
                        toSegment(v, h.left.elbow, h.left.wrist),
                    );
                }
                expect(nearest, state).toBeGreaterThan(FOREARM);
            }
        },
    );

    // C4.11's known defect: as a rectangle at the real 52 in pole and 66 in
    // fly, the double swing's silks dipped into the turf at down 45 (20 cm
    // with the wave's droop). The swing Cut rounds its top fly corner away,
    // and that corner was the low point.
    it("keeps the double swing's silks off the turf at down 45", () => {
        const m = guardModel("doubleSwingFlag");
        // the swing holds' "up" state is the down 45 wait (holds.ts)
        const place = placer(hold("doubleSwingFlag", "up"));
        let lowest = Infinity;
        for (const p of silkCloud(m, { rightOnly: true }))
            lowest = Math.min(lowest, place(p)[1]);
        expect(lowest).toBeGreaterThan(0);
    });

    it("gives the double swing flag a second flag in the left hand", () => {
        const m = guardModel("doubleSwingFlag");
        expect(m.silks).toHaveLength(2);
        const [right, left] = m.silks!;
        expect(right.bone).toBeUndefined();
        expect(left.bone).toBe("handL");
        expect(left.mirror).toBe(-1);
        // both frames stay rotations: the mirror is in the wave
        expect(det(right.basis)).toBeCloseTo(1, 12);
        expect(det(left.basis)).toBeCloseTo(1, 12);
    });

    it("makes the rifle and sabre run along +Z from the grip", () => {
        const r = bounds(guardModel("rifle").pieces);
        expect(r.max[2] - r.min[2]).toBeCloseTo(0.91, 1);
        expect(r.min[2]).toBeLessThan(0);
        const s = bounds(guardModel("sabre").pieces);
        expect(s.max[2]).toBeGreaterThan(0.7);
        expect(s.min[2]).toBeLessThan(0);
    });

    it("hangs the rifle's sling taut between its swivel tips", () => {
        const m = guardModel("rifle");
        // the sling: the black piece that runs between the swivels
        const sling = m.pieces.filter(
            (p) => p.part === PART_BLACK && bounds([p]).min[2] < 0,
        );
        expect(sling.length).toBe(1);
        const ringY = (z: number) => {
            const ys: number[] = [];
            const pos = sling[0].positions;
            for (let i = 0; i < pos.length; i += 3)
                if (Math.abs(pos[i + 2] - z) < 0.01) ys.push(pos[i + 1]);
            expect(ys.length).toBeGreaterThan(0);
            return ys.reduce((a, b) => a + b, 0) / ys.length;
        };
        // each end at its swivel's tip, 12 mm under the body
        for (const z of [RIFLE_SWIVELS.back, RIFLE_SWIVELS.front]) {
            const tip = sectionAt(RIFLE_STATIONS, z).bottom - 0.012;
            expect(Math.abs(ringY(z) - tip)).toBeLessThan(0.004);
        }
    });

    it("hangs each swivel from the body's underside, not inside it", () => {
        const m = guardModel("rifle");
        const body = m.pieces.filter((p) => p.part === PART_WOOD);
        expect(body.length).toBe(1);
        for (const z of [RIFLE_SWIVELS.back, RIFLE_SWIVELS.front]) {
            // the body's lowest point on its ring nearest the swivel
            let underside = 0;
            const bp = body[0].positions;
            for (let i = 0; i < bp.length; i += 3)
                if (Math.abs(bp[i + 2] - z) < 0.01)
                    underside = Math.min(underside, bp[i + 1]);
            const swivel = m.pieces.filter((p) => {
                const b = bounds([p]);
                return (
                    p.part === PART_CHROME &&
                    b.min[2] > z - 0.01 &&
                    b.max[2] < z + 0.01
                );
            });
            expect(swivel.length).toBe(1);
            const b = bounds(swivel);
            // it starts just inside the wood and hangs below it
            expect(b.max[1]).toBeLessThan(underside + 0.008);
            expect(b.min[1]).toBeLessThan(underside - 0.01);
        }
    });

    it("shapes the rifle like a drill rifle: deep butt, slim wrist, no barrel", () => {
        const depth = (z: number) => {
            const s = sectionAt(RIFLE_STATIONS, z);
            return s.top - s.bottom;
        };
        expect(depth(-0.28)).toBeGreaterThan(0.1);
        // the wrist under the hand is the slimmest part behind the muzzle
        expect(depth(0)).toBeLessThan(0.04);
        expect(depth(0)).toBeLessThan(depth(0.3));
        // flat-sided: deeper than it is wide at the butt
        expect(depth(-0.2)).toBeGreaterThan(
            2 * 2 * sectionAt(RIFLE_STATIONS, -0.2).half,
        );
        // nothing but the body reaches the muzzle
        const m = guardModel("rifle");
        const ahead = m.pieces.filter((p) => bounds([p]).max[2] > 0.5);
        expect(ahead.every((p) => p.part === PART_WOOD)).toBe(true);
    });

    it("holds a swing flag at its butt, a bare tab above the fist", () => {
        const m = guardModel("swingFlag");
        const pole = bounds(m.pieces.filter((p) => p.part === PART_CHROME));
        // the butt just past the fist, the pole running on from it
        expect(pole.min[2]).toBeGreaterThan(-0.12);
        expect(pole.max[2]).toBeGreaterThan(0.9);
        // the sheet, drawn by the silk mesh, at the swing cut's size
        expect(m.silks).toHaveLength(1);
        const sheet = m.silks![0];
        expect(sheet).toMatchObject(SWING_SILK);
        // a bare tab between the hand and the silk: 52 in of pole less the 44 in
        // header, less the 6 cm of butt below the fist
        expect(sheet.origin[2] - sheet.header).toBeCloseTo(8 * INCH - 0.06, 3);
        // a sleeve of silk around the pole: the one silk piece
        expect(m.pieces.filter((p) => p.part === PART_SILK)).toHaveLength(1);
    });

    it("mirrors the second swing flag onto the left hand", () => {
        const m = guardModel("doubleSwingFlag");
        const h = hold("doubleSwingFlag", "up").instrument;
        // instrument frame to body, as instrumentGeometry places it
        const z = h.bellAxis;
        const dz = h.capsAxis.reduce((a, v, i) => a + v * z[i], 0);
        const y0 = h.capsAxis.map((v, i) => v - dz * z[i]);
        const ly = Math.hypot(...y0);
        const y = y0.map((v) => v / ly);
        const x = [
            y[1] * z[2] - y[2] * z[1],
            y[2] * z[0] - y[0] * z[2],
            y[0] * z[1] - y[1] * z[0],
        ];
        const toBody = (p: Piece) => {
            const out: number[] = [];
            for (let i = 0; i < p.positions.length; i += 3) {
                const [a, b, c] = p.positions.slice(i, i + 3);
                for (let k = 0; k < 3; k++)
                    out.push(x[k] * a + y[k] * b + z[k] * c + h.origin[k]);
            }
            return out;
        };
        const right = m.pieces.filter((p) => !p.bone);
        const left = m.pieces.filter((p) => p.bone === "handL");
        expect(left.length).toBe(right.length);
        for (let i = 0; i < right.length; i++) {
            const r = toBody(right[i]);
            const l = toBody(left[i]);
            for (let k = 0; k < r.length; k += 3) {
                expect(l[k]).toBeCloseTo(-r[k], 6);
                expect(l[k + 1]).toBeCloseTo(r[k + 1], 6);
                expect(l[k + 2]).toBeCloseTo(r[k + 2], 6);
            }
        }
        // the left silk, waving, is the right one's mirror image
        const [rs, ls] = m.silks!;
        for (const [speed, turn] of [
            [0, 0],
            [1.4, 0.6],
        ]) {
            const r = toBody({
                part: PART_SILK,
                positions: silkPoints(rs, speed, turn).flat(),
                normals: [],
                indices: [],
            });
            const l = toBody({
                part: PART_SILK,
                positions: silkPoints(ls, speed, turn).flat(),
                normals: [],
                indices: [],
            });
            for (let k = 0; k < r.length; k += 3) {
                expect(l[k]).toBeCloseTo(-r[k], 6);
                expect(l[k + 1]).toBeCloseTo(r[k + 1], 6);
                expect(l[k + 2]).toBeCloseTo(r[k + 2], 6);
            }
        }
    });

    it("gives the sabre a chrome hilt and a capped tip", () => {
        const m = guardModel("sabre");
        expect(m.pieces.some((p) => p.part === PART_METAL)).toBe(false);
        const tip = m.pieces.filter((p) => p.part === PART_WOOD);
        expect(tip.length).toBe(1);
        const all = bounds(m.pieces);
        expect(bounds(tip).max[2]).toBeCloseTo(all.max[2], 3);
        // the knuckle bow stands out past the fingers on the edge side
        expect(all.max[0]).toBeGreaterThan(0.06);
    });

    it("colors every vertex", () => {
        for (const id of IDS)
            for (const p of guardModel(id).pieces)
                expect(p.colors?.length).toBe(p.positions.length);
    });
});
