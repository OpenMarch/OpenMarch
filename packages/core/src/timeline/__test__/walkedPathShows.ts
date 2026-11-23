/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Random shows for the walked-path property test (R-20, QA-WP-15): every path style the resolver
 * walks, at field scale. `walkedPathShow(seed, S)` is deterministic per seed; coordinates run
 * from 0 to `S`. Arc moves (with bulges at and around the limits), follow the leader onto lines,
 * boxes and circles with waypoints, trails (no shape, a
 * trail route, Reverse, ends along the way), own paths with corners and smooth points of many tensions,
 * group paths with offsets and Adjust profiles, coincident points, higher layers and partial
 * rows (so joins, resumes and cut spans).
 *
 * Some seeds build a show the resolver rejects; the test skips those.
 */
import type { TimelineSnapshot } from "../types";

type XY = readonly [number, number];

export const mulberry32 = (seed: number) => {
    let a = seed | 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

export function walkedPathShow(seed: number, S: number): TimelineSnapshot {
    const R = mulberry32(seed * 7919 + 13);
    const ri = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(R() * xs.length)]!;
    const c = () => Math.round(R() * S * 1e3) / 1e3;
    const pool: XY[] = [];
    const pt = (): XY => {
        if (pool.length && R() < 0.15) return [...pick(pool)] as XY; // coincident
        const p: XY = [c(), c()];
        pool.push(p);
        return p;
    };
    const shapes: Record<number, any> = {};
    const shape = () => {
        const k = pick(["line", "freehand", "circle", "box", "block"] as const);
        if (k === "line") {
            const a = pt();
            let b = pt();
            if (a[0] === b[0] && a[1] === b[1]) b = [a[0] + 1, a[1]];
            return { kind: k, geometry: { points: [a, b] } };
        }
        if (k === "freehand") {
            const p: XY[] = [pt()];
            const n = ri(1, 4);
            for (let i = 0; i < n; i++)
                p.push(R() < 0.3 ? ([...p[p.length - 1]!] as XY) : pt());
            if (p.every((q) => q[0] === p[0]![0] && q[1] === p[0]![1]))
                p.push([p[0]![0] + 1, p[0]![1]]);
            return { kind: k, geometry: { points: p } };
        }
        if (k === "circle")
            return {
                kind: k,
                geometry: {
                    center: pt(),
                    radius: Math.max(1e-3, c() / 4),
                    start_angle: R() * 2 * Math.PI * 0.999999,
                    clockwise: R() < 0.5,
                },
            };
        if (k === "box")
            return {
                kind: k,
                geometry: {
                    origin: pt(),
                    width: Math.max(1e-3, c() / 3),
                    height: Math.max(1e-3, c() / 3),
                },
            };
        return {
            kind: k,
            geometry: {
                origin: pt(),
                rows: ri(1, 4),
                cols: ri(1, 4),
                spacing: [c() / 20, c() / 20],
            },
        };
    };
    for (let i = 1; i <= 6; i++) shapes[i] = shape();
    const marchers: { id: number; home: XY }[] = [];
    const nm = ri(2, 6);
    for (let m = 1; m <= nm; m++) marchers.push({ id: m, home: pt() });

    const transitions: Record<number, any> = {};
    const routes: Record<number, any> = {};
    const lanes: Record<number, any> = {};
    let laneId = 1;
    let routeId = 1;
    const nt = ri(4, 9);
    const bulge = () =>
        pick([
            0.5,
            -0.5,
            1e-9,
            -1e-9,
            0,
            1e-7,
            0.99e-7,
            2e-7,
            R() - 0.5,
            R() - 0.5,
            (R() - 0.5) / 50,
        ]);
    const mkRoute = () => {
        const n = pick([0, 1, 1, 2, 3, 4, 5]);
        const points = [];
        for (let i = 0; i < n; i++) {
            const smooth = R() < 0.5;
            points.push({
                id: `p${i}`,
                at: R() < 0.1 && i > 0 ? points[i - 1]!.at : pt(),
                ...(smooth
                    ? { tension: pick([1, 1, 0.3, 2, 0.01, R() * 2 + 1e-3]) }
                    : {}),
            });
        }
        return { geometry: { v: 1, from: pt(), to: pt(), points } };
    };
    for (let id = 1; id <= nt; id++) {
        const start = ri(0, 60);
        const end = start + ri(1, 24);
        const style = pick([
            "direct",
            "direct",
            "arc",
            "arc",
            "follow_the_leader",
        ] as const);
        let dest: number | null = ri(1, 6);
        if (style === "follow_the_leader")
            while (shapes[dest]!.kind === "block") dest = ri(1, 6);
        let slots = ri(1, 6);
        const sh = shapes[dest]!;
        if (sh.kind === "block")
            slots = Math.min(slots, sh.geometry.rows * sh.geometry.cols);
        const t: any = {
            id,
            start,
            end,
            dest,
            slots,
            style,
            order: R() < 0.7 ? "inherit" : "slot",
            params:
                style === "arc"
                    ? { bulge: bulge() }
                    : style === "follow_the_leader"
                      ? {
                            waypoints: Array.from({ length: ri(0, 2) }, () =>
                                pt(),
                            ),
                        }
                      : null,
        };
        if (style !== "follow_the_leader" && R() < 0.4) {
            t.dest = null;
            t.points = Array.from({ length: slots }, () => pt());
        }
        if (style === "follow_the_leader") {
            // Trails (pathways steps 4 and 4b) from their own stream, so the draws above stay
            // what they were: Reverse, no shape (R-13′), a trail route (R-9′), ends along the
            // way (R-13″)
            const T2 = mulberry32(seed * 104729 + id);
            const c2 = () => Math.round(T2() * S * 1e3) / 1e3;
            if (T2() < 0.3) t.params.reverse = true;
            if (T2() < 0.4) {
                t.dest = null;
                t.points = Array.from(
                    { length: slots },
                    (): XY => [c2(), c2()],
                );
                if (T2() < 0.6) t.params.ends = "along";
            }
            if (T2() < 0.5) {
                const n = Math.floor(T2() * 5);
                const points = Array.from({ length: n }, (_, i) => ({
                    id: `t${i}`,
                    at: [c2(), c2()] as XY,
                    ...(T2() < 0.4 ? { tension: 0.2 + T2() * 1.8 } : {}),
                }));
                routes[routeId] = {
                    geometry: {
                        v: 1,
                        from: [c2(), c2()],
                        to: [c2(), c2()],
                        points,
                    },
                };
                t.route = routeId++;
            }
        }
        transitions[id] = t;
        if (style !== "follow_the_leader" && R() < 0.6) {
            // lanes: maybe a shared group route, maybe own routes
            const group = R() < 0.6 ? routeId++ : null;
            if (group !== null) routes[group] = mkRoute();
            for (let s = 0; s < slots; s++) {
                if (R() < 0.25) continue;
                if (group !== null && R() < 0.8) {
                    const r = routes[group].geometry;
                    const ids = [
                        "from",
                        ...r.points.map((p: any) => p.id),
                        "to",
                    ];
                    const adjust =
                        R() < 0.5
                            ? {
                                  v: 1,
                                  keys: Array.from({ length: ri(1, 4) }, () => {
                                      const i = ri(0, ids.length - 2);
                                      return {
                                          a: R() < 0.05 ? "zz" : ids[i],
                                          b: ids[
                                              R() < 0.8
                                                  ? i + 1
                                                  : ri(i + 1, ids.length - 1)
                                          ],
                                          f: pick([0, 1, 0.5, R(), R()]),
                                          d: pick([
                                              [0, 0],
                                              [c() / 10, -c() / 10],
                                              [c() / 10, c() / 10],
                                          ]),
                                      };
                                  }),
                              }
                            : null;
                    lanes[laneId++] = {
                        transition: id,
                        slot: s,
                        route: group,
                        offset:
                            R() < 0.15
                                ? [0, 0]
                                : [c() / 10 - S / 20, c() / 10 - S / 20],
                        ...(adjust ? { adjust } : {}),
                    };
                } else {
                    routes[routeId] = mkRoute();
                    lanes[laneId++] = {
                        transition: id,
                        slot: s,
                        route: routeId++,
                        offset: null,
                    };
                }
            }
        }
    }
    const assignments: any[] = [];
    let rid = 1;
    const ok = (r: any) => {
        const t = transitions[r.transition]!;
        if (
            r.start < t.start ||
            r.end > t.end ||
            r.end <= r.start ||
            r.slot >= t.slots
        )
            return false;
        return assignments.every(
            (o) =>
                !(
                    o.transition === r.transition &&
                    (o.slot === r.slot || o.marcher === r.marcher)
                ) &&
                !(
                    o.marcher === r.marcher &&
                    o.layer === r.layer &&
                    o.start < r.end &&
                    r.start < o.end
                ),
        );
    };
    for (let i = 0; i < 70; i++) {
        const t = pick(Object.values(transitions)) as any;
        const full = R() < 0.6;
        const s = full ? t.start : ri(t.start, t.end - 1);
        const e = full ? t.end : ri(s + 1, t.end);
        const r = {
            id: rid,
            marcher: pick(marchers).id,
            transition: t.id,
            slot: ri(0, t.slots - 1),
            start: s,
            end: e,
            layer: pick([0, 0, 0, 1, 2]),
        };
        if (ok(r)) {
            assignments.push(r);
            rid++;
        }
    }
    return {
        marchers,
        shapes,
        transitions,
        assignments,
        routes,
        lanes,
    } as TimelineSnapshot;
}
