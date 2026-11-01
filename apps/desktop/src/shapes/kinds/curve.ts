import tolgee from "@/global/singletons/Tolgee";
// cspell:words Catmull Yuksel Schaefer Keyser
import { principalExtremes } from "../geometry/fit";
import { makePath, type Path, type Segment } from "../geometry/path";
import {
    add,
    dist,
    dot,
    scale,
    snapAngle,
    sub,
    unit,
    xy,
    scaleAbout,
} from "../geometry/vec";
import { sampleAlong } from "../spacing";
import type { ShapeKind, Spacing, XY } from "../types";
import {
    FIT,
    pathReadouts,
    SPACING_GROUP,
    pathGuide,
    pathOutline,
} from "./pathKind";

/** A smooth curve through `points` (at least 2), in order. */
export interface CurveParams {
    readonly points: readonly XY[];
    readonly spacing: Spacing;
}

const SAME = 1e-9;

/** The points with consecutive repeats dropped */
function distinctPoints(points: readonly XY[]): XY[] {
    const out: XY[] = [];
    for (const q of points) {
        if (out.length === 0 || dist(out.at(-1)!, q) > SAME) out.push(q);
    }
    return out;
}

/**
 * Centripetal Catmull-Rom (alpha 0.5) through the points, as cubic Bézier segments. Centripetal
 * spacing doesn't loop or cusp when points are uneven, which uniform Catmull-Rom does. The ends
 * use a mirrored phantom point, so an end segment leaves straight toward its neighbor's tangent.
 * Conversion after Yuksel, Schaefer and Keyser, "Parameterization and applications of
 * Catmull-Rom curves" (2011).
 */
export function curveSegments(points: readonly XY[]): Segment[] {
    const p = distinctPoints(points);
    if (p.length < 2) {
        const a = p[0] ?? xy(0, 0);
        return [{ type: "line", a, b: a }];
    }
    const at = (i: number): XY => {
        if (i < 0) return sub(scale(p[0]!, 2), p[1]!);
        if (i >= p.length) return sub(scale(p.at(-1)!, 2), p.at(-2)!);
        return p[i]!;
    };
    const segments: Segment[] = [];
    for (let i = 0; i < p.length - 1; i++) {
        const p0 = at(i - 1);
        const p1 = at(i);
        const p2 = at(i + 1);
        const p3 = at(i + 2);
        // d = |Δ|^alpha with alpha = 0.5, so d² = |Δ|
        const d1 = Math.sqrt(dist(p0, p1));
        const d2 = Math.sqrt(dist(p1, p2));
        const d3 = Math.sqrt(dist(p2, p3));
        const c1 =
            d1 < SAME
                ? p1
                : scale(
                      add(
                          sub(scale(p2, d1 * d1), scale(p0, d2 * d2)),
                          scale(p1, 2 * d1 * d1 + 3 * d1 * d2 + d2 * d2),
                      ),
                      1 / (3 * d1 * (d1 + d2)),
                  );
        const c2 =
            d3 < SAME
                ? p2
                : scale(
                      add(
                          sub(scale(p1, d3 * d3), scale(p3, d2 * d2)),
                          scale(p2, 2 * d3 * d3 + 3 * d3 * d2 + d2 * d2),
                      ),
                      1 / (3 * d3 * (d3 + d2)),
                  );
        segments.push({ type: "cubic", a: p1, c1, c2, b: p2 });
    }
    return segments;
}

const curvePath = (p: CurveParams): Path => makePath(curveSegments(p.points));

const middleOf = (path: Path): XY => path.at(path.length / 2);

const POINT_KEY = /^p(\d+)$/;

