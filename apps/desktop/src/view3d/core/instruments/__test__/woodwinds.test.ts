// apps/desktop/src/view3d/core/instruments/__test__/woodwinds.test.ts
import { describe, expect, it } from "vitest";
import {
    bounds,
    triangleCount,
    PART_BLACK,
    PART_CHROME,
    PART_METAL,
    type Piece,
    type Vec3,
} from "../mesh";
import { SAX_SHAPES, WOODWIND_DIMENSIONS, woodwindModel } from "../woodwinds";
import { hold } from "../holds";
import type { WoodwindModelId } from "../model";

const IDS: WoodwindModelId[] = [
    "piccolo",
    "flute",
    "clarinet",
    "bassClarinet",
    "sopranoSax",
    "altoSax",
    "tenorSax",
    "bariSax",
];

describe("woodwind models", () => {
    it.each(IDS)("%s stays within the triangle budgets", (id) => {
        const high = triangleCount(woodwindModel(id, "high").pieces);
        const low = triangleCount(woodwindModel(id, "low").pieces);
        expect(high).toBeGreaterThanOrEqual(4000);
        expect(high).toBeLessThanOrEqual(24000);
        expect(low).toBeGreaterThanOrEqual(1000);
        expect(low).toBeLessThanOrEqual(3500);
    });

    it.each(IDS)("%s runs along +Z from the mouthpiece at the origin", (id) => {
        const m = woodwindModel(id);
        expect(m.mouthpiece).toEqual([0, 0, 0]);
        const b = bounds(m.pieces);
        expect(b.min[2]).toBeGreaterThan(-0.08); // nothing behind the lips but the mouthpiece
        expect(
            Math.abs(b.max[2] - WOODWIND_DIMENSIONS[id].length),
        ).toBeLessThan(0.08);
    });

    it("gives the flute and piccolo chrome bodies and the saxes lacquered ones", () => {
        const parts = (id: WoodwindModelId) =>
            new Set(woodwindModel(id).pieces.map((p) => p.part));
        expect(parts("flute").has(16)).toBe(false);
        expect(parts("flute").has(18)).toBe(true);
        expect(parts("altoSax").has(16)).toBe(true);
        expect(parts("clarinet").has(22)).toBe(true); // the black body
    });

    it("turns the sax bells back up past the bow", () => {
        for (const id of ["altoSax", "tenorSax", "bariSax"] as const) {
            const m = woodwindModel(id);
            // the widest ring is the bell rim and it sits well above the bow (smaller z than the max)
            const widest = m.pieces.reduce(
                (best, p) => {
                    const b = bounds([p]);
                    return b.max[0] - b.min[0] > best.w
                        ? {
                              w: b.max[0] - b.min[0],
                              z: (b.max[2] + b.min[2]) / 2,
                          }
                        : best;
                },
                { w: 0, z: 0 },
            );
            expect(widest.w).toBeCloseTo(WOODWIND_DIMENSIONS[id].bell, 1);
            expect(widest.z).toBeLessThan(bounds(m.pieces).max[2] - 0.15);
        }
    });

    it("colors every vertex and uses only instrument part ids", () => {
        for (const id of IDS)
            for (const p of woodwindModel(id, "high").pieces) {
                expect([16, 18, 22, 23]).toContain(p.part);
                expect(p.colors?.length).toBe(p.positions.length);
            }
    });
});

