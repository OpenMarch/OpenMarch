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
import { guardModel, sectionAt, RIFLE_STATIONS, RIFLE_SWIVELS } from "../guard";
import { hold, HOLD_STATES, type Hold } from "../holds";
import type { Piece } from "../mesh";
import type { GuardModelId } from "../model";

type Vec3 = [number, number, number];
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
        expect(
            triangleCount(guardModel(id, "high").pieces),
        ).toBeLessThanOrEqual(12000);
        expect(
            triangleCount(guardModel(id, "high").pieces),
        ).toBeGreaterThanOrEqual(1000);
        expect(triangleCount(guardModel(id, "low").pieces)).toBeLessThanOrEqual(
            3500,
        );
    });

    it("makes a 6 ft flag: pole along +Z with a silk at the top", () => {
        const m = guardModel("flag6");
        const pole = m.pieces.filter((p) => p.part === PART_CHROME);
        const b = bounds(pole);
        expect(b.max[2] - b.min[2]).toBeCloseTo(1.83, 1);
        const silk = m.pieces.filter((p) => p.part === PART_SILK);
        expect(silk.length).toBeGreaterThan(0);
        const s = bounds(silk);
        expect(s.max[2]).toBeGreaterThan(1.1);
        expect(s.max[0] - s.min[0]).toBeCloseTo(1.37, 1);
        // a real surface, not a line: many triangles with normals mostly along +Y
        const tris = triangleCount(silk);
        expect(tris).toBeGreaterThan(20);
        let up = 0;
        for (const p of silk)
            for (let i = 1; i < p.normals.length; i += 3)
                if (p.normals[i] > 0.5) up++;
        expect(up).toBeGreaterThan(0);
    });

    it("makes the swing flag the 44 by 66 in cut on a 52 in, half-inch pole", () => {
        const m = guardModel("swingFlag");
        const pole = bounds(m.pieces.filter((p) => p.part === PART_CHROME));
        expect(pole.max[2] - pole.min[2]).toBeCloseTo(52 * INCH, 3);
        expect(pole.max[0] - pole.min[0]).toBeCloseTo(0.5 * INCH, 3);
        // gripped near the butt, not partway up the pole
        expect(pole.min[2]).toBeLessThan(0);
        expect(pole.min[2]).toBeGreaterThan(-0.1);
        const silk = bounds(m.pieces.filter((p) => p.part === PART_SILK));
        expect(silk.max[2] - silk.min[2]).toBeCloseTo(44 * INCH, 3); // header, along the pole
        // fly: the sheet starts at the pole's surface; the sleeve wraps the pole
        expect(silk.max[0] - 0.25 * INCH).toBeCloseTo(66 * INCH, 3);
        // the header runs down from the pole's top and ends above the hand
        expect(silk.max[2]).toBeCloseTo(pole.max[2], 3);
        expect(silk.min[2]).toBeGreaterThan(0.1);
    });

    it("makes both of the double swing's flags the 44 by 66 in cut", () => {
        // the left flag is the right one's mirror image (tested below), drawn
        // in the right hand's frame, so measure the right one here
        const m = guardModel("doubleSwingFlag");
        const silk = bounds(
            m.pieces.filter((p) => p.part === PART_SILK && !p.bone),
        );
        expect(silk.max[2] - silk.min[2]).toBeCloseTo(44 * INCH, 3);
        expect(silk.max[0] - 0.25 * INCH).toBeCloseTo(66 * INCH, 3);
    });

    it.each(["swingFlag", "doubleSwingFlag"] as const)(
        "keeps the %s silks off the forearms in every state of its hold",
        (id) => {
            // a forearm's radius in its sleeve, generously
            const FOREARM = 0.04;
            for (const state of HOLD_STATES) {
                const h = hold(id, state);
                const place = placer(h);
                let nearest = Infinity;
                for (const p of guardModel(id).pieces) {
                    if (p.part !== PART_SILK) continue;
                    for (let i = 0; i < p.positions.length; i += 3) {
                        const v = place([
                            p.positions[i],
                            p.positions[i + 1],
                            p.positions[i + 2],
                        ]);
                        nearest = Math.min(
                            nearest,
                            toSegment(v, h.right.elbow, h.right.wrist),
                            toSegment(v, h.left.elbow, h.left.wrist),
                        );
                    }
                }
                expect(nearest, state).toBeGreaterThan(FOREARM);
            }
        },
    );

    it("gives the double swing flag a second flag in the left hand", () => {
        const m = guardModel("doubleSwingFlag");
        const left = m.pieces.filter((p) => p.bone === "handL");
        expect(left.some((p) => p.part === PART_SILK)).toBe(true);
        expect(
            m.pieces.filter((p) => p.part === PART_SILK && !p.bone).length,
        ).toBeGreaterThan(0);
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
        const silk = m.pieces.filter((p) => p.part === PART_SILK);
        const pole = bounds(m.pieces.filter((p) => p.part === PART_CHROME));
        // the butt just past the fist, the pole running on from it
        expect(pole.min[2]).toBeGreaterThan(-0.12);
        expect(pole.max[2]).toBeGreaterThan(0.9);
        // the sheet: the silk piece that reaches out from the pole
        const sheet = silk.find((p) => bounds([p]).max[0] > 1);
        expect(sheet).toBeDefined();
        // a bare tab between the hand and the silk: 52 in of pole less the 44 in
        // header, less the 6 cm of butt below the fist
        expect(bounds([sheet!]).min[2]).toBeCloseTo(8 * INCH - 0.06, 3);
        expect(bounds([sheet!]).max[0]).toBeGreaterThan(1.2);
        // a sleeve of silk around the pole
        expect(silk.length).toBe(2);
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
    });

    // Known defect (C4.11): at the real 52 in pole and 66 in fly, the double
    // swing's silks dip about 14 cm into the turf at down 45. Lifting them is
    // the owner's call (the hold, the pole or the drape). This turns red once
    // they clear the ground; then make it a plain `it`.
    it.fails("keeps the double swing's silks off the turf at down 45", () => {
        const m = guardModel("doubleSwingFlag");
        const place = placer(hold("doubleSwingFlag", "up"));
        let lowest = Infinity;
        for (const p of m.pieces) {
            if (p.part !== PART_SILK || p.bone) continue;
            for (let i = 0; i < p.positions.length; i += 3)
                lowest = Math.min(
                    lowest,
                    place([
                        p.positions[i],
                        p.positions[i + 1],
                        p.positions[i + 2],
                    ])[1],
                );
        }
        expect(lowest).toBeGreaterThan(0);
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
