import tolgee from "@/global/singletons/Tolgee";
import { formatSteps, parseSteps } from "../editor/format";
import { scrubDistance, scrubValue, spacingRate } from "../editor/scrub";
import { SCALE_STEP } from "../frame/scale";
import type { ToolKind, ToolParam } from "../tool/toolKind";
import { groupShape } from "./groupShape";
import {
    groupFrame,
    groupInFrame,
    groupInterval,
    groupSnapPoints,
    insideGroup,
    groupHandles,
    moveGroup,
    stretchGroup,
    withGroupFrame,
    withGroupInterval,
    type GroupHandleKey,
    type GroupParams,
} from "./groupGeometry";
import { resizeCursor } from "../frame/frame";

/** Within this of a half step, an interval is on the ladder */
const LADDER_EPS = 1e-6;

const steps = (p: GroupParams, stepPx: number) =>
    (groupInterval(p) ?? 0) / stepPx;

/**
 * The group's one number: its interval, the smallest gap between neighbors (#356,
 * `groupInterval`). Setting it scales the whole group in proportion, so Shrink and Expand change
 * it in half steps as they do any shape's spacing. A loose group's is usually off the half steps,
 * so it shows as about so much until it's changed.
 */
const INTERVAL: ToolParam<GroupParams> = {
    key: "interval",
    get label() {
        return tolgee.t(
            "shapes.kinds.group.params.interval",
            "Smallest gap between neighbors, in steps",
        );
    },
    unit: "steps",
    primary: true,
    drag: "x",
    interval: true,
    blends: false,
    range: { min: SCALE_STEP },
    shown: (p) => groupInterval(p) !== null,
    derived: (p, _n, stepPx) => {
        const s = steps(p, stepPx);
        return Math.abs(s * 2 - Math.round(s * 2)) > LADDER_EPS;
    },
    snap: (p, _n, env) =>
        withGroupInterval(
            p,
            Math.max(SCALE_STEP, Math.round(steps(p, env.stepPx) * 2) / 2) *
                env.stepPx,
            env,
        ) ?? p,
    display: (p, _n, stepPx) => formatSteps(steps(p, stepPx)),
    value: (p, _n, stepPx) => steps(p, stepPx),
    type(p, _n, text, env) {
        const typed = parseSteps(text);
        return typed === null || typed < SCALE_STEP - LADDER_EPS
            ? null
            : withGroupInterval(p, typed * env.stepPx, env);
    },
    set: (p, _n, value, env) =>
        value < SCALE_STEP - LADDER_EPS
            ? null
            : withGroupInterval(p, value * env.stepPx, env),
    scrub(base, _n, m, env) {
        const was = steps(base, env.stepPx);
        const next = scrubValue(
            was,
            scrubDistance("x", m.dx, m.dy),
            0,
            spacingRate(env.snap, "x"),
        );
        // A drag that ends where it started changes nothing; it doesn't round the value
        if (next === was) return base;
        return (
            withGroupInterval(
                base,
                Math.max(SCALE_STEP, next) * env.stepPx,
                env,
            ) ?? base
        );
    },
    widen(p, _n, by, env) {
        const next = steps(p, env.stepPx) + by;
        if (next < SCALE_STEP - LADDER_EPS) return null;
        return withGroupInterval(p, next * env.stepPx, env);
    },
};

/**
 * The group tool kind (#603): marchers grouped where they stand. It's never drawn or picked (it
 * isn't in `SHAPE_TOOLS`); placed groups read back as it (`PLACED_KINDS`). It moves, turns, flips
 * around its pivot and scales by its interval, and its handles stretch it as an ungrouped
 * selection's do (owner on #606): a corner both ways, a side one way, constrain keeping the
 * proportions. Its spots are where its marchers stood, so who stands where is part of it (`asIs`).
 */
export const groupTool: ToolKind<GroupParams> = {
    shape: groupShape,
    params: [INTERVAL],
    scaling: "interval",
    asIs: true,
    draw: () => undefined,
    handles: (params) =>
        groupHandles(params).map(({ key, at, facing }) => ({
            key,
            at,
            // The cursor faces the way the handle does, however the group is turned: a corner's
            // is diagonal even on a wide group (owner on #606)
            cursor: resizeCursor(groupFrame(params), facing),
        })),
    dragHandle: (base, _n, key, to, env) =>
        stretchGroup(base, key as GroupHandleKey, to, env),
    // As an ungrouped selection's handles: constrain keeps the proportions, from center stretches
    // about the middle
    honors: {
        handle: () => ({ constrain: "keepRatio", fromCenter: "fromCenter" }),
    },
    snapPoints: (p) => groupSnapPoints(p),
    contains: (p, _n, at) => insideGroup(p, at),
    move: (base, _n, delta, env) => moveGroup(base, delta, env),
    frameOf: (p) => groupFrame(p),
    withFrame: (p, _n, frame) => withGroupFrame(p, frame),
    fromFrame: (frame, n) => groupInFrame(frame, n),
};