describe("woodwind key work and placement", () => {
    it("keeps the alto's rods and posts outside its conical body", () => {
        const m = woodwindModel("altoSax");
        const sh = SAX_SHAPES.altoSax;
        // the body runs from its top (12 cm above the left hand's grip) to the bow, on the axis y = yb
        const [, yb, grip] = m.leftGrip;
        const top = grip - 0.12;
        const bowZ =
            WOODWIND_DIMENSIONS.altoSax.length - sh.bowWidth / 2 - sh.rBow;
        const rAt = (z: number) =>
            sh.rTop + ((sh.rBow - sh.rTop) * (z - top)) / (bowZ - top);
        let checked = 0;
        for (const p of m.pieces) {
            if (p.part !== PART_CHROME) continue;
            const b = bounds([p]);
            // the rods and their posts: chrome pieces along the body, below the octave key
            if (b.min[2] < top + 0.045 || b.max[2] > bowZ - 0.02) continue;
            for (let i = 0; i < p.positions.length; i += 3) {
                const [x, y, z] = [
                    p.positions[i],
                    p.positions[i + 1],
                    p.positions[i + 2],
                ];
                expect(Math.hypot(x, y - yb)).toBeGreaterThanOrEqual(rAt(z));
                checked++;
            }
        }
        expect(checked).toBeGreaterThan(100);
    });

    it("hangs the bari's body as far in front of the chest as the alto's under the sax hold", () => {
        const h = hold("sax", "up");
        const zAxis = h.instrument.bellAxis;
        const len = Math.hypot(...zAxis);
        const z = zAxis.map((v) => v / len);
        const c = h.instrument.capsAxis;
        const d = c[0] * z[0] + c[1] * z[1] + c[2] * z[2];
        const y = c.map((v, i) => v - d * z[i]);
        const yl = Math.hypot(...y);
        // world forward (body +Z) of the body's front at its top
        const front = (id: "altoSax" | "bariSax") => {
            const [, yb, grip] = woodwindModel(id).leftGrip;
            const top = grip - 0.12;
            return (
                h.instrument.origin[2] +
                (yb * y[2]) / yl +
                top * z[2] -
                SAX_SHAPES[id].rTop
            );
        };
        // the chest's front is at z 0.12
        expect(front("altoSax")).toBeGreaterThan(0.15);
        expect(front("bariSax")).toBeGreaterThan(0.15);
        expect(Math.abs(front("bariSax") - front("altoSax"))).toBeLessThan(
            0.02,
        );
    });
});

const box = (p: Piece) => bounds([p]);
const mid = (p: Piece): Vec3 => {
    const b = box(p);
    return [0, 1, 2].map((k) => (b.min[k] + b.max[k]) / 2) as Vec3;
};
const size = (p: Piece): Vec3 => {
    const b = box(p);
    return [0, 1, 2].map((k) => b.max[k] - b.min[k]) as Vec3;
};
const vertices = (p: Piece): Vec3[] => {
    const out: Vec3[] = [];
    for (let i = 0; i < p.positions.length; i += 3)
        out.push([p.positions[i], p.positions[i + 1], p.positions[i + 2]]);
    return out;
};

/**
 * A flute's lathed key cups: chrome, round and shallow, facing out from
 * the tube's axis (Z). An open-hole (French) cup has a hole through its
 * top; a closed cup has a vertex at its top's center. A plain cylinder (a
 * tone hole's chimney, a post) has too few radii to be a cup.
 */
function flatCups(pieces: Piece[]) {
    const open: Vec3[] = [];
    const closed: Vec3[] = [];
    for (const p of pieces) {
        if (p.part !== PART_CHROME) continue;
        const c = mid(p);
        const l = Math.hypot(c[0], c[1]);
        if (l < 1e-4) continue;
        const n: Vec3 = [c[0] / l, c[1] / l, 0];
        const side: Vec3 = [n[1], -n[0], 0];
        const vs = vertices(p).map((v) => {
            const d: Vec3 = [v[0] - c[0], v[1] - c[1], v[2] - c[2]];
            const h = d[0] * n[0] + d[1] * n[1];
            const a = d[0] * side[0] + d[1] * side[1];
            return { h, a, z: d[2], lat: Math.hypot(a, d[2]) };
        });
        const span = (f: (x: (typeof vs)[number]) => number) =>
            Math.max(...vs.map(f)) - Math.min(...vs.map(f));
        const [sa, sz, sh] = [
            span((x) => x.a),
            span((x) => x.z),
            span((x) => x.h),
        ];
        if (sz < 0.005 || sz > 0.024 || Math.abs(sa - sz) > 0.1 * sz) continue;
        if (sh > 0.006) continue;
        const radii = new Set(vs.map((x) => Math.round(x.lat / 0.0002)));
        if (radii.size < 4) continue;
        const top = Math.max(...vs.map((x) => x.h));
        const hole = Math.min(
            ...vs.filter((x) => x.h > top - 0.0005).map((x) => x.lat),
        );
        (hole > 0.2 * (sz / 2) ? open : closed).push(c);
    }
    return { open, closed };
}

