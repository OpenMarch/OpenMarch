/**
 * Ripple into the next form, pathways step 9 (spec Appendix L.10, QA-RP-1, QA-RP-2, QA-RP-8): a
 * line follows its leader along a connector into the form its end spots make. It is step 4's
 * follow move (R-9′, R-13′) with the connector as the trail's drawn part, so no rule is new; these
 * tests pin the shape the app writes: a shapeless follow-the-leader transition, slot order, the
 * form's spots dealt in trail order from the entrance, a trail route from the leader's start to
 * the entrance with the connector's corners (none for a straight one).
 *
 * Expected positions are worked by hand, and the random cases are checked against the spec's own
 * reference oracle (`docs/timeline/ref`), written apart from this package.
 */
import { describe, expect, it } from "vitest";
import { createOracle } from "../oracle";
import { createCachedResolver } from "../resolver";
import type { RoutePoint, TimelineSnapshot, XY } from "../types";
import { mulberry32 } from "./showGenerators";
// @ts-expect-error: the spec's reference implementation is plain JavaScript
import { makeOracle } from "../../../../../docs/timeline/ref/oracle.mjs";

const refOracle = makeOracle as (db: TimelineSnapshot) => {
    positionAt(m: number, b: number): XY;
};

const clone = <T>(x: T): T => structuredClone(x);
const near = (a: XY, b: XY, eps = 1e-9) =>
    Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps;

/**
 * Four marchers in a line, M1 (the tail) to M4 (the leader), ripple over [0, 16) into `spots`
 * (the form from its entrance: slot q is the q-th marcher's), along a connector with `corners`.
 */
function rippleShow(
    homes: readonly XY[],
    spots: readonly XY[],
    corners: readonly XY[],
): TimelineSnapshot {
    const points: RoutePoint[] = corners.map((at, i) => ({ id: `c${i}`, at }));
    return {
        marchers: homes.map((home, i) => ({ id: i + 1, home })),
        shapes: {},
        transitions: {
            1: {
                id: 1,
                start: 0,
                end: 16,
                dest: null,
                slots: homes.length,
                style: "follow_the_leader",
                order: "slot",
                params: { waypoints: [] },
                route: 1,
                points: spots.map((p) => [p[0], p[1]]),
            },
        },
        routes: {
            1: {
                geometry: {
                    v: 1,
                    from: homes[homes.length - 1]!,
                    to: spots[0]!,
                    points,
                },
            },
        },
        assignments: homes.map((_, i) => ({
            id: i + 1,
            marcher: i + 1,
            transition: 1,
            slot: i,
            start: 0,
            end: 16,
            layer: 0,
        })),
    };
}

const LINE: XY[] = [
    [0, 0],
    [2, 0],
    [4, 0],
    [6, 0],
];
/** The next form: a line from (10,10) to (16,10), entered at (10,10), the end nearer the leader */
const FORM: XY[] = [
    [10, 10],
    [12, 10],
    [14, 10],
    [16, 10],
];

/** Where `d` is along the polyline `pts`, by a linear scan (the test's own) */
function alongPolyline(pts: readonly XY[], d: number): XY {
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (d <= acc + len && len > 0) {
            const f = (d - acc) / len;
            return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        }
        acc += len;
    }
    return pts[pts.length - 1]!;
}

