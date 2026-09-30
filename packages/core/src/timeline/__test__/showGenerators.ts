/**
 * Random show generators for the property tests, ported from
 * `docs/timeline/ref/props.mjs` so that a seed produces the same show as it
 * does there (same PRNG and the same order of draws). That lets a failing seed
 * be replayed against the reference suite.
 *
 * - `makeWorld(seed, false)`: an ordinary show at coordinate scale 10.
 * - `makeWorld(seed, true)`: a boundary-valued show. Coordinates at scale 1,
 *   10^3 or 10^6 (the I-S1 bound), bulges at +-1/2, +-1e-9 and 0 (I-T2),
 *   and beats based near 2^31 - 1 (I-N2).
 * - `chainWorld(seed)`: an adversarial chain of 60 partial minor arcs at
 *   |bulge| = 1/2 between far corners of the field (spec 8.11), then one
 *   direct move to (1, 1).
 *
 * About 30% of direct and arc transitions use individually placed
 * destinations (D-16) instead of a shape.
 */
import type {
    AssignmentRow,
    ShapeRow,
    TimelineSnapshot,
    TransitionRow,
    XY,
} from "../types";

export type Rand = () => number;

/** The mulberry32 PRNG used by `ref/`. */
export function mulberry32(seed: number): Rand {
    let a = seed | 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export interface World {
    db: TimelineSnapshot;
    /** The coordinate scale, used for the spec 12.1 tolerance */
    S: number;
    /** The generator's PRNG, left positioned after the show was built */
    R: Rand;
}

const copy = (p: XY): XY => [p[0], p[1]];

// One long function keeps the order of PRNG draws identical to props.mjs.
// eslint-disable-next-line max-lines-per-function
export function makeWorld(seed: number, boundary: boolean): World {
    const R = mulberry32(seed * 104729 + (boundary ? 1 : 0));
    const ri = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(R() * xs.length)]!;
    const S = boundary ? pick([1, 1e3, 1e6]) : 10; // coordinate scale, up to the I-S1 bound
    const B0 = boundary ? pick([0, 2 ** 31 - 1 - 200]) : 0; // beat base, up to the I-N2 bound
    const c = () => Math.round((R() * 2 - 1) * S * 1e3) / 1e3;
    const pt = (): XY => [c(), c()];

    const shape = (): ShapeRow => {
        const k = pick(["line", "freehand", "circle", "box", "block"] as const);
        if (k === "line") {
            const a = pt();
            let b = pt();
            if (a[0] === b[0] && a[1] === b[1]) b = [a[0] + 1, a[1]];
            return { kind: k, geometry: { points: [a, b] } };
        }
        if (k === "freehand") {
            const p: XY[] = [pt()];
            // The bound is re-drawn on every iteration, as in props.mjs.
            for (let i = 0; i < ri(1, 4); i++)
                p.push(R() < 0.3 ? copy(p[p.length - 1]!) : pt());
            p.push(copy(p[0]!));
            if (p.every((q) => q[0] === p[0]![0] && q[1] === p[0]![1]))
                p.push([p[0]![0] + 1, p[0]![1]]);
            return { kind: k, geometry: { points: p } };
        }
        // Keep every point inside [-S, S]^2 (I-S1).
        const half = (): XY => {
            const q = pt();
            return [q[0] / 2, q[1] / 2];
        };
        const size = () => Math.max(1e-3, Math.abs(c()) / 2);
        if (k === "circle") {
            const center = half();
            const radius = size();
            const start_angle = R() * 2 * Math.PI * 0.999999;
            const clockwise = R() < 0.5;
            return {
                kind: k,
                geometry: { center, radius, start_angle, clockwise },
            };
        }
        if (k === "box") {
            const origin = half();
            const width = size();
            const height = size();
            return { kind: k, geometry: { origin, width, height } };
        }
        const origin = half();
        const rows = ri(1, 4);
        const cols = ri(1, 4);
        const sx = c() / 8;
        const sy = c() / 8;
        return { kind: k, geometry: { origin, rows, cols, spacing: [sx, sy] } };
    };

    const marchers: TimelineSnapshot["marchers"] = [];
    const shapes: Record<number, ShapeRow> = {};
    const transitions: Record<number, TransitionRow> = {};
    const assignments: AssignmentRow[] = [];
    for (let i = 1; i <= 6; i++) shapes[i] = shape();
    for (let m = 1; m <= ri(3, 7); m++)
        marchers.push({
            id: m,
            home: R() < 0.2 && m > 1 ? copy(marchers[0]!.home) : pt(),
        });

    // |k| <= 1/2 (I-T2)
    const bulge = () =>
        boundary
            ? pick([0.5, -0.5, 1e-9, -1e-9, 0, R() - 0.5])
            : +(R() - 0.5).toFixed(3);
    for (let id = 1; id <= ri(5, 9); id++) {
        const start = B0 + ri(0, 150);
        const end = start + ri(1, 40);
        const style = pick([
            "direct",
            "arc",
            "follow_the_leader",
            "follow_the_leader",
        ] as const);
        let dest = ri(1, 6);
        if (style === "follow_the_leader")
            while (shapes[dest]!.kind === "block") dest = ri(1, 6);
        let slots = ri(1, 8);
        const sh = shapes[dest]!;
        if (sh.kind === "block")
            slots = Math.min(slots, sh.geometry.rows * sh.geometry.cols); // I-T3, I-T4
        const order = R() < 0.8 ? "inherit" : "slot";
        const params =
            style === "arc"
                ? { bulge: bulge() }
                : style === "follow_the_leader"
                  ? {
                        waypoints: Array.from({ length: ri(0, 2) }, () =>
                            R() < 0.3 && marchers.length
                                ? copy(marchers[0]!.home)
                                : pt(),
                        ),
                    }
                  : null;
        const t: TransitionRow = {
            id,
            start,
            end,
            dest,
            slots,
            style,
            order,
            params,
        };
        if (style !== "follow_the_leader" && R() < 0.3) {
            // D-16: individually placed destinations
            t.dest = null;
            t.points = Array.from({ length: slots }, () => pt());
        }
        transitions[id] = t;
    }

    let rid = 1;
    const ok = (r: AssignmentRow) => {
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
        const t = pick(Object.values(transitions));
        const full = R() < 0.6;
        const s = full ? t.start : ri(t.start, t.end - 1);
        const e = full ? t.end : ri(s + 1, t.end);
        const r: AssignmentRow = {
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
    return { db: { marchers, shapes, transitions, assignments }, S, R };
}

/** Repeated partial minor arcs at |bulge| = 1/2, each exit aimed away from the next target. */
export function chainWorld(seed: number): World {
    const R = mulberry32(seed * 7907);
    const S = 1e6;
    const N = 60;
    const corners: XY[] = [
        [0, 0],
        [S, S],
        [-S, S],
        [-S, -S],
        [S, -S],
    ];
    const db: TimelineSnapshot = {
        marchers: [{ id: 1, home: [S, 0] }],
        shapes: {},
        transitions: {},
        assignments: [],
    };
    corners.forEach((q, i) => {
        db.shapes[i + 1] = {
            kind: "line",
            geometry: {
                points: [q, [q[0] === S ? S - 1 : q[0] + 1, q[1]]],
            },
        };
    });
    for (let i = 0; i < N; i++) {
        const dest = 1 + Math.floor(R() * 5);
        const bulge = R() < 0.5 ? 0.5 : -0.5;
        db.transitions[i + 1] = {
            id: i + 1,
            start: i,
            end: i + 2,
            dest,
            slots: 1,
            style: "arc",
            order: "inherit",
            params: { bulge },
        };
        db.assignments.push({
            id: i + 1,
            marcher: 1,
            transition: i + 1,
            slot: 0,
            start: i,
            end: i + 1,
            layer: 0,
        });
    }
    db.shapes[6] = {
        kind: "line",
        geometry: {
            points: [
                [1, 1],
                [2, 1],
            ],
        },
    };
    db.transitions[N + 1] = {
        id: N + 1,
        start: N,
        end: N + 4,
        dest: 6,
        slots: 1,
        style: "direct",
        order: "inherit",
        params: null,
    };
    db.assignments.push({
        id: N + 1,
        marcher: 1,
        transition: N + 1,
        slot: 0,
        start: N,
        end: N + 4,
        layer: 0,
    });
    return { db, S, R };
}