/** Pieces whose bounding boxes touch (within 1 mm) all join one group. */
function groups(pieces: Piece[]): number {
    const bs = pieces.map(box);
    const touch = (a: number, b: number) =>
        [0, 1, 2].every(
            (k) =>
                bs[a].min[k] <= bs[b].max[k] + 0.001 &&
                bs[b].min[k] <= bs[a].max[k] + 0.001,
        );
    const seen = new Set<number>();
    let count = 0;
    for (let i = 0; i < pieces.length; i++) {
        if (seen.has(i)) continue;
        count++;
        const stack = [i];
        seen.add(i);
        while (stack.length) {
            const a = stack.pop()!;
            for (let b = 0; b < pieces.length; b++)
                if (!seen.has(b) && touch(a, b)) {
                    seen.add(b);
                    stack.push(b);
                }
        }
    }
    return count;
}

/** A curved sax's body: its axis height, top, bow and radius along it. */
function saxBody(id: "altoSax" | "tenorSax" | "bariSax") {
    const sh = SAX_SHAPES[id];
    const m = woodwindModel(id);
    const [, yb, grip] = m.leftGrip;
    const top = grip - 0.12;
    const bowZ = WOODWIND_DIMENSIONS[id].length - sh.bowWidth / 2 - sh.rBow;
    const rAt = (z: number) =>
        sh.rTop + ((sh.rBow - sh.rTop) * (z - top)) / (bowZ - top);
    const at = (k: number) => top + (bowZ - top) * k;
    return { m, sh, yb, top, bowZ, rAt, at };
}

