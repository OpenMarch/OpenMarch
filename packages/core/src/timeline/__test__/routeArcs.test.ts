// cspell:ignore sagitta arcroutes
/**
 * Arc legs, pathways step 10a (spec Appendix L, R-14″, §8.11): QA-AR-1 to QA-AR-3 on own paths,
 * group paths and trails, the validator's rules, the drawable walked path (R-20) and the ref/
 * oracle (`docs/timeline/ref`, written apart from this package, with its own centre-form arc
 * length), which the app must agree with.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error: the spec's reference implementation is plain JavaScript
import { makeOracle } from "../../../../../docs/timeline/ref/oracle.mjs";
import {
    adjustAt,
    arcLength,
    createResolver,
    createTimelineOracleForTesting,
    groupSchedule,
    placeAdjustKey,
    refitGeometry,
    resolveAdjust,
    routePath,
    routePoint,
    smoothBesideArc,
    validateRouteGeometry,
    walkedPath,
    walkedPathPointAt,
    walkedPathToSvg,
    WALKED_SAMPLE_TOLERANCE,
    type RouteGeometry,
    type RoutePoint,
    type TimelineSnapshot,
    type XY,
} from "../index";
import { arcPoint } from "../geom";
import { mulberry32 } from "./showGenerators";
import { walkedPathShow } from "./walkedPathShows";
// @ts-expect-error: the ref/ suite's route generator is plain JavaScript
import * as arcRoutes from "../../../../../docs/timeline/ref/arcroutes.mjs";

const refOracle = makeOracle as (db: TimelineSnapshot) => {
    positionAt(m: number, b: number): XY;
};
const d = (a: XY, b: XY) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const QUARTERS = Array.from({ length: 65 }, (_, i) => i / 4);

/** QA-AR-1's arc: chord (0,0) to (8,0), bulge 1/4, so the apex is (4,2), centre (4,−3), radius 5 */
const CENTER: XY = [4, -3];
const RADIUS = 5;
const ARC_LEN = RADIUS * 4 * Math.atan(0.5); // r·θ

/** One marcher on its own path over 16 counts, from (0,0) to `to` */
function ownShow(geometry: RouteGeometry, to: XY): TimelineSnapshot {
    return {
        marchers: [{ id: 1, home: [0, 0] }],
        shapes: {},
        transitions: {
            1: {
                id: 1,
                start: 0,
                end: 16,
                dest: null,
                points: [to],
                slots: 1,
                style: "direct",
                order: "slot",
                params: null,
            },
        },
        assignments: [
            {
                id: 1,
                marcher: 1,
                transition: 1,
                slot: 0,
                start: 0,
                end: 16,
                layer: 0,
            },
        ],
        routes: { 1: { geometry } },
        lanes: { 1: { transition: 1, slot: 0, route: 1, offset: null } },
    };
}

/** The app's resolver, its oracle and the ref/ oracle agree at every quarter count */
function expectAgree(host: TimelineSnapshot, marchers: number[], tol = 1e-9) {
    const r = createResolver(host);
    const o = createTimelineOracleForTesting(host);
    const ref = refOracle(host);
    for (const m of marchers)
        for (const b of QUARTERS) {
            const p = r.positionAt(m, b);
            expect(o.positionAt(m, b), `oracle M${m}@${b}`).toEqual(p);
            expect(d(ref.positionAt(m, b), p), `ref M${m}@${b}`).toBeLessThan(
                tol,
            );
        }
    return r;
}

describe("R-14″: an arc leg whose point lands on B (PR #816 review)", () => {
    it("keeps its bulge when cleaning drops the point, so a nudge of 1e-8 doesn't change the walk", () => {
        const route = (y: number): RouteGeometry => ({
            v: 1,
            from: [0, 0],
            to: [8, 0],
            points: [
                { id: "a", at: [4, 4] },
                { id: "b", at: [8, y], bulge: 0.5 },
            ],
        });
        const on = routePath([0, 0], route(1e-10).points, [8, 0], route(1e-10));
        const near = routePath([0, 0], route(1e-8).points, [8, 0], route(1e-8));
        // On B: the point goes, and its half circle is the leg into B
        expect(on.pieces.map((p) => p.kind)).toEqual(["line", "arc"]);
        expect(near.pieces.map((p) => p.kind)).toEqual(["line", "arc", "line"]);
        expect(on.L).toBeCloseTo(near.L, 6);
        expect(on.L).toBeCloseTo(
            Math.hypot(4, 4) + (Math.PI * Math.hypot(4, 4)) / 2,
            9,
        );
        // The ref/ oracle agrees
        expectAgree(ownShow(route(1e-10), [8, 0]), [1]);
    });
});

