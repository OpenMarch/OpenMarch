import clsx from "clsx";
import {
    memo,
    useEffect,
    useRef,
    type PointerEvent,
    type ReactNode,
} from "react";
import { ArrowsInSimpleIcon, ArrowsOutSimpleIcon } from "@phosphor-icons/react";
import { heldKeysOf, type Roles } from "@/input/modifierRoles";
import { holdGesture, type HeldGesture } from "../field/heldGesture";
import tolgee from "@/global/singletons/Tolgee";
import { pivotOf } from "../frame/pivot";
import { scaleKeepingRatio, scrubKeepingRatio } from "../frame/scale";
import type { ToolEnv } from "../tool/toolKind";
import type { ShapeEditTarget } from "./editTargets";
import {
    lockedAxis,
    SCRUB_SLOP_PX,
    scrubDistance,
    type ScrubAxis,
} from "./scrub";
import { Tip } from "./Tip";

/** How long a press is held before it repeats, and how often it repeats then, in ms */
const HOLD_MS = 400;
const REPEAT_MS = 120;

type EnvFor = (roles?: Roles) => ToolEnv | null;

/** The shape one Expand (`by` 1) or Shrink (-1) from `params`, around its pivot; null where it can't */
export const scaledOnce = (
    target: ShapeEditTarget,
    params: unknown,
    by: -1 | 1,
    env: ToolEnv,
) =>
    scaleKeepingRatio(
        target.kind,
        params,
        target.spots,
        by,
        pivotOf(params),
        env,
    );

/** One Expand or Shrink of the shape as it is now, as one undo step */
export const scaleOnce = (
    target: ShapeEditTarget,
    by: -1 | 1,
    envFor: EnvFor,
) => {
    const env = envFor();
    if (env) target.update((now) => scaledOnce(target, now, by, env) ?? now);
};

/**
 * Shrink and Expand (#489): the shape smaller or bigger, its across:deep ratio kept, around the
 * pivot, its counts unchanged (`scaleKeepingRatio`, the owner's half-step rule). A click is one
 * step; held, it repeats; dragged, it scrubs (right or up for bigger), one step per 8 px, finely
 * with fine (Shift) held and freely with the Snap toggle off. Each press is one undo step. Shrink is disabled when the
 * next step would take a spacing under half a step.
 */
export const ScaleButtons = memo(function ScaleButtons({
    live,
    envFor,
    canShrink,
    canExpand,
    shrinkKey,
    expandKey,
}: {
    live: ShapeEditTarget;
    envFor: EnvFor;
    canShrink: boolean;
    canExpand: boolean;
    shrinkKey?: string;
    expandKey?: string;
}) {
    return (
        <>
            <ScaleButton
                live={live}
                envFor={envFor}
                by={-1}
                disabled={!canShrink}
                label={
                    canShrink
                        ? tolgee.t(
                              "shapes.edit.shrink",
                              "Shrink, keeping the proportions",
                          )
                        : tolgee.t(
                              "shapes.edit.shrinkFloor",
                              "Shrink: no spacing can go under half a step",
                          )
                }
                shortcut={shrinkKey}
                testId="shape-editor-shrink"
            >
                <ArrowsInSimpleIcon size={14} />
            </ScaleButton>
            <ScaleButton
                live={live}
                envFor={envFor}
                by={1}
                disabled={!canExpand}
                label={tolgee.t(
                    "shapes.edit.expand",
                    "Expand, keeping the proportions",
                )}
                shortcut={expandKey}
                testId="shape-editor-expand"
            >
                <ArrowsOutSimpleIcon size={14} />
            </ScaleButton>
        </>
    );
});

/** What a press on a scale button is doing: not yet decided, repeating, or dragged */
interface Press {
    readonly x: number;
    readonly y: number;
    readonly pointerId: number;
    mode: "press" | "hold" | "scrub";
    axis: ScrubAxis | null;
    /** The shape at the press */
    readonly base: unknown;
    /** The shape as last previewed while held */
    current: unknown;
    /** The held roles, from the press; a role key mid-drag scrubs again where it is */
    readonly held: HeldGesture<{ dx: number; dy: number }>;
}