describe("woodwind real key work", () => {
    it.each(IDS)("%s: every part touches the rest, nothing floats", (id) => {
        for (const detail of ["high", "low"] as const)
            expect(groups(woodwindModel(id, detail).pieces)).toBe(1);
    });

    it("gives the flute five open-hole key cups along its +Y side and the piccolo none", () => {
        const r = WOODWIND_DIMENSIONS.flute.bore;
        const flute = flatCups(woodwindModel("flute").pieces);
        expect(flute.open.length).toBe(5);
        for (const c of flute.open) expect(c[1]).toBeGreaterThan(r * 0.8);
        expect(flute.closed.length).toBeGreaterThanOrEqual(8);
        const piccolo = flatCups(woodwindModel("piccolo").pieces);
        expect(piccolo.open.length).toBe(0);
        expect(piccolo.closed.length).toBeGreaterThanOrEqual(10);
    });

    it.each(["flute", "piccolo"] as const)(
        "%s: crown, lip plate, thumb keys underneath and trill keys on the side",
        (id) => {
            const m = woodwindModel(id);
            const r = WOODWIND_DIMENSIONS[id].bore;
            const end = bounds(m.pieces).max[2];
            // the lip plate: wider than the tube, on the player's side at the lips
            const plate = m.pieces.filter(
                (p) =>
                    p.part === PART_CHROME &&
                    Math.abs(mid(p)[2]) < 0.01 &&
                    box(p).min[1] < -r - 0.002 &&
                    size(p)[0] > 2 * r,
            );
            expect(plate.length).toBeGreaterThanOrEqual(1);
            const hole = m.pieces.filter(
                (p) =>
                    p.part === PART_BLACK &&
                    Math.abs(mid(p)[2]) < 0.01 &&
                    mid(p)[1] < -r,
            );
            expect(hole.length).toBe(1);
            // the crown closes the head behind the lips
            expect(bounds(m.pieces).min[2]).toBeLessThan(
                id === "flute" ? -0.05 : -0.033,
            );
            // thumb keys: chrome wholly under the tube in the body
            const thumb = m.pieces.filter(
                (p) =>
                    p.part === PART_CHROME &&
                    box(p).max[1] < -r * 0.5 &&
                    mid(p)[2] > 0.06 &&
                    mid(p)[2] < end * 0.6,
            );
            expect(thumb.length).toBeGreaterThanOrEqual(2);
            // trill keys: closed cups turned toward −X
            const trill = flatCups(m.pieces).closed.filter(
                (c) => c[0] < -r * 0.3,
            );
            expect(trill.length).toBeGreaterThanOrEqual(2);
        },
    );

    it("gives the flute a foot joint with its own rod and pinky rollers", () => {
        const m = woodwindModel("flute");
        const r = WOODWIND_DIMENSIONS.flute.bore;
        const end = WOODWIND_DIMENSIONS.flute.length - 0.045;
        const foot = end - 0.12;
        const rods = m.pieces.filter((p) => {
            const b = box(p);
            return (
                p.part === PART_CHROME &&
                size(p)[0] < 0.004 &&
                b.min[2] > foot - 0.001 &&
                b.max[2] - b.min[2] > 0.08
            );
        });
        expect(rods.length).toBe(1);
        const rollers = m.pieces.filter(
            (p) =>
                p.part === PART_CHROME &&
                mid(p)[0] < -r &&
                mid(p)[2] > foot &&
                mid(p)[2] < foot + 0.04,
        );
        expect(rollers.length).toBeGreaterThanOrEqual(2);
    });

    it("gives the clarinet a ligature with two screws, ring keys and a register key on the back", () => {
        const m = woodwindModel("clarinet");
        const r = WOODWIND_DIMENSIONS.clarinet.bore;
        const screws = m.pieces.filter(
            (p) =>
                p.part === PART_CHROME &&
                mid(p)[2] > 0.03 &&
                mid(p)[2] < 0.075 &&
                mid(p)[1] < -0.014 &&
                size(p)[2] < 0.01,
        );
        expect(screws.length).toBeGreaterThanOrEqual(2);
        // rings: chrome loops on the front, nothing at their middle
        const rings = m.pieces.filter((p) => {
            if (p.part !== PART_CHROME) return false;
            const [sx, , sz] = size(p);
            if (sx < 0.01 || sx > 0.02 || Math.abs(sx - sz) > 0.002)
                return false;
            const c = mid(p);
            return vertices(p).every(
                (v) => Math.hypot(v[0] - c[0], v[2] - c[2]) > sx * 0.3,
            );
        });
        expect(rings.filter((p) => mid(p)[1] > r).length).toBe(6);
        // the thumb ring and the register key behind it
        const back = m.pieces.filter(
            (p) =>
                p.part === PART_CHROME &&
                box(p).max[1] < -r * 0.6 &&
                mid(p)[2] > 0.15 &&
                mid(p)[2] < 0.24,
        );
        expect(back.length).toBeGreaterThanOrEqual(3);
        // tenon rings at the barrel and joints
        const bands = m.pieces.filter(
            (p) =>
                p.part === PART_CHROME &&
                size(p)[0] > 2.1 * r &&
                size(p)[2] < 0.016 &&
                mid(p)[2] > 0.08,
        );
        expect(bands.length).toBeGreaterThanOrEqual(5);
    });

    it("gives the bass clarinet more cups and rods along its body", () => {
        const m = woodwindModel("bassClarinet");
        const yb = m.leftGrip[1];
        const body = m.pieces.filter(
            (p) =>
                p.part === PART_CHROME &&
                mid(p)[2] > 0.2 &&
                mid(p)[2] < 0.87 &&
                Math.abs(mid(p)[1] - yb) < 0.06,
        );
        const rods = body.filter((p) => size(p)[2] > 0.1);
        expect(rods.length).toBeGreaterThanOrEqual(4);
        expect(body.length).toBeGreaterThanOrEqual(60);
    });

    it.each(["altoSax", "tenorSax", "bariSax"] as const)(
        "%s: palm keys up the left side, side keys on the right, guards and table keys by the bow",
        (id) => {
            const { m, sh, yb, top, bowZ, rAt, at } = saxBody(id);
            const w = sh.bowWidth;
            const outside = (p: Piece, side: 1 | -1) => {
                const c = mid(p);
                return (
                    side * c[0] > rAt(c[2]) + 0.002 &&
                    c[0] < w - sh.rBow &&
                    size(p)[2] < 0.06
                );
            };
            const palm = m.pieces.filter(
                (p) => outside(p, 1) && mid(p)[2] > top && mid(p)[2] < at(0.2),
            );
            expect(palm.length).toBeGreaterThanOrEqual(3);
            const side = m.pieces.filter(
                (p) =>
                    outside(p, -1) &&
                    mid(p)[2] > at(0.35) &&
                    mid(p)[2] < at(0.8),
            );
            expect(side.length).toBeGreaterThanOrEqual(3);
            // the low B, Bb and C# keys on the bell's tube, in front of it
            const rBell = sh.rBow * 1.08;
            const bellKeys = m.pieces.filter((p) => {
                const c = mid(p);
                return (
                    Math.abs(c[0] - w) < rBell * 1.2 &&
                    c[2] > bowZ - sh.bellRise &&
                    c[2] < bowZ &&
                    c[1] > yb + rBell * 0.7 &&
                    size(p)[2] < 0.05
                );
            });
            expect(bellKeys.length).toBeGreaterThanOrEqual(3);
            // key guards: thin lacquer arches standing well clear of the low C and Eb cups
            const guards = m.pieces.filter((p) => {
                const c = mid(p);
                return (
                    p.part === PART_METAL &&
                    c[2] > at(0.8) &&
                    c[2] < bowZ &&
                    size(p)[2] < 0.01 &&
                    vertices(p).some(
                        (v) => Math.hypot(v[0], v[1] - yb) > rAt(v[2]) + 0.009,
                    )
                );
            });
            expect(guards.length).toBeGreaterThanOrEqual(4);
            // thumb rest, thumb hook, strap ring and octave thumb key behind the body
            const back = m.pieces.filter((p) => {
                const c = mid(p);
                return (
                    c[2] > top &&
                    c[2] < bowZ &&
                    box(p).max[1] < yb - rAt(c[2]) * 0.6
                );
            });
            expect(back.length).toBeGreaterThanOrEqual(4);
            // pearls over the two stacks
            const pearls = m.pieces.filter((p) => {
                const c = mid(p);
                return (
                    p.part === PART_CHROME &&
                    c[2] > at(0.15) &&
                    c[2] < at(0.76) &&
                    Math.abs(c[0]) < rAt(c[2]) * 0.4 &&
                    c[1] > yb + rAt(c[2]) + 0.003
                );
            });
            expect(pearls.length).toBeGreaterThanOrEqual(6);
            // the octave key on the neck, past the mouthpiece and above the body
            const neck = m.pieces.filter((p) => {
                const c = mid(p);
                return (
                    Math.hypot(...c) > sh.mpLength + 0.01 &&
                    c[2] > -0.05 &&
                    c[2] < top - 0.01 &&
                    Math.max(...size(p)) < 0.03
                );
            });
            expect(neck.length).toBeGreaterThanOrEqual(2);
        },
    );

    it("gives the soprano palm keys, side keys, pearls and back hardware", () => {
        const m = woodwindModel("sopranoSax");
        const rAt = (z: number) => 0.012 + (0.018 * (z - 0.06)) / 0.49;
        const count = (f: (c: Vec3, p: Piece) => boolean) =>
            m.pieces.filter((p) => f(mid(p), p)).length;
        expect(
            count((c) => c[2] < 0.2 && c[2] > 0.06 && c[0] > rAt(c[2]) + 0.002),
        ).toBeGreaterThanOrEqual(3);
        expect(
            count(
                (c) => c[2] > 0.2 && c[2] < 0.45 && c[0] < -rAt(c[2]) - 0.002,
            ),
        ).toBeGreaterThanOrEqual(3);
        expect(
            count(
                (c, p) =>
                    p.part === PART_CHROME &&
                    c[2] > 0.1 &&
                    c[2] < 0.45 &&
                    Math.abs(c[0]) < rAt(c[2]) * 0.4 &&
                    c[1] > rAt(c[2]) + 0.003,
            ),
        ).toBeGreaterThanOrEqual(6);
        expect(
            count(
                (c, p) =>
                    c[2] > 0.07 &&
                    c[2] < 0.5 &&
                    box(p).max[1] < -rAt(c[2]) * 0.6,
            ),
        ).toBeGreaterThanOrEqual(4);
    });

    it.each(["flute", "piccolo", "clarinet", "sopranoSax", "altoSax"] as const)(
        "%s: no key cup or post crosses the bore",
        (id) => {
            const m = woodwindModel(id);
            let axisY = 0;
            let rAt = (_z: number) => WOODWIND_DIMENSIONS[id].bore;
            let z0 = 0.02;
            let z1 = WOODWIND_DIMENSIONS[id].length - 0.1;
            if (id === "sopranoSax") {
                rAt = (z) => 0.012 + (0.018 * (z - 0.06)) / 0.49;
                z0 = 0.07;
            }
            if (id === "altoSax") {
                const b = saxBody(id);
                axisY = b.yb;
                rAt = b.rAt;
                z0 = b.top + 0.02;
                z1 = b.bowZ;
            }
            if (id === "clarinet") z0 = 0.1;
            let checked = 0;
            for (const p of m.pieces) {
                const c = mid(p);
                if (c[2] < z0 || c[2] > z1) continue;
                if (size(p)[0] > 1.8 * rAt(c[2])) continue; // the body and its rings
                for (const v of vertices(p)) {
                    expect(Math.hypot(v[0], v[1] - axisY)).toBeGreaterThan(
                        0.5 * rAt(v[2]),
                    );
                    checked++;
                }
            }
            expect(checked).toBeGreaterThan(1000);
        },
    );
});