describe("QA-AR-1: a leg with bulge 1/4 and chord 8", () => {
    const geometry: RouteGeometry = {
        v: 1,
        from: [0, 0],
        to: [8, 8],
        points: [{ id: "p", at: [8, 0], bulge: 0.25 }],
    };

    it("is measured exactly as r·θ, not by samples", () => {
        expect(arcLength([0, 0], [8, 0], 0.25)).toBeCloseTo(ARC_LEN, 12);
        const path = routePath([0, 0], geometry.points, [8, 8], geometry);
        expect(path.pieces.map((p) => p.kind)).toEqual(["arc", "line"]);
        expect(path.D[1]).toBeCloseTo(ARC_LEN, 12);
        expect(path.L).toBeCloseTo(ARC_LEN + 8, 12);
    });

    it("walks on the arc at one speed, every quarter count, and agrees with the ref/ oracle", () => {
        const r = expectAgree(ownShow(geometry, [8, 8]), [1]);
        const corner = (16 * ARC_LEN) / (ARC_LEN + 8);
        for (const b of QUARTERS.filter((b) => b <= corner))
            expect(
                Math.abs(d(r.positionAt(1, b), CENTER) - RADIUS),
            ).toBeLessThan(1e-9);
        // the bulge is to the +90° side of the chord
        expect(r.positionAt(1, 2)[1]).toBeGreaterThan(0);
        // at one speed: a quarter count covers (r·θ + 8) / 64 along the way, on the arc too
        const step = (ARC_LEN + 8) / 64;
        const theta = step / RADIUS;
        const chord = 2 * RADIUS * Math.sin(theta / 2);
        for (let b = 0; b + 0.25 <= corner; b += 0.25)
            expect(
                d(r.positionAt(1, b), r.positionAt(1, b + 0.25)),
            ).toBeCloseTo(chord, 9);
        expect(r.positionAt(1, 16)).toEqual([8, 8]);
    });

    it("one arc leg alone (toBulge) is R-8's arc, bit for bit", () => {
        const host = ownShow(
            { v: 1, from: [0, 0], to: [8, 0], points: [], toBulge: 0.25 },
            [8, 0],
        );
        const r = expectAgree(host, [1]);
        for (const b of QUARTERS)
            expect(r.positionAt(1, b)).toEqual(
                arcPoint([0, 0], [8, 0], 0.25, Math.min(1, b / 16)),
            );
    });

    it("R-20 draws arcs on the circle, agreeing with positionAt; QA-WP-15's bound holds", () => {
        const host = ownShow(geometry, [8, 8]);
        const r = createResolver(host);
        const path = walkedPath(host, r, 1, 0, 16);
        const arcs = path.segments.filter((s) => s.kind === "arc");
        expect(arcs.length).toBeGreaterThan(0);
        // the arc is 106°, so R-20 item 3 splits it into two quarter-turn-or-less arc segments
        expect(path.segments.map((s) => s.kind)).toEqual([
            "arc",
            "arc",
            "line",
        ]);
        for (const a of arcs) {
            if (a.kind !== "arc") continue;
            expect(d(a.center, CENTER)).toBeLessThan(1e-9);
            expect(a.radius).toBeCloseTo(RADIUS, 9);
        }
        for (let b = 0; b <= 16; b += 1 / 32)
            expect(
                d(walkedPathPointAt(path, b)!, r.positionAt(1, b)),
            ).toBeLessThan(WALKED_SAMPLE_TOLERANCE);
        expect(walkedPathToSvg(path)).toMatch(/A /);
    });
});

