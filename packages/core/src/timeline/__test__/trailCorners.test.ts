/**
 * Corner counts for block letters, pathways step 6 (spec Appendix L.9): QA-TC-1 to QA-TC-12.
 *
 * Hand-worked counts on corners, and agreement with the resolver: at every listed turn the
 * resolver has the member on the corner at the beat its count names (TC-3).
 */
import { describe, expect, it } from "vitest";
import { createCachedResolver } from "../resolver";
import {
    CORNER_MIN_TURN,
    isOnCount,
    roundCount,
    trailCornerCounts,
    type CornerCount,
    type TrailEnds,
} from "../trailCorners";
import type {
    RouteGeometry,
    RoutePoint,
    TimelineSnapshot,
    TransitionRow,
    XY,
} from "../types";
import { mulberry32 } from "./showGenerators";

const near = (a: XY, b: XY, eps: number) =>
    Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps;
const tenth = (x: number) => Math.round(x * 10) / 10;

/**
 * Marchers at `homes` (tail first, the last leads, slot order) follow over [0, counts) along a
 * trail route through `points`, either into the end spots `spots` (R-13′) or with their ends
 * along the way (R-13″).
 */
function show(
    homes: XY[],
    points: RoutePoint[],
    spots: XY[],
    opts: {
        along?: boolean;
        counts?: number;
        reverse?: boolean;
        /** Marcher index → the beat its row ends (taken over partway) */
        cut?: Record<number, number>;
    } = {},
): TimelineSnapshot {
    const counts = opts.counts ?? 16;
    const leader = opts.reverse ? homes[0]! : homes[homes.length - 1]!;
    const last = points.at(-1)?.at ?? leader;
    const geometry: RouteGeometry = {
        v: 1,
        from: leader,
        to: opts.along ? last : opts.reverse ? spots.at(-1)! : spots[0]!,
        points,
    };
    const params: TransitionRow["params"] = {
        waypoints: [],
        ...(opts.along ? { ends: "along" } : {}),
        ...(opts.reverse ? { reverse: true } : {}),
    };
    return {
        marchers: homes.map((home, i) => ({ id: i + 1, home })),
        shapes: {},
        transitions: {
            1: {
                id: 1,
                start: 0,
                end: counts,
                dest: null,
                points: spots,
                slots: homes.length,
                style: "follow_the_leader",
                order: "slot",
                params,
                route: 1,
            },
        },
        routes: { 1: { geometry } },
        assignments: homes.map((_, i) => ({
            id: i + 1,
            marcher: i + 1,
            transition: 1,
            slot: i,
            start: 0,
            end: opts.cut?.[i] ?? counts,
            layer: 0,
        })),
    };
}

/** The counts as the app reads them from a show: founders, their starts and ends, the route */
function countsOf(db: TimelineSnapshot): {
    corners: CornerCount[];
    members: number[];
} {
    const r = createCachedResolver(structuredClone(db));
    const t = db.transitions[1]!;
    const e = r.ftlEntry(1);
    const origins = e.members.map((m) => r.positionAt(m, t.start));
    const geo = db.routes![t.route!]!.geometry;
    const spots = t.points!;
    const slotOf = new Map(db.assignments.map((a) => [a.marcher, a.slot]));
    const reverse = t.params?.reverse === true;
    const ends: TrailEnds =
        t.params?.ends === "along"
            ? {
                  kind: "along",
                  spots: e.members.map((m) => spots[slotOf.get(m)!]!),
              }
            : {
                  kind: "line",
                  endLine: reverse ? [...spots].reverse() : spots,
                  at: e.members.map((m) =>
                      reverse
                          ? spots.length - 1 - slotOf.get(m)!
                          : slotOf.get(m)!,
                  ),
              };
    const corners = trailCornerCounts({
        origins,
        route: {
            from: geo.from,
            to: geo.to,
            points: geo.points,
            ...(geo.toBulge === undefined ? {} : { toBulge: geo.toBulge }),
        },
        ends,
        counts: t.end - t.start,
        // TC-2: a founder's span may end before the move does (taken over partway)
        until: e.members.map((m) => {
            const end = r.explain(m, t.start).span.end;
            return end < t.end ? end - t.start : undefined;
        }),
    });
    const untilOf = new Map(
        e.members.map((m) => [m, r.explain(m, t.start).span.end - t.start]),
    );
    for (const c of corners)
        for (const turn of c.turns)
            expect(turn.count).toBeLessThan(untilOf.get(e.members[turn.q]!)!);
    // TC-3: the resolver has each member on the corner at the beat its count names
    for (const c of corners)
        for (const turn of c.turns) {
            const m = e.members[turn.q]!;
            const at = r.positionAt(m, t.start + turn.count);
            expect(
                near(at, c.at, 1e-6),
                `M${m} at count ${turn.count}: ${at} vs corner ${c.at}`,
            ).toBe(true);
        }
    return { corners, members: e.members };
}

