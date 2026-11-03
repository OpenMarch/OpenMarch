import { shapeTurn, turnShape } from "../frame/gestures";
import { pivotOf } from "../frame/pivot";
import { pivotPoint } from "../frame/frame";
import type { XY } from "../types";
import type {
    AnyToolKind,
    ToolEnv,
    ToolGroup,
    ToolParam,
} from "../tool/toolKind";

/** One number in the floating chip, worked out from its kind's declaration */
export interface ChipNumber {
    // The chip shows numbers of any kind; each keeps the params of the shape it was read from
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly param: ToolParam<any>;
    readonly display: string;
    /** "1 short", or null */
    readonly note: string | null;
    /** What − and + would make the shape; null where it can't go that way or has no buttons */
    readonly less: unknown;
    readonly more: unknown;
    /** Worked out from the shape: shown, not changed ({@link ToolParam.derived}) */
    readonly derived: boolean;
}

/**
 * The floating chip's numbers (#344; 08-shape-system-ux.md, "The floating editor"): the kind's
 * primary parameters that apply to this shape, counts and other single values first, then its
 * spacings (intervals). The chip draws these and knows nothing else about the kind.
 */
export interface ChipLayout {
    readonly values: readonly ChipNumber[];
    readonly intervals: readonly ChipNumber[];
    /**
     * The kind's interval groups (#526), shown in place of its intervals; null for a shape with
     * one interval for everyone
     */
    readonly groups: readonly ToolGroup[] | null;
    /** Offer the lock that keeps the spacings in proportion: the kind has one and both show */
    readonly ratioLock: boolean;
    /**
     * The kind's interval lock (`ToolKind.lock`), beside its interval or groups: whether it's
     * locked, or null when it isn't offered
     */
    readonly lock: boolean | null;
}

export function chipLayout(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    env: ToolEnv,
): ChipLayout {
    const numbers: ChipNumber[] = kind.params
        .filter((p) => p.primary && (p.shown?.(params, n) ?? true))
        .map((param) => ({
            param,
            display: param.display(params, n, env.stepPx),
            note: param.note?.(params, n) ?? null,
            less: param.stepper?.by(params, n, -1, env) ?? null,
            more: param.stepper?.by(params, n, 1, env) ?? null,
            derived: param.derived?.(params, n, env.stepPx) ?? false,
        }));
    const groups = kind.groups?.shown(params, n, env.stepPx) ?? null;
    const intervals = groups ? [] : numbers.filter((x) => x.param.interval);
    return {
        values: numbers.filter((x) => !x.param.interval),
        intervals,
        groups,
        ratioLock:
            kind.ratioLock === true &&
            (kind.ratioLockFor?.(params, n) ?? true) &&
            intervals.length > 1,
        lock:
            kind.lock && kind.lock.shown(params, n)
                ? kind.lock.locked(params, n)
                : null,
    };
}

/**
 * The chip's turn button (owner lab feedback, 2026-10-23): the shape turned a quarter clockwise
 * about its pivot, so a box's deep versions are a click away without the ⋯ row
 */
export function quarterTurn(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    env: ToolEnv,
): unknown {
    return turnShape(
        kind,
        params,
        n,
        shapeTurn(kind, params, n) + Math.PI / 2,
        pivotOf(params),
        env,
    );
}

/** A run of presses on the chip's − and +: the shape the last press made, and where it began */
export interface SizeRun {
    readonly params: unknown;
    readonly anchor: XY;
}

/**
 * Where the next press grows from (#387): the run's anchor while the shape is still what the
 * run's last press made, else the shape's pivot on the field, starting a new run. Pressing from
 * the anchor rather than the last press's rounded place keeps the shape from creeping.
 */
export function sizeRun(
    run: SizeRun | null,
    kind: AnyToolKind,
    params: unknown,
    n: number,
): XY {
    if (run && run.params === params) return run.anchor;
    return pivotPoint(kind.frameOf(params, n), pivotOf(params));
}