describe("arc legs on group paths and trails", () => {
    /** Two members on a group path; the middle leg is an arc */
    const groupGeometry: RouteGeometry = {
        v: 1,
        from: [0, 0],
        to: [40, 0],
        points: [
            { id: "p", at: [10, 0] },
            { id: "q", at: [30, 0], bulge: -0.3 },
        ],
        toBulge: 0.2,
    };
    function groupShow(
        geometry: RouteGeometry = groupGeometry,
    ): TimelineSnapshot {
        return {
            marchers: [
                { id: 1, home: [0, -4] },
                { id: 2, home: [0, 4] },
            ],
            shapes: {},
            transitions: {
                1: {
                    id: 1,
                    start: 0,
                    end: 16,
                    dest: null,
                    points: [
                        [40, -4],
                        [40, 4],
                    ],
                    slots: 2,
                    style: "direct",
                    order: "slot",
                    params: null,
                },
            },
            assignments: [1, 2].map((m) => ({
                id: m,
                marcher: m,
                transition: 1,
                slot: m - 1,
                start: 0,
                end: 16,
                layer: 0,
            })),
            routes: { 1: { geometry } },
            lanes: {
                1: { transition: 1, slot: 0, route: 1, offset: [0, -4] },
                2: { transition: 1, slot: 1, route: 1, offset: [0, 4] },
            },
        };
    }

    it("a group path's arc leg is the same arc on every lane, rigid; the last leg is an arc too", () => {
        const r = expectAgree(groupShow(), [1, 2]);
        const W = groupSchedule(groupGeometry).W;
        expect(W.pieces.map((p) => p.kind)).toEqual(["line", "arc", "arc"]);
        for (const b of QUARTERS) {
            const p = r.positionAt(1, b);
            const q = r.positionAt(2, b);
            const u = b / 16;
            if (u > W.D[1]! / W.L && u < W.D[2]! / W.L)
                expect(d([q[0], q[1] - 8], p)).toBeLessThan(1e-9);
        }
        // the middle leg bends to −90° of the chord (bulge −0.3: sagitta 6)
        const mid = W.D[1]! + (W.D[2]! - W.D[1]!) / 2;
        expect(r.positionAt(1, (16 * mid) / W.L)[1]).toBeCloseTo(-4 - 6, 6);
        const walk = walkedPath(groupShow(), r, 2, 0, 16);
        expect(walk.segments.some((s) => s.kind === "arc")).toBe(true);
        for (let b = 0; b <= 16; b += 1 / 16)
            expect(
                d(walkedPathPointAt(walk, b)!, r.positionAt(2, b)),
            ).toBeLessThan(WALKED_SAMPLE_TOLERANCE);
    });

    it("a trail with an arc leg: members walk the arc by distance, agreeing with the ref/ oracle", () => {
        const host: TimelineSnapshot = {
            marchers: [
                { id: 1, home: [0, 0] },
                { id: 2, home: [4, 0] },
                { id: 3, home: [8, 0] },
            ],
            shapes: {},
            transitions: {
                1: {
                    id: 1,
                    start: 0,
                    end: 16,
                    dest: null,
                    points: [
                        [16, 8],
                        [20, 8],
                        [24, 8],
                    ],
                    slots: 3,
                    style: "follow_the_leader",
                    order: "slot",
                    params: { waypoints: [] },
                    route: 1,
                },
            },
            routes: {
                1: {
                    geometry: {
                        v: 1,
                        from: [8, 0],
                        to: [16, 8],
                        points: [],
                        toBulge: 0.5,
                    },
                },
            },
            assignments: [1, 2, 3].map((m) => ({
                id: m,
                marcher: m,
                transition: 1,
                slot: m - 1,
                start: 0,
                end: 16,
                layer: 0,
            })),
        };
        const r = expectAgree(host, [1, 2, 3]);
        // a half circle on the chord (8,0)–(16,8): the leader passes its far side
        const c: XY = [12, 4];
        const R = Math.hypot(4, 4);
        const e = r.ftlEntry(1);
        const lineLen = 8;
        for (const b of QUARTERS) {
            const p = r.positionAt(3, b);
            const dist3 =
                e.startDist[2]! +
                (e.endDist[2]! - e.startDist[2]!) * Math.min(1, b / 16);
            if (dist3 > lineLen && dist3 < lineLen + Math.PI * R)
                expect(Math.abs(d(p, c) - R)).toBeLessThan(1e-9);
        }
    });
});