const pts = (xs: XY[]): RoutePoint[] =>
    xs.map((at, i) => ({ id: `p${i}`, at }));
/** Each corner as [x, y, [marcher, count to a tenth]…], leader first */
const summary = (r: ReturnType<typeof countsOf>) =>
    r.corners.map((c) => [
        c.at[0],
        c.at[1],
        c.turns.map((t) => [r.members[t.q]!, tenth(t.count)]),
    ]);

describe("corner counts (spec L.9, pathways step 6)", () => {
    it("QA-TC-1: QA-TR-1's trail into an end line: three corners, counts by each member's own speed", () => {
        const db = show(
            [
                [0, 0],
                [4, 0],
                [8, 0],
            ],
            pts([
                [14, 0],
                [14, 10],
            ]),
            [
                [20, 10],
                [20, 16],
                [20, 22],
            ],
        );
        const r = countsOf(db);
        // none at the leader's start: the line-up and the first leg both run along +x
        expect(summary(r)).toEqual([
            [
                14,
                0,
                [
                    [3, 2.8],
                    [2, 5],
                    [1, 7.5],
                ],
            ],
            [
                14,
                10,
                [
                    [3, 7.5],
                    [2, 10],
                    [1, 12.8],
                ],
            ],
            // M1 stops on the entrance, so it doesn't turn there
            [
                20,
                10,
                [
                    [3, 10.4],
                    [2, 13],
                ],
            ],
        ]);
        // stopping on the corner counts as stopping before turning there
        expect(r.corners[2]!.stopBefore).toBe(1);
        expect(r.corners.map((c) => c.offCount)).toEqual([true, true, true]);
        expect(r.corners[0]!.turn).toBeCloseTo(Math.PI / 2, 12);
        expect(r.corners[1]!.turn).toBeCloseTo(-Math.PI / 2, 12);
    });

    /** QA-TC-2's line: four 2 apart, up 8 then right 8, ends along the way, Keep spacing */
    const homes4: XY[] = [
        [0, 0],
        [2, 0],
        [4, 0],
        [6, 0],
    ];
    const way: RoutePoint[] = pts([
        [6, 8],
        [14, 8],
    ]);
    // e_q = startDist[q] + 16 = 16, 18, 20, 22: (8,8), (10,8), (12,8), (14,8)
    const keepSpots: XY[] = [
        [8, 8],
        [10, 8],
        [12, 8],
        [14, 8],
    ];

    it("QA-TC-2: a block letter with every turn on a count", () => {
        const r = countsOf(show(homes4, way, keepSpots, { along: true }));
        expect(summary(r)).toEqual([
            [
                6,
                0,
                [
                    [3, 2],
                    [2, 4],
                    [1, 6],
                ],
            ],
            [
                6,
                8,
                [
                    [4, 8],
                    [3, 10],
                    [2, 12],
                    [1, 14],
                ],
            ],
        ]);
        expect(r.corners.some((c) => c.offCount)).toBe(false);
        expect(r.corners.every((c) => c.turns.every((t) => t.onCount))).toBe(
            true,
        );
    });

    it("QA-TC-3: over 12 counts the same letter turns between counts", () => {
        const r = countsOf(
            show(homes4, way, keepSpots, { along: true, counts: 12 }),
        );
        const second = r.corners[1]!;
        expect(second.turns.map((t) => tenth(t.count))).toEqual([
            6, 7.5, 9, 10.5,
        ]);
        expect(second.turns.map((t) => t.onCount)).toEqual([
            true,
            false,
            true,
            false,
        ]);
        expect(second.offCount).toBe(true);
    });

    it("QA-TC-3b: a member that stops before a corner is counted, not listed", () => {
        // a short trail: the tail ends on the first leg, so it never reaches (6,8)
        const spots: XY[] = [
            [6, 4],
            [6, 6],
            [6, 8],
            [10, 8],
        ];
        const r = countsOf(show(homes4, way, spots, { along: true }));
        const second = r.corners.find((c) => c.at[1] === 8)!;
        expect(second.turns.map((t) => r.members[t.q])).toEqual([4]);
        // M3 stops on the corner, M1 and M2 before it
        expect(second.stopBefore).toBe(3);
    });

    it("QA-TC-3c: a member ending a hair past a corner stops there; it doesn't turn on the last instant", () => {
        // the tail's spot 0.01 past the corner (6,8): it would "turn" on count 15.99 of 16
        const spots: XY[] = [
            [6.01, 8],
            [8, 8],
            [10, 8],
            [14, 8],
        ];
        const r = countsOf(show(homes4, way, spots, { along: true }));
        const second = r.corners.find((c) => c.at[1] === 8)!;
        expect(second.turns.map((t) => r.members[t.q])).not.toContain(1);
        expect(second.stopBefore).toBe(1);
    });

    it("QA-TC-4: a smooth point has no corner; a 15° bend has none; a 20° bend has one", () => {
        const line: XY[] = [
            [0, 0],
            [2, 0],
        ];
        const bend = (deg: number): XY => {
            const a = (deg * Math.PI) / 180;
            return [10 + 8 * Math.cos(a), 8 * Math.sin(a)];
        };
        const at = (deg: number, tension?: number) =>
            countsOf(
                show(
                    line,
                    [
                        {
                            id: "p0",
                            at: [10, 0],
                            ...(tension ? { tension } : {}),
                        },
                        { id: "p1", at: bend(deg) },
                    ],
                    [
                        [
                            10 + 4 * Math.cos((deg * Math.PI) / 180),
                            4 * Math.sin((deg * Math.PI) / 180),
                        ],
                        bend(deg),
                    ],
                    { along: true },
                ),
            ).corners;
        expect(at(15)).toHaveLength(0);
        expect(at(20.5)).toHaveLength(1);
        expect(at(90, 1)).toHaveLength(0);
        expect(CORNER_MIN_TURN).toBeCloseTo((20 * Math.PI) / 180, 15);
    });

    it("QA-TC-5: an arc leg turns by its own tangent at each end", () => {
        // right from the leader to (10,0), a half circle (bulge 1/2) up to (10,8), right again
        const r = countsOf(
            show(
                [
                    [0, 0],
                    [2, 0],
                ],
                [
                    { id: "p0", at: [10, 0] },
                    { id: "p1", at: [10, 8], bulge: -0.5 },
                    { id: "p2", at: [18, 8] },
                ],
                [
                    [14, 8],
                    [18, 8],
                ],
                { along: true },
            ),
        );
        // the chord (10,0)–(10,8) runs +y; a half circle leaves and arrives square to it, so it
        // carries straight on from the first leg (+x, no corner) and arrives heading −x: the
        // last leg's +x is a half turn there
        const turns = r.corners.map((c) => [c.at, Math.abs(c.turn)]);
        expect(turns).toHaveLength(1);
        expect(turns[0]![0]).toEqual([10, 8]);
        expect(turns[0]![1] as number).toBeCloseTo(Math.PI, 9);
    });

    it("QA-TC-5b: a quarter-bulge arc turns at both ends", () => {
        const r = countsOf(
            show(
                [
                    [0, 0],
                    [2, 0],
                ],
                [
                    { id: "p0", at: [10, 0] },
                    { id: "p1", at: [18, 0], bulge: 0.25 },
                    { id: "p2", at: [26, 0] },
                ],
                [
                    [24, 0],
                    [26, 0],
                ],
                { along: true },
            ),
        );
        // bulge 1/4: half-angle 2·atan(1/2) ≈ 53.13° each side of the chord
        const half = 2 * Math.atan(0.5);
        expect(r.corners.map((c) => c.at)).toEqual([
            [10, 0],
            [18, 0],
        ]);
        expect(r.corners[0]!.turn).toBeCloseTo(half, 12);
        expect(r.corners[1]!.turn).toBeCloseTo(half, 12);
    });

    it("QA-TC-9: a founder taken over partway turns at no corner after it leaves", () => {
        // QA-TC-2's letter; M1's row ends at count 9, before its turn at (6,8) on 14
        const r = countsOf(
            show(homes4, way, keepSpots, { along: true, cut: { 0: 9 } }),
        );
        expect(summary(r)).toEqual([
            [
                6,
                0,
                [
                    [3, 2],
                    [2, 4],
                    [1, 6],
                ],
            ],
            [
                6,
                8,
                [
                    [4, 8],
                    [3, 10],
                    [2, 12],
                ],
            ],
        ]);
        expect(r.corners[1]!.stopBefore).toBe(1);
    });

    it("QA-TC-10: a line standing in a small circle gets no corner at each marcher; an L-shaped line keeps its bend", () => {
        for (const n of [8, 12, 16, 18]) {
            // n marchers on a circle of radius 6, tail first counterclockwise; the trail leaves
            // the leader straight out
            const homes = Array.from({ length: n }, (_, i): XY => {
                const a = (2 * Math.PI * i) / n;
                return [6 * Math.cos(a), 6 * Math.sin(a)];
            });
            const leader = homes[n - 1]!;
            const out: XY = [leader[0] * 3, leader[1] * 3];
            const r = countsOf(
                show(homes, pts([out]), [out, out].concat(homes.slice(2)), {
                    along: true,
                }),
            );
            const lineLen = 2 * n * 6 * Math.sin(Math.PI / n) * ((n - 1) / n);
            const inLine = r.corners.filter((c) => c.d < lineLen - 1e-6);
            expect(inLine, `circle of ${n}`).toEqual([]);
        }
        // an L: four along x, then three up; the bend at (6,0) is a corner
        const L: XY[] = [
            [0, 0],
            [2, 0],
            [4, 0],
            [6, 0],
            [6, 2],
            [6, 4],
        ];
        const r = countsOf(
            show(
                L,
                pts([[6, 12]]),
                [
                    [6, 6],
                    [6, 7],
                    [6, 8],
                    [6, 9],
                    [6, 10],
                    [6, 12],
                ],
                { along: true },
            ),
        );
        expect(r.corners.map((c) => c.at)).toEqual([[6, 0]]);
    });

    it("QA-TC-11: an end line on a small arc gets no corner at each spot", () => {
        // five spots on a quarter circle of radius 4 about (20,10); the trail runs into the first
        const arc = Array.from({ length: 5 }, (_, i): XY => {
            const a = (Math.PI / 2) * (i / 4);
            return [20 + 4 * Math.cos(a), 10 + 4 * Math.sin(a)];
        });
        const homes: XY[] = [0, 1, 2, 3, 4].map((i): XY => [2 * i, 0]);
        const r = countsOf(show(homes, pts([[24, 0]]), arc));
        // the trail's corner at (24,0); the entrance turns only about 11° onto the arc, and the
        // arc's own spots don't stand out from each other
        expect(r.corners.map((c) => c.at)).toEqual([[24, 0]]);
    });

    it("QA-TC-12 (TC-4): on a count is the count shown, whole at a tenth", () => {
        // 2.05 is 20.5 tenths, which rounds up: shown as 2.1, so off a count
        expect([0.95, 2.05, 1.94, 7.45, 6.04].map(isOnCount)).toEqual([
            true,
            false,
            false,
            false,
            true,
        ]);
        expect([0.95, 2.05, 1.94].map(roundCount)).toEqual([1, 2.1, 1.9]);
    });

    it("QA-TC-6: random trails agree with the resolver at every listed turn", () => {
        const rand = mulberry32(648);
        const R = (lo: number, hi: number) => lo + (hi - lo) * rand();
        let checked = 0;
        for (let trial = 0; trial < 300; trial++) {
            const n = 2 + Math.floor(rand() * 5);
            const x0 = R(-20, 20);
            const y0 = R(-20, 20);
            const homes = Array.from(
                { length: n },
                (_, i): XY => [x0 + 2 * i, y0 + R(-0.5, 0.5)],
            );
            const k = 1 + Math.floor(rand() * 4);
            const points: RoutePoint[] = [];
            let p: XY = homes[n - 1]!;
            for (let i = 0; i < k; i++) {
                p = [p[0] + R(-12, 12), p[1] + R(2, 12)];
                const pt: RoutePoint = { id: `p${i}`, at: p };
                const roll = rand();
                if (roll < 0.2) pt.tension = R(0.3, 1.5);
                else if (roll < 0.35) {
                    pt.bulge = R(-0.5, 0.5) || 0.1;
                    delete points[i - 1]?.tension;
                }
                points.push(pt);
            }
            const along = rand() < 0.5;
            const reverse = !along && rand() < 0.4;
            const counts = 8 + Math.floor(rand() * 17);
            const spots = Array.from(
                { length: n },
                (_, i): XY => [p[0] + 2 * i, p[1] + R(0, 1)],
            );
            // now and then a member is taken over partway (its row ends early)
            const cut: Record<number, number> = {};
            if (rand() < 0.3) cut[Math.floor(rand() * n)] = R(1, counts - 1);
            const r = countsOf(
                show(homes, points, spots, { along, counts, reverse, cut }),
            );
            for (const c of r.corners) {
                checked += c.turns.length;
                for (const t of c.turns)
                    expect(t.onCount).toBe(isOnCount(t.count));
                // the leader reaches a corner first, then each next one back (P-5)
                if (!along)
                    for (let i = 1; i < c.turns.length; i++)
                        expect(c.turns[i]!.q).toBeLessThan(c.turns[i - 1]!.q);
            }
        }
        expect(checked).toBeGreaterThan(300);
    });
});