function ScaleButton({
    live: target,
    envFor,
    by,
    disabled,
    label,
    shortcut,
    testId,
    children,
}: {
    live: ShapeEditTarget;
    envFor: EnvFor;
    by: -1 | 1;
    disabled: boolean;
    label: string;
    shortcut?: string;
    testId: string;
    children: ReactNode;
}) {
    const press = useRef<Press | null>(null);
    // A key pressed it: the click the browser sends after is the same press
    const keyed = useRef(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const stopTimer = () => {
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = null;
    };
    useEffect(
        () => () => {
            stopTimer();
            press.current?.held.end();
        },
        [],
    );

    /** Held: one more step every so often, all one change until the release */
    const repeat = () => {
        const p = press.current;
        if (!p) return;
        if (p.mode === "press") {
            p.mode = "hold";
            target.begin();
        }
        const env = envFor();
        const next = env && scaledOnce(target, p.current, by, env);
        if (next != null) {
            p.current = next;
            target.preview(next);
        }
        timer.current = setTimeout(repeat, REPEAT_MS);
    };

    const down = (e: PointerEvent<HTMLButtonElement>) => {
        if (e.button !== 0) return;
        // As the editor's other controls: the press doesn't take the focus (`keepFocus`)
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        press.current?.held.end();
        const p: Press = {
            x: e.clientX,
            y: e.clientY,
            pointerId: e.pointerId,
            mode: "press",
            axis: null,
            base: target.params,
            current: target.params,
            held: holdGesture<{ dx: number; dy: number }>(
                heldKeysOf(e),
                (last, roles) => {
                    if (press.current === p) scrubTo(p, last, roles);
                },
            ),
        };
        press.current = p;
        if (!disabled) timer.current = setTimeout(repeat, HOLD_MS);
    };
    const move = (e: PointerEvent<HTMLButtonElement>) => {
        const p = press.current;
        if (!p || p.mode === "hold") return;
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        const keys = heldKeysOf(e);
        if (p.mode === "press") {
            if (Math.max(Math.abs(dx), Math.abs(dy)) < SCRUB_SLOP_PX) {
                p.held.move(keys, null);
                return;
            }
            stopTimer();
            p.mode = "scrub";
            target.begin();
        }
        p.axis = lockedAxis(p.axis, dx, dy);
        const roles = p.held.move(keys, p.axis ? { dx, dy } : null);
        if (p.axis) scrubTo(p, { dx, dy }, roles);
    };
    /** The shape dragged `dx`, `dy` px from the press, with these roles */
    const scrubTo = (
        p: Press,
        { dx, dy }: { dx: number; dy: number },
        roles: Roles,
    ) => {
        const env = envFor(roles);
        if (!env || !p.axis) return;
        target.preview(
            scrubKeepingRatio(
                target.kind,
                p.base,
                target.spots,
                scrubDistance(p.axis, dx, dy),
                pivotOf(p.base),
                env,
            ),
        );
    };
    const up = (keep: boolean) => {
        const p = press.current;
        press.current = null;
        stopTimer();
        if (!p) return;
        p.held.end();
        if (p.mode !== "press") target.end(keep);
        else if (keep && !disabled) scaleOnce(target, by, envFor);
    };

    return (
        <Tip
            label={label}
            shortcut={shortcut}
            hint={tolgee.t(
                "shapes.edit.scaleHint",
                "Click, hold to repeat, or drag",
            )}
        >
            <button
                type="button"
                aria-label={label}
                // As the editor's other buttons: aria-disabled, so the tooltip still says why
                aria-disabled={disabled || undefined}
                data-testid={testId}
                className={clsx(
                    "rounded-4 flex min-h-24 min-w-24 items-center justify-center p-4 select-none",
                    disabled
                        ? "cursor-default opacity-40"
                        : "hover:text-accent",
                )}
                style={{ touchAction: "none" }}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={() => up(true)}
                onPointerCancel={() => up(false)}
                onLostPointerCapture={() => up(true)}
                onClick={(e) => {
                    if (keyed.current) {
                        keyed.current = false;
                        return;
                    }
                    // Not a pointer (a script, a screen reader): one step
                    if (e.detail === 0 && !disabled)
                        scaleOnce(target, by, envFor);
                }}
                onKeyDown={(e) => {
                    // Enter places the shape and Space plays: here they press this
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        keyed.current = true;
                        if (!disabled && !e.repeat)
                            scaleOnce(target, by, envFor);
                    }
                }}
                onKeyUp={() => {
                    // After the click a key may send, so the next click counts again
                    setTimeout(() => (keyed.current = false));
                }}
            >
                {children}
            </button>
        </Tip>
    );
}