describe("QA-AR-2: the validator", () => {
    const base = (points: RoutePoint[], toBulge?: number): unknown => ({
        v: 1,
        from: [0, 0],
        to: [20, 0],
        points,
        ...(toBulge === undefined ? {} : { toBulge }),
    });

    it("accepts bulges up to a half either way, and refuses 0, 0.6 and non-numbers", () => {
        for (const k of [0.5, -0.5, 1e-6, -0.25])
            expect(
                validateRouteGeometry(
                    base([{ id: "a", at: [10, 0], bulge: k }], k),
                ).ok,
            ).toBe(true);
        for (const k of [0, 0.6, -0.6, Infinity, Number.NaN, "1/4"]) {
            expect(
                validateRouteGeometry(
                    base([{ id: "a", at: [10, 0], bulge: k as number }]),
                ).ok,
            ).toBe(false);
            expect(validateRouteGeometry(base([], k as number)).ok).toBe(false);
        }
    });

    it("refuses a smooth point at either end of an arc leg", () => {
        const smooth = { id: "s", at: [10, 5] as XY, tension: 1 };
        // the arc arrives at the smooth point
        expect(
            validateRouteGeometry(base([{ ...smooth, bulge: 0.25 }])).ok,
        ).toBe(false);
        // the arc leaves the smooth point (into `to`)
        expect(validateRouteGeometry(base([smooth], 0.25)).ok).toBe(false);
        // the arc leaves it into the next point
        expect(
            validateRouteGeometry(
                base([smooth, { id: "c", at: [15, 0], bulge: 0.25 }]),
            ).ok,
        ).toBe(false);
        // an arc one leg away is fine
        expect(
            validateRouteGeometry(
                base([
                    smooth,
                    { id: "c", at: [15, 0] },
                    { id: "d", at: [18, 0], bulge: 0.25 },
                ]),
            ).ok,
        ).toBe(true);
        expect(smoothBesideArc([{ tension: 1 }], 0.1)).toBe(0);
        expect(smoothBesideArc([{ tension: 1 }, {}], 0.1)).toBe(-1);
    });
});

describe("QA-AR-3: Adjust and Re-fit on an arc leg", () => {
    const geometry: RouteGeometry = {
        v: 1,
        from: [0, 0],
        to: [120, 0],
        points: [
            { id: "p", at: [20, 0] },
            { id: "q", at: [100, 0], bulge: 0.25 },
        ],
    };

    it("a key's place is measured along the arc, and the lane passes through it on the arc", () => {
        const schedule = groupSchedule(geometry);
        const { W } = schedule;
        expect(W.D[2]! - W.D[1]!).toBeCloseTo(
            arcLength([20, 0], [100, 0], 0.25),
            9,
        );
        const mid = W.D[1]! + (W.D[2]! - W.D[1]!) / 2;
        const placed = placeAdjustKey({
            schedule,
            points: geometry.points,
            profile: null,
            x: mid,
            d: [0, 10],
        });
        expect(placed.ok).toBe(true);
        if (!placed.ok || !placed.profile) return;
        const resolved = resolveAdjust(
            schedule,
            geometry.points,
            placed.profile,
        );
        // the key comes back where it was put, measured along the arc
        expect(
            Math.min(...resolved.xs.map((x) => Math.abs(x - mid))),
        ).toBeLessThan(1e-9);
        expect(adjustAt(resolved, mid)).toEqual([0, 10]);
        // the place's point is the arc's middle: the apex, 20 above the chord
        const apex = routePoint(W, mid / W.L);
        expect(apex[0]).toBeCloseTo(60, 9);
        expect(apex[1]).toBeCloseTo(20, 9);
    });

    it("Re-fit keeps every bulge, toBulge too", () => {
        const g = { ...geometry, toBulge: -0.1 };
        const fitted = refitGeometry(g, [5, 5], [130, 10]);
        expect(fitted.points.map((p) => p.bulge)).toEqual([undefined, 0.25]);
        expect(fitted.toBulge).toBe(-0.1);
        expect(validateRouteGeometry(fitted).ok).toBe(true);
    });
});

