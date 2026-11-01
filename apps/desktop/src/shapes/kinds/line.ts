import tolgee from "@/global/singletons/Tolgee";
import { flatness, principalExtremes, typicalSpacing } from "../geometry/fit";
import { makePath, type Path } from "../geometry/path";
import {
    add,
    centroid,
    dist,
    mid,
    scaleAbout,
    snapAngle,
    sub,
    xy,
} from "../geometry/vec";
import {
    FIT,
    pathReadouts,
    SPACING_GROUP,
    pathGuide,
    pathOutline,
} from "./pathKind";
import { sampleAlong } from "../spacing";
import type { ShapeKind, Spacing, XY } from "../types";

/**
 * The move handle, a step and a half in front of the line's middle (+y side), so it doesn't sit
 * on the middle marcher (sims, round 11)
 */
function moveHandleAt(p: LineParams, stepPx: number): XY {
    const d = sub(p.b, p.a);
    const length = Math.hypot(d.x, d.y);
    if (length === 0) return mid(p.a, p.b);
    let nx = -d.y / length;
    let ny = d.x / length;
    if (ny < 0 || (ny === 0 && nx < 0)) {
        nx = -nx;
        ny = -ny;
    }
    const out = 1.5 * stepPx;
    const m = mid(p.a, p.b);
    return xy(m.x + nx * out, m.y + ny * out);
}

/** Above this flatness (see `flatness`) the marchers aren't treated as a rough line */
const LINE_LIKE = 0.35;

export interface LineParams {
    readonly a: XY;
    readonly b: XY;
    readonly spacing: Spacing;
}

const linePath = (p: LineParams): Path =>
    makePath([{ type: "line", a: p.a, b: p.b }]);

export const lineKind: ShapeKind<LineParams> = {
    id: "line",
    version: 1,
    get label() {
        return tolgee.t("shapes.kinds.line.label", "Line");
    },
    family: "path",
    groups: [SPACING_GROUP],
    measures: [
        {
            key: "angle",
            get label() {
                return tolgee.t("shapes.kinds.measure.angle", "Angle");
            },
            unit: "angle",
            // Counterclockwise as seen on screen, 0 along the sidelines
            get: (p) => Math.atan2(-(p.b.y - p.a.y), p.b.x - p.a.x),
            set: (p, angle) => {
                const length = dist(p.a, p.b);
                return {
                    ...p,
                    b: add(
                        p.a,
                        xy(length * Math.cos(angle), -length * Math.sin(angle)),
                    ),
                };
            },
        },
    ],

    path: linePath,
    scale: (p, pivot, k) => ({
        ...p,
        a: scaleAbout(p.a, pivot, k),
        b: scaleAbout(p.b, pivot, k),
    }),

    fit({ current }, ctx) {
        const ends = principalExtremes(current);
        if (!ends) {
            const c = current[0] ?? xy(0, 0);
            const half = 2 * ctx.stepPx;
            return {
                a: xy(c.x - half, c.y),
                b: xy(c.x + half, c.y),
                spacing: FIT,
            };
        }
        // Marchers that aren't roughly in a line already (a circle, a block): a level line
        // through their middle at their usual spacing, rather than their short diagonal
        if (flatness(current) > LINE_LIKE) {
            const c = centroid(current);
            const half =
                ((current.length - 1) * typicalSpacing(current, ctx.stepPx)) /
                2;
            return {
                a: xy(c.x - half, c.y),
                b: xy(c.x + half, c.y),
                spacing: FIT,
            };
        }
        return { a: ends[0], b: ends[1], spacing: FIT };
    },

    handles: (p, _n, ctx) => [
        { key: "a", role: "point", at: p.a, start: true },
        { key: "b", role: "point", at: p.b, end: true },
        { key: "move", role: "move", at: moveHandleAt(p, ctx.stepPx) },
    ],

    drag(p, key, to, { constrain }, _n, ctx) {
        if (key === "move") {
            const delta = sub(to, moveHandleAt(p, ctx.stepPx));
            return { ...p, a: add(p.a, delta), b: add(p.b, delta) };
        }
        if (key === "a")
            return {
                ...p,
                a: constrain ? snapAngle(p.b, to, Math.PI / 4) : to,
            };
        if (key === "b")
            return {
                ...p,
                b: constrain ? snapAngle(p.a, to, Math.PI / 4) : to,
            };
        return p;
    },

    outline: (p, n, ctx) => pathOutline(linePath(p), p.spacing, n, ctx),

    guide: (p, _n, ctx) => pathGuide(linePath(p), p.spacing, ctx),

    generate: (p, n, ctx) => sampleAlong(linePath(p), p.spacing, n, ctx.stepPx),

    orderKey: (p, point) => [linePath(p).project(point)],

    readouts: (p, n, ctx) => pathReadouts(linePath(p), p.spacing, n, ctx),

    validate(p) {
        if (dist(p.a, p.b) === 0) {
            return [
                {
                    level: "error",
                    message: tolgee.t(
                        "shapes.kinds.line.validate.sameSpot",
                        "The line's ends are on the same spot",
                    ),
                },
            ];
        }
        return [];
    },
};
