import tolgee from "@/global/singletons/Tolgee";
import { resizeCursor } from "../frame/frame";
import { formatSteps, parseSteps } from "../editor/format";
import { scrubDistance, scrubValue, spacingRate } from "../editor/scrub";
import { distributionFor, type Distribution } from "../distribute/distribution";
import type { ToolEnv, ToolKind, ToolParam } from "../tool/toolKind";
import { circleShape } from "./circleShape";
import {
    CIRCLE_MODES,
    circleAtCount,
    circleDistribution,
    circleFrame,
    circleInFrame,
    circleOutline,
    circleRegionOf,
    dragRadius,
    drawCircle,
    grownFromPivot,
    keepingRadius,
    insideCircle,
    moveCircle,
    RADIUS_HANDLE,
    radiusHandlePoint,
    withCircleFrame,
    withInterval,
    type CircleParams,
} from "./circleGeometry";

/** An interval set as typed: kept as it is (1⅔, 1.37), not on half steps (#411, #423) */
const typedInterval = (
    p: CircleParams,
    n: number,
    steps: number,
    env: ToolEnv,
): CircleParams =>
    withInterval(p, n, steps * env.stepPx, { ...env, snap: false }, true);

/** The circle's one number: the interval between neighbors, which also sets its size */
const INTERVAL: ToolParam<CircleParams> = {
    key: "interval",
    get label() {
        return tolgee.t(
            "shapes.kinds.circle.params.interval",
            "Spacing between neighbors, in steps",
        );
    },
    unit: "steps",
    primary: true,
    drag: "x",
    interval: true,
    blends: true,
    default: 2,
    range: { min: 0.5 },
    glyph: "↔",
    shown: (_p, n) => n > 1,
    display: (p, _n, stepPx) => formatSteps(p.interval / stepPx),
    value: (p, _n, stepPx) => p.interval / stepPx,
    type(p, n, text, env) {
        const steps = parseSteps(text);
        return steps === null ? null : typedInterval(p, n, steps, env);
    },
    set: (p, n, steps, env) => typedInterval(p, n, steps, env),
    scrub(base, n, m, env) {
        const was = base.interval / env.stepPx;
        const steps = scrubValue(
            was,
            scrubDistance("x", m.dx, m.dy),
            0,
            spacingRate(env.snap, "x"),
        );
        // A drag that ends where it started changes nothing; it doesn't round the value
        if (steps === was) return base;
        return withInterval(base, n, steps * env.stepPx, env);
    },
    widen(p, n, by, env) {
        const steps = p.interval / env.stepPx + by;
        if (steps < 0.5 - 1e-9) return null;
        const next = withInterval(p, n, steps * env.stepPx, env);
        return next === p ? null : next;
    },
};

/**
 * The circle tool (#389, spec #385): drawn from its center out, its size set by one radius handle
 * that changes the interval, moved from inside, and turned and flipped through its frame like
X
 * distributor, in Outline or Even spread.
 */
/** Whether `b` fills the circle at the size `a` does: the same mode, and the same edge (#450) */
const sameSize = (a: Distribution, b: Distribution) =>
    a.mode === b.mode &&
    (a.mode !== "spread" ||
        b.mode !== "spread" ||
        (a.edge === true) === (b.edge === true));

export const circleTool: ToolKind<CircleParams> = {
    shape: circleShape,
    params: [INTERVAL],
    scaling: "interval",
    draw: (from, to, n, env) => drawCircle(from, to, n, env),
    atCount: (params, from, n) => circleAtCount(params, from, n),
    handles(params, n) {
        if (n <= 1) return [];
        return [
            {
                key: RADIUS_HANDLE,
                at: radiusHandlePoint(params, n),
                // Out from the center, however the circle is turned
                cursor: resizeCursor(circleFrame(params, n), { x: 1, y: 0 }),
            },
        ];
    },
    dragHandle: (base, n, _key, to, env) => dragRadius(base, n, to, env),
    outline: circleOutline,
    contains: insideCircle,
    move: (base, _n, delta, env) => moveCircle(base, delta, env),
    frameOf: circleFrame,
    withFrame: (params, _n, frame) => withCircleFrame(params, frame),
    fromFrame: circleInFrame,
    closed: {
        modes: CIRCLE_MODES,
        region: circleRegionOf,
        distribution: (params) => circleDistribution(params),
        startMode: (_params, n, mode) => distributionFor(mode, 1, n),
        // A new mode resizes the circle: it grows from the pivot
        withDistribution: (params, n, distribution) =>
            // Another mode keeps the circle drawn (#439); Reshuffle and a seed change nothing else
            sameSize(circleDistribution(params), distribution)
                ? { ...params, distribution }
                : keepingRadius(params, { ...params, distribution }, n),
    },
};