describe("random shows with arc legs: app = ref/ oracle", () => {
    const gen = arcRoutes as {
        randArcRoute(R: () => number, o: object): RouteGeometry;
        toggleLeg(R: () => number, g: RouteGeometry): RouteGeometry;
        landOn(R: () => number, g: RouteGeometry, at: XY): RouteGeometry | null;
        hasArc(g: RouteGeometry): boolean;
    };
    it("own and group paths (offsets, Adjust) and trails, with bulges at the limits, toBulge and points landing on an end", () => {
        // QA-WP-15's random shows (own paths, group paths with Adjust, smooth points, coincident points, layers), with
        // arc legs laid over their routes by ref/arcroutes.mjs (keeping R-14″: no smooth point beside an arc) and
        // follow-the-leader moves given trail routes with arc legs
        const S = 1500;
        let shows = 0;
        let arcRoutes = 0;
        let probes = 0;
        for (let seed = 1; seed <= 160; seed++) {
            const show = walkedPathShow(seed, S);
            const R = mulberry32(seed * 31 + 7);
            const pt = (): XY => [
                Math.round(R() * S * 1e3) / 1e3,
                Math.round(R() * S * 1e3) / 1e3,
            ];
            const routes = (show.routes ??= {});
            for (const r of Object.values(routes)) {
                let g = r.geometry;
                for (let i = Math.floor(R() * 4); i > 0; i--)
                    g = gen.toggleLeg(R, g);
                if (R() < 0.2)
                    g = gen.landOn(R, g, R() < 0.5 ? g.from : g.to) ?? g;
                r.geometry = g;
            }
            let next = Math.max(0, ...Object.keys(routes).map(Number)) + 1;
            for (const t of Object.values(show.transitions))
                if (t.style === "follow_the_leader" && R() < 0.6) {
                    routes[next] = {
                        geometry: gen.randArcRoute(R, {
                            pt,
                            n: Math.floor(R() * 5),
                            scale: S,
                        }),
                    };
                    t.route = next++;
                }
            for (const r of Object.values(routes)) {
                expect(validateRouteGeometry(r.geometry).ok).toBe(true);
                if (gen.hasArc(r.geometry)) arcRoutes++;
            }
            let res;
            try {
                res = createResolver(show);
            } catch {
                continue; // QA-WP-15's generator builds some shows the resolver refuses
            }
            shows++;
            const ref = refOracle(show);
            const end = Math.max(
                ...Object.values(show.transitions).map((t) => t.end),
            );
            for (const m of show.marchers)
                for (let b = 0; b <= end + 1; b += 0.25) {
                    probes++;
                    const p = res.positionAt(m.id, b);
                    const q = ref.positionAt(m.id, b);
                    expect(
                        d(p, q),
                        `seed ${seed} M${m.id}@${b}: app ${p} ref ${q}`,
                    ).toBeLessThan(1e-6);
                }
        }
        expect(shows).toBeGreaterThan(100);
        expect(arcRoutes).toBeGreaterThan(300);
        expect(probes).toBeGreaterThan(50000);
    }, 60_000); // about 2 s alone; the default 5 s is too tight when the whole suite runs on a loaded machine
});

describe("parity and §8.11", () => {
    it("no bulge resolves bit for bit as before: a bulge of 0 isn't stored, and an absent toBulge is none", () => {
        const plain: RouteGeometry = {
            v: 1,
            from: [0, 0],
            to: [8, 8],
            points: [{ id: "p", at: [8, 0] }],
        };
        const a = createResolver(ownShow(plain, [8, 8]));
        const b = createResolver(
            ownShow({ ...plain, toBulge: undefined }, [8, 8]),
        );
        for (const t of QUARTERS)
            expect(a.positionAt(1, t)).toEqual(b.positionAt(1, t));
        expect(a.positionAt(1, 8)).toEqual([8, 0]);
    });

    it("random arc routes: app = ref/ oracle, R-20 within tolerance, and every point within the chord's disc of radius chord/2 + sagitta", () => {
        const rnd = mulberry32(1010);
        const coord = () => Math.round(rnd() * 1500);
        for (let n = 0; n < 60; n++) {
            const count = Math.floor(rnd() * 4);
            const points: RoutePoint[] = Array.from(
                { length: count },
                (_, i) => ({
                    id: `p${i}`,
                    at: [coord(), coord()] as XY,
                    ...(rnd() < 0.6
                        ? {
                              bulge:
                                  (rnd() < 0.5 ? -1 : 1) *
                                  (0.02 + rnd() * 0.48),
                          }
                        : {}),
                }),
            );
            const to: XY = [coord(), coord()];
            const geometry: RouteGeometry = {
                v: 1,
                from: [0, 0],
                to,
                points,
                ...(rnd() < 0.5 ? { toBulge: rnd() < 0.5 ? 0.5 : -0.2 } : {}),
            };
            expect(validateRouteGeometry(geometry).ok).toBe(true);
            const host = ownShow(geometry, to);
            const r = expectAgree(host, [1], 1e-6);
            const path = walkedPath(host, r, 1, 0, 16);
            for (let b = 0; b <= 16; b += 1 / 16)
                expect(
                    d(walkedPathPointAt(path, b)!, r.positionAt(1, b)),
                ).toBeLessThan(WALKED_SAMPLE_TOLERANCE);
            // §8.11: an arc leg's points stay within its chord's disc of radius chord/2 + sagitta
            const W = routePath([0, 0], points, to, geometry);
            W.pieces.forEach((piece, j) => {
                if (piece.kind !== "arc") return;
                const A = W.V[j]!;
                const B = W.V[j + 1]!;
                const c = d(A, B);
                const M: XY = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
                for (let i = 0; i <= 32; i++)
                    expect(
                        d(arcPoint(A, B, piece.k, i / 32), M),
                    ).toBeLessThanOrEqual(c / 2 + Math.abs(piece.k) * c + 1e-9);
            });
        }
    });
});
