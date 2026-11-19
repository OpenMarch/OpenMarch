/**
 * Drawable walked paths (spec §8.12 R-20, §12.11 QA-WP-1 to QA-WP-12; pathways step 18).
 *
 * Every row samples the drawable path and the resolver's `positionAt` at the same beats and
 * asks for agreement within `WALKED_SAMPLE_TOLERANCE`.
 */
import { describe, expect, it } from "vitest";
import { createResolver } from "../resolver";
import type {
    AdjustProfile,
    AssignmentRow,
    LaneRow,
    Resolver,
    RouteGeometry,
    TimelineSnapshot,
    TransitionRow,
    XY,
} from "../types";
import {
    WALKED_SAMPLE_TOLERANCE,
    createWalkedPaths,
    walkedPath,
    walkedPathOfMove,
    walkedPathPointAt,
    walkedPathToPolylines,
    walkedPathToSvg,
    type WalkedPath,
    type WalkedSegment,
} from "../walkedPath";

const d2 = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const move = (
    id: number,
    start: number,
    end: number,
    points: XY[],
    extra: Partial<TransitionRow> = {},
): TransitionRow => ({
    id,
    start,
    end,
    dest: null,
    points,
    slots: points.length,
    style: "direct",
    order: "slot",
    params: null,
    ...extra,
});

let nextRow = 1;
const row = (
    marcher: number,
    t: TransitionRow,
    slot = 0,
    extra: Partial<AssignmentRow> = {},
): AssignmentRow => ({
    id: nextRow++,
    marcher,
    transition: t.id,
    slot,
    start: t.start,
    end: t.end,
    layer: 0,
    ...extra,
});

const show = (
    homes: XY[],
    transitions: TransitionRow[],
    assignments: AssignmentRow[],
    extra: Partial<TimelineSnapshot> = {},
): TimelineSnapshot => ({
    marchers: homes.map((home, i) => ({ id: i + 1, home })),
    shapes: {},
    transitions: Object.fromEntries(transitions.map((t) => [t.id, t])),
    assignments,
    ...extra,
});

const route = (from: XY, to: XY, points: RouteGeometry["points"]) => ({
    geometry: { v: 1 as const, from, to, points },
});

/** The largest gap between the drawable path and the resolver over `[from, to]`. */
function worstGap(path: WalkedPath, resolver: Resolver, samples = 400): number {
    let worst = 0;
    for (let i = 0; i <= samples; i++) {
        const beat = path.from + ((path.to - path.from) * i) / samples;
        const drawn = walkedPathPointAt(path, beat);
        if (!drawn) throw new Error("empty path");
        worst = Math.max(
            worst,
            d2(drawn, resolver.positionAt(path.marcherId, beat)),
        );
    }
    return worst;
}

/** Segments are in beat order, each ends where the next starts, and each takes time. */
function expectChained(segments: WalkedSegment[]) {
    segments.forEach((seg, i) => {
        expect(seg.end).toBeGreaterThan(seg.start);
        if (i === 0) return;
        const prev = segments[i - 1]!;
        expect(seg.start).toBeGreaterThanOrEqual(prev.end);
        expect(d2(prev.to, seg.from)).toBeLessThan(1e-6);
    });
}

const paths = (
    host: TimelineSnapshot,
    marcher: number,
    a: number,
    b: number,
) => {
    const resolver = createResolver(host);
    const path = walkedPath(host, resolver, marcher, a, b);
    expectChained(path.segments);
    return { resolver, path, gap: worstGap(path, resolver) };
};

const kinds = (path: WalkedPath) => path.segments.map((s) => s.kind);

