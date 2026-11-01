import tolgee from "@/global/singletons/Tolgee";
import { formatSteps } from "../editor/format";
import { SPACING_FINE_RATE, SPACING_RATE } from "../editor/scrub";
import type { AnyToolKind, ToolEnv } from "../tool/toolKind";
import { pivotPoint, samePivot, type Pivot } from "./frame";
import { settled } from "./gestures";
import { carryPivot, pivotOf } from "./pivot";

/**
 * Scaling a shape (spec #344, #349): by interval, in half steps, never by a percentage, because
 * drill is written in intervals. A kind says which it does (`ToolKind.scaling`):
 *
 * - `interval`: every spacing it shows changes by half a step (each gap of a gap list too);
 * - `footprint` (no regular spacing, such as a natural fill): its size changes by half a step
 *   each way.
 *
 * Either way the pivot stays put. Everything here is pure, and nothing knows the kind.
 */

/** How much one − or + changes a spacing or a footprint, in steps */
export const SCALE_STEP = 0.5;

/**
 * The shape one − (`by` -1) or + (1) scales to, around `pivot`; null where it can't go that way
 * (a spacing already half a step, a kind with nothing to scale)
 */
export function scaleShape(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    by: -1 | 1,
    pivot: Pivot,
    env: ToolEnv,
): unknown {
    // Every spacing changes by the same half step: the lock that keeps their ratio would not
    const plain: ToolEnv = { ...env, snap: true, ratioLocked: false, pivot };
    const scaled =
        kind.scaling === "interval"
            ? widened(kind, params, n, by * SCALE_STEP, plain)
            : grown(kind, params, n, by * SCALE_STEP, plain);
    if (scaled === null) return null;
    const anchored = keepPivot(
        kind,
        params,
        carryPivot(params, scaled),
        n,
        pivot,
    );
    const around = samePivot(pivotOf(params), pivot)
        ? pivotPoint(kind.frameOf(params, n), pivot)
        : null;
    return settled(kind, anchored, n, plain, around);
}

/** Each interval the shape shows, `by` steps wider; null when one can't go there */
function widened(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    by: number,
    env: ToolEnv,
): unknown {
    const intervals = kind.params.filter(
        (p) => p.interval && p.widen && (p.shown?.(params, n) ?? true),
    );
    if (intervals.length === 0) return null;
    let next = params;
    for (const param of intervals) {
        const wider = param.widen!(next, n, by, env);
        if (wider === null) return null;
        next = wider;
    }
    return next === params ? null : next;
}

/** The footprint `by` steps wider and deeper (a line stays a line); null under half a step */
function grown(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    by: number,
    env: ToolEnv,
): unknown {
    if (!kind.withSize) return null;
    const frame = kind.frameOf(params, n);
    const half = (by * env.stepPx) / 2;
    const min = (SCALE_STEP * env.stepPx) / 2;
    const halfWidth = frame.halfWidth > 0 ? frame.halfWidth + half : 0;
    const halfDepth = frame.halfDepth > 0 ? frame.halfDepth + half : 0;
    if (halfWidth === 0 && halfDepth === 0) return null;
    if (
        (frame.halfWidth > 0 && halfWidth < min - 1e-9) ||
        (frame.halfDepth > 0 && halfDepth < min - 1e-9)
    )
        return null;
    return kind.withSize(params, n, { halfWidth, halfDepth }, env);
}

/** Within this of a half step, a spacing is on the ladder (typed spacings keep 600ths) */
const LADDER_EPS = 1e-6;

const onLadder = (steps: number) =>
    Math.abs(steps * 2 - Math.round(steps * 2)) < LADDER_EPS;

/**
 * Which spacing drives a step that keeps the ratio (owner's rule on #489): the one on the half-step
 * ladder when only one is; otherwise the larger. Its index in `steps`.
 */
export function ratioDriver(steps: readonly number[]): number {
    const all = steps.map((_, i) => i);
    const on = all.filter((i) => onLadder(steps[i]!));
    if (on.length === 1) return on[0]!;
    return all.reduce((best, i) => (steps[i]! > steps[best]! ? i : best));
}