export const curveKind: ShapeKind<CurveParams> = {
    id: "curve",
    version: 1,
    get label() {
        return tolgee.t("shapes.kinds.curve.label", "Curve");
    },
    family: "path",
    groups: [SPACING_GROUP],

    fit({ current }, ctx) {
        const ends = principalExtremes(current);
        if (!ends) {
            const c = current[0] ?? xy(0, 0);
            const half = 2 * ctx.stepPx;
            return {
                points: [xy(c.x - half, c.y), xy(c.x + half, c.y)],
                spacing: FIT,
            };
        }
        // Order the marchers along their principal axis, then take evenly spread ones as
        // control points, so the curve runs through some of them, ends included.
        const axis = unit(sub(ends[1], ends[0]));
        const ordered = current
            .map((q, index) => ({ q, t: dot(sub(q, ends[0]), axis), index }))
            .sort((a, b) => a.t - b.t || a.index - b.index)
            .map((entry) => entry.q);
        const n = ordered.length;
        const k = Math.min(n, Math.max(2, Math.min(6, Math.round(n / 3))));
        const points: XY[] = [];
        for (let i = 0; i < k; i++)
            points.push(ordered[Math.round((i * (n - 1)) / (k - 1))]!);
        return { points, spacing: FIT };
    },

    path: curvePath,
    keepsPath: true,
    insertPoint(p, at) {
        // Between the two points whose stretch of curve passes nearest `at`
        const path = curvePath(p);
        const s = path.project(at);
        const marks = p.points.map((q) => path.project(q));
        let index = p.points.length - 1;
        for (let i = 1; i < marks.length; i++) {
            if (s <= marks[i]!) {
                index = i;
                break;
            }
        }
        return {
            ...p,
            points: [...p.points.slice(0, index), at, ...p.points.slice(index)],
        };
    },
    removePoint(p, key) {
        const index = Number(key.slice(1));
        if (
            !key.startsWith("p") ||
            !Number.isInteger(index) ||
            p.points.length <= 2
        )
            return undefined;
        return { ...p, points: p.points.filter((_, i) => i !== index) };
    },
    scale: (p, pivot, k) => ({
        ...p,
        points: p.points.map((q) => scaleAbout(q, pivot, k)),
    }),

    handles(p) {
        return [
            ...p.points.map((at, i) => ({
                key: `p${i}`,
                role: "point" as const,
                at,
                start: i === 0,
                end: i === p.points.length - 1,
                hint: tolgee.t(
                    "shapes.kinds.curve.hint.point",
                    "Point (double-click it to remove)",
                ),
            })),
            { key: "move", role: "move", at: middleOf(curvePath(p)) },
        ];
    },

    drag(p, key, to, { constrain }) {
        if (key === "move") {
            const delta = sub(to, middleOf(curvePath(p)));
            return { ...p, points: p.points.map((q) => add(q, delta)) };
        }
        const match = POINT_KEY.exec(key);
        if (!match) return p;
        const index = Number(match[1]);
        if (index >= p.points.length) return p;
        // Constrain: the leg from the previous point (the next one, for the first) at 45° steps
        const neighbor = p.points[index === 0 ? 1 : index - 1];
        const target =
            constrain && neighbor ? snapAngle(neighbor, to, Math.PI / 4) : to;
        return {
            ...p,
            points: p.points.map((q, i) => (i === index ? target : q)),
        };
    },

    outline: (p, n, ctx) => pathOutline(curvePath(p), p.spacing, n, ctx),

    guide: (p, _n, ctx) => pathGuide(curvePath(p), p.spacing, ctx),

    generate: (p, n, ctx) =>
        sampleAlong(curvePath(p), p.spacing, n, ctx.stepPx),

    orderKey: (p, point) => [curvePath(p).project(point)],

    readouts: (p, n, ctx) => pathReadouts(curvePath(p), p.spacing, n, ctx),

    validate(p) {
        if (distinctPoints(p.points).length < 2) {
            return [
                {
                    level: "error",
                    message: tolgee.t(
                        "shapes.kinds.curve.validate.points",
                        "The curve needs at least 2 different points",
                    ),
                },
            ];
        }
        return [];
    },
};