describe("Ripple into the next form (spec L.10)", () => {
    it("QA-RP-1: a straight connector is R-9 with no waypoints: line-up, chord to the entrance, then the form", () => {
        const db = rippleShow(LINE, FORM, []);
        const res = createCachedResolver(clone(db));
        const entry = res.ftlEntry(1);
        // The line-up 0, 2, 4, 6; the connector (6,0) → (10,10) is √116; the form 0, 2, 4, 6 in
        const c = Math.sqrt(116);
        expect(entry.members).toEqual([1, 2, 3, 4]);
        expect(entry.startDist).toEqual([0, 2, 4, 6]);
        for (let q = 0; q < 4; q++)
            expect(entry.endDist[q]).toBeCloseTo(6 + c + 2 * q, 12);
        const way: XY[] = [...LINE, ...FORM];
        for (let b = 0; b <= 16; b += 0.25)
            for (let q = 0; q < 4; q++) {
                const p = b / 16;
                const d =
                    entry.startDist[q]! +
                    (entry.endDist[q]! - entry.startDist[q]!) * p;
                const expected = b >= 16 ? FORM[q]! : alongPolyline(way, d);
                expect(
                    near(res.positionAt(q + 1, b), expected, 1e-9),
                    `M${q + 1}@${b}`,
                ).toBe(true);
            }
        // Ends exact, bit for bit
        for (let q = 0; q < 4; q++)
            expect(res.positionAt(q + 1, 16)).toEqual(FORM[q]);
        // The same as the transition with no route at all (QA-TR-2's rule)
        const bare = clone(db);
        delete bare.transitions[1]!.route;
        bare.routes = {};
        const plain = createCachedResolver(bare);
        for (let b = 0; b <= 16; b += 0.5)
            for (const m of [1, 2, 3, 4])
                expect(res.positionAt(m, b)).toEqual(plain.positionAt(m, b));
    });

    it("QA-RP-2: a corner bends the connector; the ends are dealt the same", () => {
        const db = rippleShow(LINE, FORM, [[6, 10]]);
        const res = createCachedResolver(clone(db));
        const entry = res.ftlEntry(1);
        // The connector (6,0) → (6,10) → (10,10) is 14 long
        expect(entry.endDist).toEqual([20, 22, 24, 26]);
        // The leader at the corner: distance 16 of its 6..26 walk, so p = 0.5, beat 8
        expect(near(res.positionAt(4, 8), [6, 10])).toBe(true);
        // The tail turns the corner later, at its own distance 16 of 0..20: p = 0.8, beat 12.8
        expect(near(res.positionAt(1, 12.8), [6, 10])).toBe(true);
    });

    it("no overtaking: everyone stays in trail order along the trail at every 1/8 beat (P-5)", () => {
        const db = rippleShow(LINE, FORM, [[3, 8]]);
        const res = createCachedResolver(clone(db));
        const entry = res.ftlEntry(1);
        for (let b = 0; b <= 16; b += 1 / 8) {
            const p = b / 16;
            const ds = [0, 1, 2, 3].map(
                (q) =>
                    entry.startDist[q]! +
                    (entry.endDist[q]! - entry.startDist[q]!) * p,
            );
            for (let q = 1; q < 4; q++)
                expect(ds[q]!).toBeGreaterThan(ds[q - 1]!);
        }
    });

    it("QA-RP-8: random ripples, straight or cornered, either end entered, a line or an arc form: the resolver agrees with both oracles", () => {
        for (let seed = 1; seed <= 40; seed++) {
            const R = mulberry32(9000 + seed);
            const n = 2 + Math.floor(R() * 4);
            const step = 1 + R() * 2;
            const homes: XY[] = Array.from({ length: n }, (_, i) => [
                i * step,
                R() < 0.3 ? R() : 0,
            ]);
            // The form: a line or an arc of n spots somewhere up the field
            const cx = 10 + R() * 30;
            const cy = 10 + R() * 30;
            const arc = R() < 0.5;
            let form: XY[] = Array.from(
                { length: n },
                (_, i): XY =>
                    arc
                        ? [
                              cx + 8 * Math.cos((i / n) * Math.PI),
                              cy + 8 * Math.sin((i / n) * Math.PI),
                          ]
                        : [cx + i * step, cy + i * step * 0.5],
            );
            // Either end entered: the form dealt from that end
            if (R() < 0.5) form = form.reverse();
            const corners: XY[] = Array.from(
                { length: Math.floor(R() * 3) },
                () => [Math.round(R() * 40) - 5, Math.round(R() * 40) - 5],
            );
            const db = rippleShow(homes, form, corners);
            const res = createCachedResolver(clone(db));
            const ref = refOracle(clone(db));
            const own = createOracle(clone(db));
            for (let m = 1; m <= n; m++)
                for (let b = 0; b <= 16; b += 1 / 8) {
                    const x = res.positionAt(m, b);
                    expect(
                        near(x, ref.positionAt(m, b), 1e-9),
                        `seed ${seed}: M${m}@${b} resolver ${x} ref ${ref.positionAt(m, b)}`,
                    ).toBe(true);
                    expect(near(x, own.positionAt(m, b), 1e-9)).toBe(true);
                }
        }
    }, 30_000);
});