/**
 * One Expand (`by` 1) or Shrink (-1) of the spacings across and deep, in steps, keeping their
 * ratio (owner's half-step rule, #489). The driver (`ratioDriver`) goes to its next half step
 * that way (from off the ladder it rounds on to it: 3.2 → 3.5 or 3) and the other follows in
 * proportion, so equal spacings both go to the same next half step (1.3 → 1.5 or 1; owner). Null
 * when a spacing would go under half a step.
 */
export function expandStep(
    steps: readonly number[],
    by: -1 | 1,
): number[] | null {
    if (steps.length === 0) return null;
    const i = ratioDriver(steps);
    const from = steps[i]!;
    const to = onLadder(from)
        ? from + by * SCALE_STEP
        : (by > 0 ? Math.ceil(from * 2) : Math.floor(from * 2)) / 2;
    // Equal ones land on exactly the same value, not a hair off it
    const next = steps.map((s, j) =>
        j === i || Math.abs(s - from) < LADDER_EPS ? to : (s * to) / from,
    );
    return next.every((s) => s >= SCALE_STEP - LADDER_EPS) ? next : null;
}

/**
 * The shape one Expand (`by` 1) or Shrink (-1) scales to, around `pivot`, keeping its across:deep
 * ratio (#489, `expandStep`); null where it can't go. An interval kind's spacings take the step
 * (one or two of them: a single file, a circle and a spread have one); a footprint kind's size
 * does. Counts never change.
 */
export function scaleKeepingRatio(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    by: -1 | 1,
    pivot: Pivot,
    env: ToolEnv,
): unknown {
    return scaledBy(kind, params, n, pivot, env, (steps) =>
        expandStep(steps, by),
    );
}

/** Pixels of drag per Expand step: a spacing's own drag takes half a step per 8 px */
const EXPAND_PX = SPACING_RATE.px;

/**
 * Expand or Shrink dragged `distance` px (positive for bigger) from `base`, the shape at the
 * press: one step of the rule per 8 px, stopping at the smallest it can go. With `fine` the driver
 * moves a hundredth of a step per px, with the Snap toggle off (`env.pull` false) freely, the other
 * in proportion either way. Around `pivot`; `base` where it can't change.
 */
export function scrubKeepingRatio(
    kind: AnyToolKind,
    base: unknown,
    n: number,
    distance: number,
    pivot: Pivot,
    env: ToolEnv,
): unknown {
    if (env.fine || env.pull === false) {
        const px = Math.trunc(distance);
        const continuous = (steps: readonly number[]) => {
            const driver = steps[ratioDriver(steps)]!;
            const to = env.fine
                ? driver + px * SPACING_FINE_RATE.step
                : driver + (px * SPACING_RATE.step) / EXPAND_PX;
            // As small as it goes: the smallest spacing at half a step
            const floor = (SCALE_STEP * driver) / Math.min(...steps);
            const scale = Math.max(to, floor) / driver;
            return Math.abs(scale - 1) < 1e-12
                ? null
                : steps.map((s) => s * scale);
        };
        return scaledBy(kind, base, n, pivot, env, continuous) ?? base;
    }
    const count = Math.trunc(distance / EXPAND_PX);
    let params = base;
    for (let i = 0; i < Math.abs(count); i++) {
        const next = scaleKeepingRatio(
            kind,
            params,
            n,
            count > 0 ? 1 : -1,
            pivot,
            env,
        );
        if (next === null) break;
        params = next;
    }
    return params;
}

/** The shape with its spacings (or size) changed by `change`, the pivot kept where it was */
function scaledBy(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    pivot: Pivot,
    env: ToolEnv,
    change: (steps: readonly number[]) => readonly number[] | null,
): unknown {
    // Each spacing is set exactly as worked out: the ratio lock doesn't move the other
    const plain: ToolEnv = { ...env, ratioLocked: false, pivot };
    const scaled =
        kind.scaling === "interval"
            ? withSpacings(kind, params, n, plain, change)
            : withSizes(kind, params, n, plain, change);
    if (scaled === null || scaled === params) return null;
    return keepPivot(kind, params, carryPivot(params, scaled), n, pivot);
}