describe("drawable walked paths (R-20)", () => {
    it("QA-WP-1: a direct move is one line", () => {
        const t = move(1, 0, 8, [[100, 50]]);
        const host = show([[0, 0]], [t], [row(1, t)]);
        const { path, gap } = paths(host, 1, 0, 8);
        expect(path.segments).toEqual([
            {
                kind: "line",
                start: 0,
                end: 8,
                from: [0, 0],
                to: [100, 50],
                transitionId: 1,
            },
        ]);
        expect(walkedPathToSvg(path)).toBe("M 0 0 L 100 50");
        expect(gap).toBeLessThan(1e-9);
    });

    it("QA-WP-2: an arc move is circular arcs of at most a quarter turn, with exact ends", () => {
        for (const bulge of [0.5, -0.5, 0.2, -0.05, 0.001]) {
            const t = move(1, 0, 8, [[120, 40]], {
                style: "arc",
                params: { bulge },
            });
            const host = show([[10, 10]], [t], [row(1, t)]);
            const { path, gap } = paths(host, 1, 0, 8);
            // over a quarter turn (a bulge past about 0.207) it comes as two arcs
            expect(kinds(path)).toEqual(
                Math.abs(bulge) > 0.21 ? ["arc", "arc"] : ["arc"],
            );
            for (const arc of path.segments) {
                if (arc.kind !== "arc") throw new Error("not an arc");
                expect(Math.abs(arc.sweep)).toBeLessThanOrEqual(
                    Math.PI / 2 + 1e-9,
                );
            }
            expect(path.segments[0]!.from).toEqual([10, 10]);
            expect(path.segments.at(-1)!.to).toEqual([120, 40]);
            expect(gap).toBeLessThan(1e-6);
            expect(walkedPathToSvg(path)).toMatch(
                /^M 10 10 (A [\d.]+ [\d.]+ 0 0 [01] [-\d.]+ [-\d.]+ )?A [\d.]+ [\d.]+ 0 0 [01] 120 40$/,
            );
        }
        // a bulge of 0 is the line
        const flat = move(1, 0, 8, [[120, 40]], {
            style: "arc",
            params: { bulge: 0 },
        });
        expect(
            kinds(
                paths(show([[10, 10]], [flat], [row(1, flat)]), 1, 0, 8).path,
            ),
        ).toEqual(["line"]);
    });

    it("QA-WP-2: the arc's sweep flag draws the side the marcher walks", () => {
        // +bulge is the +90 degree side of A->B: from (0,0) to (100,0) that is +y
        const t = move(1, 0, 8, [[100, 0]], {
            style: "arc",
            params: { bulge: 0.5 },
        });
        const host = show([[0, 0]], [t], [row(1, t)]);
        const { resolver, path } = paths(host, 1, 0, 8);
        expect(resolver.positionAt(1, 4)[1]).toBeCloseTo(50, 9);
        const arc = path.segments[0]!;
        if (arc.kind !== "arc") throw new Error("not an arc");
        // start angle PI (west of the centre), ending east through +y: the angle shrinks
        // in two quarter turns, so the written arcs keep their centre when rounded
        expect(kinds(path)).toEqual(["arc", "arc"]);
        expect(arc.sweep).toBeCloseTo(-Math.PI / 2, 9);
        expect(walkedPathToSvg(path)).toBe(
            "M 0 0 A 50 50 0 0 0 50 50 A 50 50 0 0 0 100 0",
        );
    });

    it("QA-WP-3: an own path with corners is a line per leg, timed by length", () => {
        const t = move(1, 0, 10, [[30, 70]]);
        const host = show([[0, 0]], [t], [row(1, t)], {
            routes: {
                1: route(
                    [0, 0],
                    [30, 70],
                    [
                        { id: "a", at: [30, 0] },
                        { id: "b", at: [30, 30] },
                    ],
                ),
            },
            lanes: { 1: { transition: 1, slot: 0, route: 1, offset: null } },
        });
        const { path, gap } = paths(host, 1, 0, 10);
        expect(kinds(path)).toEqual(["line", "line", "line"]);
        expect(path.segments.map((s) => s.end)).toEqual([3, 6, 10]);
        expect(walkedPathToSvg(path)).toBe("M 0 0 L 30 0 L 30 30 L 30 70");
        expect(gap).toBeLessThan(1e-9);
    });

    it("QA-WP-4: smooth points give cubic Bézier curves that match the resolver", () => {
        const t = move(1, 0, 16, [[200, 0]]);
        const host = show([[0, 0]], [t], [row(1, t)], {
            routes: {
                1: route(
                    [0, 0],
                    [200, 0],
                    [
                        { id: "a", at: [50, 60], tension: 1 },
                        { id: "b", at: [120, -40], tension: 1.5 },
                        { id: "c", at: [160, 20] },
                    ],
                ),
            },
            lanes: { 1: { transition: 1, slot: 0, route: 1, offset: null } },
        });
        const { path, gap } = paths(host, 1, 0, 16);
        expect(kinds(path)).toEqual(["cubic", "cubic", "cubic", "line"]);
        // whole pieces are sampled on the resolver's own table
        expect(gap).toBeLessThan(1e-9);
        expect(walkedPathToSvg(path)).toMatch(
            /^M 0 0 C [^CLA]+ C [^CLA]+ C [^CLA]+ L 200 0$/,
        );
    });

    const groupShow = (
        adjust: AdjustProfile | null,
        smooth: boolean,
    ): TimelineSnapshot => {
        const t = move(1, 0, 16, [
            [300, 0],
            [300, 30],
        ]);
        const tension = smooth ? { tension: 1 } : {};
        const lane = (
            slot: number,
            offset: XY,
            a: AdjustProfile | null,
        ): LaneRow => ({
            transition: 1,
            slot,
            route: 1,
            offset,
            adjust: a,
        });
        return show(
            [
                [0, 0],
                [0, 30],
            ],
            [t],
            [row(1, t, 0), row(2, t, 1)],
            {
                routes: {
                    1: route(
                        [0, 0],
                        [300, 0],
                        [
                            { id: "a", at: [60, 80], ...tension },
                            { id: "b", at: [150, 100], ...tension },
                            { id: "c", at: [240, 80], ...tension },
                        ],
                    ),
                },
                lanes: {
                    1: lane(0, [0, 0], null),
                    2: lane(1, [0, 30], adjust),
                },
            },
        );
    };

    it("QA-WP-5: a group lane is the group path moved by its offset, with its own legs", () => {
        for (const smooth of [false, true]) {
            const host = groupShow(null, smooth);
            const leader = paths(host, 1, 0, 16);
            const member = paths(host, 2, 0, 16);
            expect(kinds(member.path)).toEqual(
                smooth
                    ? ["cubic", "cubic", "cubic", "cubic"]
                    : ["line", "line", "line", "line"],
            );
            expect(member.gap).toBeLessThan(1e-9);
            expect(leader.gap).toBeLessThan(1e-9);
            // the shared part is the leader's, 30 lower
            const shared = member.path.segments[1]!;
            const lead = leader.path.segments[1]!;
            expect(shared.from[0]).toBeCloseTo(lead.from[0], 9);
            expect(shared.from[1]).toBeCloseTo(lead.from[1] + 30, 9);
            expect(shared.start).toBe(lead.start);
            expect(shared.end).toBe(lead.end);
        }
    });

    const profile: AdjustProfile = {
        v: 1,
        keys: [
            { a: "a", b: "b", f: 0.5, d: [0, 0] },
            { a: "b", b: "c", f: 0.5, d: [10, -25] },
        ],
    };

    it("QA-WP-6: Adjust on straight pieces stays lines, split at its keys", () => {
        const host = groupShow(profile, false);
        const { path, gap } = paths(host, 2, 0, 16);
        // first leg, a-b split at its key, b-c split at its key, last leg
        expect(kinds(path)).toEqual([
            "line",
            "line",
            "line",
            "line",
            "line",
            "line",
        ]);
        expect(gap).toBeLessThan(1e-9);
    });

    it("QA-WP-6: Adjust that changes along a curve is a polyline within the tolerance", () => {
        const host = groupShow(profile, true);
        const { path, gap } = paths(host, 2, 0, 16);
        // before the first key and after the last the displacement is constant: exact cubics
        expect(kinds(path)).toEqual([
            "cubic",
            "cubic",
            "polyline",
            "polyline",
            "cubic",
            "cubic",
        ]);
        expect(gap).toBeLessThan(WALKED_SAMPLE_TOLERANCE);
        for (const seg of path.segments) {
            if (seg.kind !== "polyline") continue;
            expect(seg.points.length).toBe(seg.beats.length);
            expect(seg.beats[0]).toBe(seg.start);
            expect(seg.beats[seg.beats.length - 1]).toBe(seg.end);
            expect(seg.points[0]).toEqual(seg.from);
            expect(seg.points[seg.points.length - 1]).toEqual(seg.to);
        }
        expect(walkedPathToSvg(path)).not.toContain("NaN");
    });

    const ftlShow = (shape: TimelineSnapshot["shapes"][number]) => {
        const t: TransitionRow = {
            id: 1,
            start: 0,
            end: 16,
            dest: 1,
            slots: 3,
            style: "follow_the_leader",
            order: "slot",
            params: { waypoints: [[80, 60]] },
        };
        return show(
            [
                [0, 0],
                [20, 0],
                [40, 0],
            ],
            [t],
            [row(1, t, 0), row(2, t, 1), row(3, t, 2)],
            { shapes: { 1: shape } },
        );
    };

    it("QA-WP-7: follow the leader walks the trail: lines, and arcs round a circle", () => {
        const onLine = ftlShow({
            kind: "line",
            geometry: {
                points: [
                    [150, 60],
                    [150, 160],
                ],
            },
        });
        for (const m of [1, 2, 3]) {
            const { path, gap } = paths(onLine, m, 0, 16);
            expect(new Set(kinds(path))).toEqual(new Set(["line"]));
            expect(gap).toBeLessThan(1e-9);
        }
        const onCircle = ftlShow({
            kind: "circle",
            geometry: {
                center: [200, 100],
                radius: 40,
                start_angle: Math.PI,
                clockwise: true,
            },
        });
        let arcs = 0;
        for (const m of [1, 2, 3]) {
            const { path, gap } = paths(onCircle, m, 0, 16);
            arcs += path.segments.filter((s) => s.kind === "arc").length;
            for (const s of path.segments)
                if (s.kind === "arc")
                    expect(Math.abs(s.sweep)).toBeLessThanOrEqual(
                        Math.PI / 2 + 1e-9,
                    );
            expect(gap).toBeLessThan(1e-6);
        }
        expect(arcs).toBeGreaterThan(0);
    });

    it("QA-WP-8: standing still draws nothing", () => {
        const a = move(1, 0, 8, [[100, 0]]);
        const b = move(2, 16, 24, [[100, 80]]);
        const still = move(3, 0, 8, [[5, 5]]);
        const host = show(
            [
                [0, 0],
                [5, 5],
            ],
            [a, b, still],
            [row(1, a), row(1, b), row(2, still)],
        );
        const { path, gap } = paths(host, 1, -4, 30);
        expect(path.segments.map((s) => [s.start, s.end])).toEqual([
            [0, 8],
            [16, 24],
        ]);
        expect(gap).toBeLessThan(1e-9);
        // only the hold: nothing, and no place to report
        const held = walkedPath(host, createResolver(host), 1, 9, 15);
        expect(held.segments).toEqual([]);
        expect(walkedPathToSvg(held)).toBe("");
        expect(walkedPathToPolylines(held)).toEqual([]);
        expect(walkedPathPointAt(held, 10)).toBeNull();
        // a move that goes nowhere
        expect(
            walkedPath(host, createResolver(host), 2, 0, 8).segments,
        ).toEqual([]);
    });

    it("QA-WP-9: a beat range cuts segments where the marcher is at its ends", () => {
        const host = groupShow(profile, true);
        const resolver = createResolver(host);
        for (const [a, b] of [
            [1.3, 14.2],
            [5, 9.5],
            [7.9, 8.1],
        ] as const) {
            const path = walkedPath(host, resolver, 2, a, b);
            expectChained(path.segments);
            expect(path.segments[0]!.start).toBe(a);
            expect(path.segments[path.segments.length - 1]!.end).toBe(b);
            expect(
                d2(path.segments[0]!.from, resolver.positionAt(2, a)),
            ).toBeLessThan(WALKED_SAMPLE_TOLERANCE);
            expect(worstGap(path, resolver)).toBeLessThan(
                WALKED_SAMPLE_TOLERANCE,
            );
        }
        // arcs and own curves too
        const t = move(1, 0, 8, [[120, 40]], {
            style: "arc",
            params: { bulge: 0.3 },
        });
        const arcShow = show([[10, 10]], [t], [row(1, t)]);
        const cut = paths(arcShow, 1, 2.5, 6);
        expect(new Set(kinds(cut.path))).toEqual(new Set(["arc"]));
        expect(cut.gap).toBeLessThan(1e-6);
    });

    it("QA-WP-10: a move cut short stops where the marcher leaves it; a join walks straight", () => {
        const low = move(1, 0, 16, [[160, 0]], {
            style: "arc",
            params: { bulge: 0.25 },
        });
        // the marcher joins the higher move 2 beats in
        const high = move(2, 6, 12, [[50, 90]]);
        const host = show(
            [[0, 0]],
            [low, high],
            [row(1, low), row(1, high, 0, { layer: 1, start: 8 })],
            {
                routes: {
                    1: route([0, 0], [50, 90], [{ id: "a", at: [0, 90] }]),
                },
                // a lane on the joined move: a join walks straight until the entry rule
                lanes: {
                    1: { transition: 2, slot: 0, route: 1, offset: null },
                },
            },
        );
        const { path, gap, resolver } = paths(host, 1, 0, 16);
        // the arc to beat 8, straight through the higher move, then the resume's arc
        // (the resume's arc is over a quarter turn, so it comes as two)
        expect(kinds(path)).toEqual(["arc", "line", "arc", "arc"]);
        expect(path.segments.map((s) => s.transitionId)).toEqual([1, 2, 1, 1]);
        expect(gap).toBeLessThan(1e-6);
        // one move alone: only its own beats
        const only = walkedPathOfMove(host, resolver, 1, 2);
        expect(only.segments.map((s) => [s.start, s.end])).toEqual([[8, 12]]);
        expect(walkedPathOfMove(host, resolver, 1, 99).segments).toEqual([]);
    });

    it("QA-WP-11: the polyline form stays within its tolerance", () => {
        const host = groupShow(profile, true);
        const resolver = createResolver(host);
        const path = walkedPath(host, resolver, 2, 0, 16);
        for (const tolerance of [0.05, 1]) {
            const runs = walkedPathToPolylines(path, tolerance);
            expect(runs.length).toBe(1);
            const pts = runs[0]!;
            // every resolver position is close to some line of the polyline
            let worst = 0;
            for (let i = 0; i <= 320; i++) {
                const p = resolver.positionAt(2, i / 20);
                let best = Infinity;
                for (let k = 1; k < pts.length; k++) {
                    const a = pts[k - 1]!;
                    const b = pts[k]!;
                    const len2 = d2(a, b) ** 2;
                    const u =
                        len2 === 0
                            ? 0
                            : Math.max(
                                  0,
                                  Math.min(
                                      1,
                                      ((p[0] - a[0]) * (b[0] - a[0]) +
                                          (p[1] - a[1]) * (b[1] - a[1])) /
                                          len2,
                                  ),
                              );
                    best = Math.min(
                        best,
                        d2(p, [
                            a[0] + u * (b[0] - a[0]),
                            a[1] + u * (b[1] - a[1]),
                        ]),
                    );
                }
                worst = Math.max(worst, best);
            }
            expect(worst).toBeLessThan(tolerance + WALKED_SAMPLE_TOLERANCE);
        }
        expect(walkedPathToPolylines(path, 1)[0]!.length).toBeLessThan(
            walkedPathToPolylines(path, 0.05)[0]!.length,
        );
    });

    it("QA-WP-12: a show with no paths, arcs or follow the leader has only lines", () => {
        const a = move(1, 0, 8, [
            [100, 0],
            [100, 20],
        ]);
        const b = move(2, 8, 16, [
            [40, 60],
            [40, 80],
        ]);
        const host = show(
            [
                [0, 0],
                [0, 20],
            ],
            [a, b],
            [row(1, a, 0), row(2, a, 1), row(1, b, 0), row(2, b, 1)],
        );
        for (const m of [1, 2]) {
            const { path, gap } = paths(host, m, 0, 16);
            expect(kinds(path)).toEqual(["line", "line"]);
            expect(gap).toBeLessThan(1e-9);
        }
        expect(walkedPathToSvg(paths(host, 1, 0, 8).path)).toBe(
            "M 0 0 L 100 0",
        );
    });

    it("QA-WP-16: a cut curve keeps the whole curve's timing, at field scale", () => {
        // an own path of smooth points across the field, uneven so its speed along t varies
        const t = move(1, 0, 16, [[1700, 300]]);
        const host = show([[40, 1500]], [t], [row(1, t)], {
            routes: {
                1: route(
                    [40, 1500],
                    [1700, 300],
                    [
                        { id: "a", at: [200, 200], tension: 1 },
                        { id: "b", at: [300, 900], tension: 2 },
                        { id: "c", at: [1600, 1700], tension: 0.3 },
                    ],
                ),
            },
            lanes: { 1: { transition: 1, slot: 0, route: 1, offset: null } },
        });
        for (const [a, b] of [
            [0, 16],
            [1.3, 2.9],
            [3.77, 11.2],
            [6.01, 6.5],
            [15.2, 15.9],
        ] as const) {
            const { path, gap } = paths(host, 1, a, b);
            expect(new Set(kinds(path))).toEqual(new Set(["cubic"]));
            // exact to rounding: the cut reads the whole curve's length table (R-20 item 7)
            expect(gap).toBeLessThan(1e-6);
            const first = path.segments[0]!;
            if (first.kind !== "cubic") throw new Error("not a cubic");
            expect(first.measured === undefined).toBe(a === 0);
        }
    });

    it("QA-WP-17: a half turn is written as two arcs that keep their centre when rounded", () => {
        // the review's case: radius 929.52868 rounds up to 929.529, a hair over half the chord
        const t = move(1, 1, 6, [[168.89, 1494.396]], {
            style: "arc",
            params: { bulge: 0.5 },
        });
        const host = show([[1322.949, 36.918]], [t], [row(1, t)]);
        const { path, resolver } = paths(host, 1, 1, 6);
        const d = walkedPathToSvg(path);
        const arcs = [
            ...d.matchAll(/A ([\d.]+) [\d.]+ 0 0 [01] ([-\d.]+) ([-\d.]+)/g),
        ].map((m) => m.slice(1).map(Number));
        expect(arcs.length).toBe(2);
        // the first arc ends where the marcher is halfway, on the circle the resolver walks
        const mid = resolver.positionAt(1, 3.5);
        expect(d2([arcs[0]![1]!, arcs[0]![2]!], mid)).toBeLessThan(1e-3);
        let from: XY = [1322.949, 36.918];
        for (const [r, x, y] of arcs) {
            // the chord is far below the diameter, so the centre can't run off (QA-WP-15 parses
            // the arcs back by the W3C conversion)
            expect(d2(from, [x!, y!]) / 2).toBeLessThan(0.75 * r!);
            from = [x!, y!];
        }
    });

    it("QA-WP-18: an arc too flat to draw is a line that still joins what comes next", () => {
        const low = move(1, 0, 16, [[1500, 0]], {
            style: "arc",
            params: { bulge: 0.99e-7 },
        });
        const high = move(2, 6, 12, [[700, 400]]);
        const host = show(
            [[0, 0]],
            [low, high],
            [row(1, low), row(1, high, 0, { layer: 1, start: 8 })],
        );
        // `paths` checks every segment starts within 1e-6 of where the last ended
        const { path, gap } = paths(host, 1, 0, 16);
        expect(kinds(path)).toEqual(["line", "line", "line"]);
        expect(walkedPathToSvg(path).match(/M/g)!.length).toBe(1);
        expect(gap).toBeLessThan(1e-3);
    });

    it("a coordinate that is not a number is an error, never a 0 in the SVG", () => {
        const t = move(1, 0, 8, [[100, 50]]);
        const { path } = paths(show([[0, 0]], [t], [row(1, t)]), 1, 0, 8);
        const broken = {
            ...path,
            segments: [{ ...path.segments[0]!, to: [NaN, 50] as XY }],
        };
        expect(() => walkedPathToSvg(broken)).toThrow(/not a number/);
    });

    it("QA-WP-19: a batch works a follow-the-leader trail out once for all its marchers", () => {
        const host = ftlShow({
            kind: "circle",
            geometry: {
                center: [200, 100],
                radius: 40,
                start_angle: Math.PI,
                clockwise: true,
            },
        });
        const resolver = createResolver(host);
        let entries = 0;
        let positions = 0;
        const counted = {
            spanInfos: resolver.spanInfos,
            ftlEntry: (id: number) => (entries++, resolver.ftlEntry(id)),
            positionAt: (m: number, b: number) => (
                positions++,
                resolver.positionAt(m, b)
            ),
        };
        const batch = createWalkedPaths(host, counted);
        for (let round = 0; round < 4; round++)
            for (const m of [1, 2, 3])
                expect(batch.path(m, round * 4, round * 4 + 4)).toEqual(
                    walkedPath(host, resolver, m, round * 4, round * 4 + 4),
                );
        expect(entries).toBe(1);
        // the trail's three origins once, and each call's own origin: no members x calls
        expect(positions).toBe(3 + 12);
    });
});
