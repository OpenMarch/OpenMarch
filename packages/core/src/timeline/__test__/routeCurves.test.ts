// cspell:ignore lerp
/**
 * Routes with curves, v0.9 step 2 (spec R-14, Appendix I.6): QA-RT-9 to QA-RT-13 and QA-DB-R5.
 * QA-RT-14 (against the shape tool's Line) is in the desktop app, which owns the Line.
 *
 * The positions are checked against the `ref/` oracle's own code (`docs/timeline/ref/geom.mjs`,
 * written separately), bit for bit, and constant speed is checked from first principles.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error: the spec's reference implementation is plain JavaScript
import { routeWalk } from "../../../../../docs/timeline/ref/geom.mjs";
import {
    EPS_GEOM,
    cubicPoint,
    routePath,
    routePoint,
    smoothHandles,
    type RouteVertex,
} from "../geom";
import { createOracle } from "../oracle";
import { createCachedResolver } from "../resolver";
import type { TimelineSnapshot, XY } from "../types";
import { validateRouteGeometry } from "../validate";
import { mulberry32 } from "./showGenerators";

type RefWalk = { at(p: number): XY; L: number };
const refWalk = routeWalk as (
    A: XY,
    pts: readonly RouteVertex[],
    B: XY,
    F?: XY,
    G?: XY,
) => RefWalk;

const same = (p: XY, q: XY) => Object.is(p[0], q[0]) && Object.is(p[1], q[1]);
const d = (p: XY, q: XY) => Math.hypot(q[0] - p[0], q[1] - p[1]);
const probes = Array.from({ length: 201 }, (_, i) => -0.25 + i * 0.0075);

/** Step 1's evaluation as built (`routePoint` before step 2): the polyline walk. */
function stepOne(A: XY, inner: XY[], B: XY, p: number): XY {
    const V: XY[] = [A];
    for (const P of inner) if (d(V[V.length - 1]!, P) >= EPS_GEOM) V.push(P);
    while (V.length > 1 && d(V[V.length - 1]!, B) < EPS_GEOM) V.pop();
    V.push(B);
    const D = [0];
    for (let j = 0; j + 1 < V.length; j++) D.push(D[j]! + d(V[j]!, V[j + 1]!));
    const L = D[D.length - 1]!;
    const lerp = (a: XY, b: XY, t: number): XY =>
        t <= 0
            ? a
            : t >= 1
              ? b
              : [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    if (p <= 0) return A;
    if (p >= 1) return B;
    if (V.length === 2 || L < EPS_GEOM) return lerp(A, B, p);
    const x = p * L;
    let j = 0;
    while (j < V.length - 2 && !(x < D[j + 1]!)) j++;
    return lerp(V[j]!, V[j + 1]!, (x - D[j]!) / (D[j + 1]! - D[j]!));
}

function randomRoute(R: () => number) {
    const pt = (): XY => [
        Math.round((R() - 0.5) * 400) / 4,
        Math.round((R() - 0.5) * 400) / 4,
    ];
    const n = Math.floor(R() * 7);
    const points: RouteVertex[] = Array.from({ length: n }, () =>
        R() < 0.6
            ? { at: pt(), tension: Math.max(0.1, Math.round(R() * 20) / 10) }
            : { at: pt() },
    );
    return { A: pt(), B: pt(), points, F: pt(), G: pt() };
}

describe("routes with curves (spec R-14, v0.9 step 2)", () => {
    it("QA-RT-9: a route with no smooth point walks exactly as step 1 did", () => {
        const R = mulberry32(9);
        for (let k = 0; k < 300; k++) {
            const { A, B, points } = randomRoute(R);
            const corners = points.map((q) => q.at);
            const path = routePath(A, corners, B, { from: [1, 2], to: [3, 4] });
            expect(path.pieces.every((p) => p.kind === "line")).toBe(true);
            for (const p of probes)
                expect(
                    same(routePoint(path, p), stepOne(A, corners, B, p)),
                ).toBe(true);
        }
    });

    it("QA-RT-10: one smooth point between symmetric ends: on it at the middle beat, exact ends, the oracle agrees", () => {
        const A: XY = [0, 0];
        const B: XY = [8, 0];
        const pts = [{ at: [4, 4] as XY, tension: 1 }];
        const path = routePath(A, pts, B);
        expect(path.pieces.map((p) => p.kind)).toEqual(["cubic", "cubic"]);
        const mid = routePoint(path, 0.5);
        expect(d(mid, [4, 4])).toBeLessThan(1e-9);
        expect(same(routePoint(path, 0), A)).toBe(true);
        expect(same(routePoint(path, 1), B)).toBe(true);
        // A curve, not the corner path through (4, 4)
        expect(d(routePoint(path, 0.25), [2, 2])).toBeGreaterThan(1e-3);
        const ref = refWalk(A, pts, B);
        for (const p of probes)
            expect(same(routePoint(path, p), ref.at(p))).toBe(true);
        expect(path.L).toBe(ref.L);
    });

    it("QA-RT-11: random curved routes match the oracle bit for bit and walk at one speed along the declared measure", () => {
        const R = mulberry32(11);
        for (let k = 0; k < 200; k++) {
            const { A, B, points, F, G } = randomRoute(R);
            const path = routePath(A, points, B, { from: F, to: G });
            const ref = refWalk(A, points, B, F, G);
            expect(path.L).toBe(ref.L);
            for (const p of probes) {
                const q = routePoint(path, p);
                expect(same(q, ref.at(p)), `route ${k} at ${p}`).toBe(true);
                expect(Number.isFinite(q[0]) && Number.isFinite(q[1])).toBe(
                    true,
                );
            }
            if (path.L < 1) continue;
            // Constant speed: the distance from A to the probe, measured on R-14's own samples
            // (recomputed here), is p · L
            for (let i = 1; i < 40; i++) {
                const p = i / 40;
                const at = routePoint(path, p);
                let best = Infinity;
                let along = NaN;
                let acc = 0;
                path.pieces.forEach((piece, j) => {
                    const P0 = path.V[j]!;
                    const P3 = path.V[j + 1]!;
                    const poly: XY[] =
                        piece.kind === "line"
                            ? [P0, P3]
                            : Array.from({ length: 65 }, (_, s) =>
                                  cubicPoint(
                                      P0,
                                      piece.c1,
                                      piece.c2,
                                      P3,
                                      s / 64,
                                  ),
                              );
                    for (let s = 0; s + 1 < poly.length; s++) {
                        const len = d(poly[s]!, poly[s + 1]!);
                        // distance from `at` to this sample chord, and how far along it
                        const t =
                            len === 0
                                ? 0
                                : Math.max(
                                      0,
                                      Math.min(
                                          1,
                                          ((at[0] - poly[s]![0]) *
                                              (poly[s + 1]![0] - poly[s]![0]) +
                                              (at[1] - poly[s]![1]) *
                                                  (poly[s + 1]![1] -
                                                      poly[s]![1])) /
                                              (len * len),
                                      ),
                                  );
                        const off = d(at, [
                            poly[s]![0] + (poly[s + 1]![0] - poly[s]![0]) * t,
                            poly[s]![1] + (poly[s + 1]![1] - poly[s]![1]) * t,
                        ]);
                        const here = acc + t * len;
                        if (
                            off < best - 1e-12 ||
                            (Math.abs(off - best) <= 1e-12 &&
                                Math.abs(here - p * path.L) <
                                    Math.abs(along - p * path.L))
                        ) {
                            best = off;
                            along = here;
                        }
                        acc += len;
                    }
                });
                // The evaluated point is on the curve between two samples, within the
                // samples' sag of the chord; along the chords it is at p · L
                expect(Math.abs(along - p * path.L)).toBeLessThan(
                    1e-3 * path.L,
                );
            }
        }
    });

    it("QA-RT-12: moving A or B changes only the pieces touching them, even onto the first inner point", () => {
        const pts: RouteVertex[] = [
            { at: [10, 10], tension: 1 },
            { at: [20, -5], tension: 1.5 },
            { at: [30, 10] },
            { at: [40, 0], tension: 0.7 },
        ];
        const ends = { from: [0, 0] as XY, to: [50, 0] as XY };
        const base = routePath([0, 0], pts, [50, 0], ends);
        const inner = (path: ReturnType<typeof routePath>) =>
            path.pieces.slice(1, -1).map((p) => JSON.stringify(p));
        for (const [A, B] of [
            [
                [-7, 3],
                [50, 0],
            ],
            [
                [0, 0],
                [61, -9],
            ],
            [
                [-3, -20],
                [44, 12],
            ],
        ] as [XY, XY][]) {
            const moved = routePath(A, pts, B, ends);
            expect(inner(moved)).toEqual(inner(base));
        }
        // A lands on the first inner point: it's cleaned away; the pieces between the points left
        // keep their controls
        const onto = routePath([10, 10], pts, [50, 0], ends);
        expect(onto.V).toHaveLength(base.V.length - 1);
        expect(onto.pieces.slice(1, -1).map((p) => JSON.stringify(p))).toEqual(
            base.pieces.slice(2, -1).map((p) => JSON.stringify(p)),
        );
    });

    it("QA-RT-13: degenerate neighbors, repeated points, a hairpin at full roundness: finite, exact ends, no zero piece", () => {
        const cases: [XY, RouteVertex[], XY, XY, XY][] = [
            // F on the first point: mirrored
            [
                [0, 0],
                [{ at: [5, 5], tension: 1 }, { at: [9, 0] }],
                [12, 0],
                [5, 5],
                [12, 0],
            ],
            // F and G both on the only point: a corner in effect
            [[0, 0], [{ at: [5, 5], tension: 2 }], [10, 0], [5, 5], [5, 5]],
            // a smooth point next to a repeated one
            [
                [0, 0],
                [
                    { at: [5, 5] },
                    { at: [5, 5 + 1e-12], tension: 1 },
                    { at: [8, 1], tension: 1 },
                ],
                [12, 0],
                [0, 0],
                [12, 0],
            ],
            // a hairpin at roundness 2
            [
                [0, 0],
                [
                    { at: [10, 0], tension: 2 },
                    { at: [0, 0.5], tension: 2 },
                ],
                [10, 1],
                [0, 0],
                [10, 1],
            ],
            // a smooth point within EPS_GEOM of A is dropped
            [
                [0, 0],
                [
                    { at: [1e-10, 0], tension: 2 },
                    { at: [5, 5], tension: 1 },
                ],
                [10, 0],
                [0, 0],
                [10, 0],
            ],
        ];
        for (const [A, pts, B, from, to] of cases) {
            const path = routePath(A, pts, B, { from, to });
            const ref = refWalk(A, pts, B, from, to);
            for (let j = 0; j + 1 < path.D.length; j++)
                expect(path.D[j + 1]! - path.D[j]!).toBeGreaterThan(0);
            expect(same(routePoint(path, 0), A)).toBe(true);
            expect(same(routePoint(path, 1), B)).toBe(true);
            for (const p of probes) {
                const q = routePoint(path, p);
                expect(Number.isFinite(q[0]) && Number.isFinite(q[1])).toBe(
                    true,
                );
                expect(same(q, ref.at(p))).toBe(true);
            }
        }
        // The corner in effect: both handles on the point
        expect(smoothHandles([5, 5], [5, 5], [5, 5], 2)).toEqual({
            out: [5, 5],
            in: [5, 5],
        });
        // The dropped point's tension has no effect (its position still neighbors the next
        // point's tangent: tangents come from the route alone)
        const near = routePath([0, 0], cases[4]![1], [10, 0]);
        const asCorner = routePath(
            [0, 0],
            [{ at: [1e-10, 0] }, cases[4]![1][1]!],
            [10, 0],
        );
        for (const p of probes)
            expect(same(routePoint(near, p), routePoint(asCorner, p))).toBe(
                true,
            );
    });

    it("the resolver and the oracle walk a curved route identically, founding spans only (joins walk straight)", () => {
        const db: TimelineSnapshot = {
            marchers: [{ id: 1, home: [0, 0] }],
            shapes: {},
            transitions: {
                1: {
                    id: 1,
                    start: 0,
                    end: 8,
                    dest: null,
                    points: [[16, 0]],
                    slots: 1,
                    style: "direct",
                    order: "inherit",
                    params: null,
                },
            },
            lanes: { 1: { transition: 1, slot: 0, route: 1, offset: null } },
            routes: {
                1: {
                    geometry: {
                        v: 1,
                        from: [0, 0],
                        to: [16, 0],
                        points: [
                            { id: "a", at: [4, 6], tension: 1 },
                            { id: "b", at: [8, -6], tension: 1 },
                            { id: "c", at: [12, 6], tension: 1 },
                        ],
                    },
                },
            },
            assignments: [
                {
                    id: 1,
                    marcher: 1,
                    transition: 1,
                    slot: 0,
                    start: 0,
                    end: 8,
                    layer: 0,
                },
            ],
        };
        const res = createCachedResolver(structuredClone(db));
        const oracle = createOracle(structuredClone(db));
        const geom = db.routes![1]!.geometry;
        const ref = refWalk([0, 0], geom.points, [16, 0], geom.from, geom.to);
        for (let b = -1; b <= 9; b += 0.125) {
            const x = res.positionAt(1, b);
            expect(same(x, oracle.positionAt(1, b))).toBe(true);
            expect(same(x, ref.at(Math.max(0, Math.min(1, b / 8))))).toBe(true);
        }
        // A flutter: more points than counts, one steady speed: the distance walked each beat,
        // measured finely along the walk, is the same
        const walked = Array.from({ length: 8 }, (_, i) => {
            let sum = 0;
            for (let k = 0; k < 200; k++)
                sum += d(
                    res.positionAt(1, i + k / 200),
                    res.positionAt(1, i + (k + 1) / 200),
                );
            return sum;
        });
        expect(Math.max(...walked) / Math.min(...walked)).toBeLessThan(1.01);
    });
});

describe("route geometry validation with tensions (QA-DB-R5)", () => {
    const g = (point: Record<string, unknown>) => ({
        v: 1,
        from: [0, 0],
        to: [1, 1],
        points: [{ id: "a", at: [0.5, 0.5], ...point }],
    });
    it("refuses a tension of 0, below 0, above 2, NaN, a string, or another key", () => {
        for (const bad of [
            { tension: 0 },
            { tension: -1 },
            { tension: 2.5 },
            { tension: NaN },
            { tension: "1" },
            { smooth: true },
        ]) {
            const r = validateRouteGeometry(g(bad));
            expect(r.ok, JSON.stringify(bad)).toBe(false);
            expect(r.errors[0]!.code).toBe("E-R1");
        }
    });
    it("accepts a corner, 0.1 and 2", () => {
        for (const good of [{}, { tension: 0.1 }, { tension: 2 }])
            expect(validateRouteGeometry(g(good)).ok).toBe(true);
    });
});