/** An interval kind with the spacings it shows changed by `change`; null where one can't be */
function withSpacings(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    env: ToolEnv,
    change: (steps: readonly number[]) => readonly number[] | null,
): unknown {
    const spacings = kind.params.filter(
        (p) => p.interval && p.value && p.set && (p.shown?.(params, n) ?? true),
    );
    if (spacings.length === 0) return null;
    const next = change(spacings.map((p) => p.value!(params, n, env.stepPx)));
    if (next === null) return null;
    let out: unknown = params;
    for (const [i, param] of spacings.entries()) {
        out = param.set!(out, n, next[i]!, env);
        if (out === null) return null;
    }
    return out;
}

/** A footprint kind with its length and depth changed by `change` (a line stays a line) */
function withSizes(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    env: ToolEnv,
    change: (steps: readonly number[]) => readonly number[] | null,
): unknown {
    if (!kind.withSize) return null;
    const frame = kind.frameOf(params, n);
    const halves = [frame.halfWidth, frame.halfDepth];
    const sized = halves.filter((h) => h > 1e-9);
    if (sized.length === 0) return null;
    const next = change(sized.map((h) => (2 * h) / env.stepPx));
    if (next === null) return null;
    let i = 0;
    const [halfWidth, halfDepth] = halves.map((h) =>
        h > 1e-9 ? (next[i++]! * env.stepPx) / 2 : 0,
    );
    return kind.withSize(
        params,
        n,
        { halfWidth: halfWidth!, halfDepth: halfDepth! },
        env,
    );
}

/** `after` moved so `pivot` is where it was on `before` */
function keepPivot(
    kind: AnyToolKind,
    before: unknown,
    after: unknown,
    n: number,
    pivot: Pivot,
): unknown {
    const was = pivotPoint(kind.frameOf(before, n), pivot);
    const frame = kind.frameOf(after, n);
    const now = pivotPoint(frame, pivot);
    if (Math.abs(was.x - now.x) < 1e-9 && Math.abs(was.y - now.y) < 1e-9)
        return after;
    return carryPivot(
        after,
        kind.withFrame(after, n, {
            ...frame,
            center: {
                x: frame.center.x + was.x - now.x,
                y: frame.center.y + was.y - now.y,
            },
        }),
    );
}

/**
 * What the Transform section's scale shows between − and +: the spacings for an interval kind
 * ("↔ 2 ↕ 2 apart", as the chip marks them), the size for a footprint kind ("10 × 4 steps")
 */
export function scaleReadout(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    env: ToolEnv,
): string {
    if (kind.scaling === "footprint") return sizeText(kind, params, n, env);
    const shown = kind.params
        .filter((p) => p.interval && (p.shown?.(params, n) ?? true))
        .map((p) =>
            [p.glyph, p.display(params, n, env.stepPx)]
                .filter(Boolean)
                .join(" "),
        );
    return shown.length > 0
        ? tolgee.t("shapes.frame.scale.apart", "{spacings} apart", {
              spacings: shown.join(" "),
          })
        : "";
}

/** The shape's length and depth through its frame: "14 × 6 steps", or "14 steps" for a line */
function sizeText(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    env: Pick<ToolEnv, "stepPx">,
): string {
    const frame = kind.frameOf(params, n);
    const sizes = [frame.halfWidth, frame.halfDepth]
        .filter((h) => h > 1e-9)
        .map((h) => formatSteps((2 * h) / env.stepPx));
    return sizes.length > 0
        ? tolgee.t("shapes.frame.scale.size", "{sizes} steps", {
              sizes: sizes.join(" × "),
          })
        : "";
}

/**
 * The readout by the pointer while a handle is dragged (#349): how long the shape is and, for an
 * interval kind, its spacings, so a long shape shows where the next half step lands
 */
export function lengthReadout(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    env: ToolEnv,
): string {
    const size = sizeText(kind, params, n, env);
    const spacing =
        kind.scaling === "interval" ? scaleReadout(kind, params, n, env) : "";
    return [size, spacing].filter(Boolean).join(" · ");
}
