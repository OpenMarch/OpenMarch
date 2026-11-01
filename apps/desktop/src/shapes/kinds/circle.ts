import tolgee from "@/global/singletons/Tolgee";
import { radiusForChords } from "../geometry/chords";
import { fitCircle } from "../geometry/fit";
import { makePath, type Path } from "../geometry/path";
import { centroid, dist, polar, scaleAbout, snapAngle } from "../geometry/vec";
import { gapsInSteps, sampleAlong } from "../spacing";
import type {
    ShapeContext,
    ShapeIssue,
    ShapeKind,
    Spacing,
    XY,
} from "../types";
import {
    FIT,
    pathReadouts,
    SPACING_GROUP,
    pathGuide,
    pathOutline,
} from "./pathKind";

/**
 * A full circle. `start` (radians, canvas axes) is where the first marcher stands; marchers go
 * around toward +y from there (clockwise on the canvas).
 */
export interface CircleParams {
    readonly center: XY;
    readonly r: number;
    readonly start: number;
    readonly spacing: Spacing;
}

const TAU = 2 * Math.PI;

/** How much of the way around `center` the points go: a full turn less the widest gap */
function coverage(points: readonly XY[], center: XY): number {
    if (points.length < 2) return 0;
    const angles = points
        .map((q) => Math.atan2(q.y - center.y, q.x - center.x))
        .sort((a, b) => a - b);
    let widest = angles[0]! + TAU - angles.at(-1)!;
    for (let i = 1; i < angles.length; i++)
        widest = Math.max(widest, angles[i]! - angles[i - 1]!);
    return TAU - widest;
}

const circlePath = (p: CircleParams): Path =>
    makePath(
        [
            {
                type: "arc",
                center: p.center,
                r: p.r,
                start: p.start,
                sweep: TAU,
            },
        ],
        true,
    );

/** Where the radius handle sits: on the rim at the start angle */
const rimPoint = (p: CircleParams): XY => polar(p.center, p.r, p.start);

export const circleKind: ShapeKind<CircleParams> = {
    id: "circle",
    version: 1,
    get label() {
        return tolgee.t("shapes.kinds.circle.label", "Circle");
    },
    family: "path",
    groups: [SPACING_GROUP],
    measures: [
        {
            key: "radius",
            get label() {
                return tolgee.t("shapes.kinds.measure.radius", "Radius");
            },
            unit: "length",
            min: 0.25,
            size: true,
            get: (p) => p.r,
            set: (p, r) => ({ ...p, r }),
        },
    ],

    path: circlePath,
    scale: (p, pivot, k) => ({
        ...p,
        center: scaleAbout(p.center, pivot, k),
        r: p.r * k,
    }),
    // Keeping a locked interval, the circle keeps its center and start: only the radius follows,
    // the one on which the gaps go exactly once around
    float: (p, gaps) => ({ ...p, r: radiusForChords(gaps, TAU) }),

    fit({ current }, ctx: ShapeContext) {
        const fitted = fitCircle(current);
        // A nearly straight row fits a huge circle, and marchers on a shallow arc fit a circle
        // centered far off: start around the group's middle instead unless they already go at
        // least halfway round
        if (
            fitted &&
            fitted.r <= 400 * ctx.stepPx &&
            fitted.r > 0 &&
            coverage(current, fitted.center) >= Math.PI
        ) {
            const first = current[0]!;
            return {
                center: fitted.center,
                r: fitted.r,
                start: Math.atan2(
                    first.y - fitted.center.y,
                    first.x - fitted.center.x,
                ),
                spacing: FIT,
            };
        }
        const center = centroid(current);
        const mean =
            current.length === 0
                ? 0
                : current.reduce((sum, q) => sum + dist(q, center), 0) /
                  current.length;
        return {
            center,
            r: Math.max(2 * ctx.stepPx, mean),
            // The first marcher stands toward the front (+y)
            start: Math.PI / 2,
            spacing: FIT,
        };
    },

    handles: (p) => [
        { key: "move", role: "move", at: p.center },
        {
            key: "radius",
            role: "point",
            at: rimPoint(p),
            start: true,
            hint: tolgee.t(
                "shapes.kinds.circle.hint.radius",
                "Radius, and where marcher 1 starts",
            ),
        },
    ],

    drag(p, key, to, { constrain }) {
        if (key === "move") {
            return { ...p, center: to };
        }
        if (key === "radius") {
            const rim = constrain ? snapAngle(p.center, to, Math.PI / 4) : to;
            const r = dist(p.center, rim);
            if (r === 0) return { ...p, r };
            return {
                ...p,
                r,
                start: Math.atan2(rim.y - p.center.y, rim.x - p.center.x),
            };
        }
        return p;
    },

    outline: (p, n, ctx) => pathOutline(circlePath(p), p.spacing, n, ctx),

    guide: (p, _n, ctx) => pathGuide(circlePath(p), p.spacing, ctx),

    generate: (p, n, ctx) =>
        sampleAlong(circlePath(p), p.spacing, n, ctx.stepPx),

    orderKey: (p, point) => [circlePath(p).project(point)],

    readouts(p, n, ctx) {
        const readouts = pathReadouts(circlePath(p), p.spacing, n, ctx);
        if (p.spacing.mode === "fit" && readouts[0]) {
            readouts[0] = {
                ...readouts[0],
                label: tolgee.t(
                    "shapes.kinds.circle.readout.circumference",
                    "Circumference",
                ),
            };
        }
        return readouts;
    },

    validate(p, slots, ctx) {
        if (!(p.r > 0)) {
            return [
                {
                    level: "error",
                    message: tolgee.t(
                        "shapes.kinds.circle.validate.noRadius",
                        "The circle has no radius",
                    ),
                },
            ];
        }
        const issues: ShapeIssue[] = [];
        if (p.spacing.mode === "interval") {
            // Interval lays n - 1 gaps from the start; more than the circumference laps it.
            const run =
                gapsInSteps(p.spacing.runs, slots.length - 1).reduce(
                    (sum, g) => sum + g,
                    0,
                ) * ctx.stepPx;
            if (run >= TAU * p.r - 1e-9) {
                issues.push({
                    level: "warning",
                    message: tolgee.t(
                        "shapes.kinds.circle.validate.overlap",
                        "The intervals go all the way around the circle, so marchers overlap",
                    ),
                });
            } else if (p.spacing.size !== "follow" && slots.length > 1) {
                // Laid on a circle bigger than the run: say why part of it is empty
                const steps = (v: number) =>
                    Math.round((v / ctx.stepPx) * 100) / 100;
                issues.push({
                    level: "info",
                    message: tolgee.t(
                        "shapes.kinds.circle.validate.partFilled",
                        "{count, plural, one {# marcher at this interval fills} other {# marchers at this interval fill}} {run} of the circle's {total} steps. Open the size lock to make the circle close.",
                        {
                            count: slots.length,
                            run: steps(run),
                            total: steps(TAU * p.r),
                        },
                    ),
                });
            }
        }
        return issues;
    },
};
