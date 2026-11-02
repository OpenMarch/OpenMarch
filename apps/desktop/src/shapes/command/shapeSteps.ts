import tolgee from "@/global/singletons/Tolgee";
import {
    LAYOUT_FAMILIES,
    LAYOUT_LABELS,
    MODE_LABELS,
} from "../distribute/distribution";
import {
    layoutOrientations,
    layoutVersionName,
    parseLayout,
    shapeKey,
    shownFamily,
} from "../distribute/layouts";
import {
    distributionOf,
    layoutOf,
    parseMode,
    switchModes,
    withLayout,
    withMode,
} from "../distribute/modes";
import { formatSteps } from "../editor/format";
import { formatList } from "@/utilities/formatList";
import type { AnyToolKind, ToolEnv, ToolParam } from "../tool/toolKind";
import type { XY } from "../types";

/**
 * The command bar's steps for a shape kind (#344, #354): Shape › Box asks each of the kind's
 * declared parameters in turn, so a new kind gets its steps without code here. Everything is
 * pure; `shapeCommand.ts` opens the shape and shows it on the field.
 */

/** One question the bar asks, as the shape stands after the answers before it */
export interface ShapeStep {
    readonly param: ToolParam<unknown>;
    /** The answer typed when the step opens: the shape's number now ("4 × 3", "2") */
    readonly initial: string;
    /** The step's answer isn't understood, so the shape ignores it */
    readonly invalid: boolean;
}

/** A parameter's value in its unit, typed the way the chip shows it: 2.5 steps is "2½" */
export function typedValue(param: ToolParam<unknown>, value: number): string {
    return param.unit === "steps" ? formatSteps(value) : String(value);
}

/**
 * `params` with `param` set to `value`, in its unit: by number where the parameter takes one, so
 * it comes back exact (#423), else typed as the chip shows it. Null where it can't take it.
 */
export function withValue(
    param: ToolParam<unknown>,
    params: unknown,
    n: number,
    value: number,
    env: ToolEnv,
): unknown {
    return param.set
        ? param.set(params, n, value, env)
        : param.type(params, n, typedValue(param, value), env);
}

/**
 * The shape after `answers`, one per step in order, and every step it asks. A step hides while
 * its parameter does (a spacing with only one marcher that way), so an answer can change the
 * steps after it. An empty answer keeps the number as it is; one that isn't understood is
 * marked invalid and changes nothing.
 */
export function shapeSteps(
    kind: AnyToolKind,
    base: unknown,
    n: number,
    env: ToolEnv,
    answers: readonly string[],
): { params: unknown; steps: ShapeStep[] } {
    let params = base;
    const steps: ShapeStep[] = [];
    const mode = modeStep(kind);
    const layout = layoutStep(kind);
    for (const param of [
        ...(mode ? [mode] : []),
        ...(kind.params as readonly ToolParam<unknown>[]),
        // Last, so one-liners such as "box 4x3 2" still fill the size and spacing
        ...(layout ? [layout] : []),
    ]) {
        if (param.shown && !param.shown(params, n)) continue;
        const initial = param.display(params, n, env.stepPx);
        const answer = answers[steps.length];
        let invalid = false;
        // The number as shown keeps it as it is: 1⅛ shows as 1.13, which would round it
        if (
            answer !== undefined &&
            answer.trim() !== "" &&
            answer.trim() !== initial
        ) {
            const next = param.type(params, n, answer, env);
            if (next === null) invalid = true;
            else params = next;
        }
        steps.push({ param, initial, invalid });
    }
    return { params, steps };
}

/**
 * A one-liner's answers on the kind's steps: one that doesn't name a mode leaves the mode step as
 * it is, so "box 4x2 3" still sizes the box and "box outline 4x2" fills it in Outline
 */
export function fillAhead(
    kind: AnyToolKind,
    answers: readonly string[],
): readonly string[] {
    const modes = switchModes(kind);
    if (modes.length === 0 || answers.length === 0) return answers;
    return parseMode(answers[0]!, modes) === null ? ["", ...answers] : answers;
}

/**
 * The host's first step for a closed kind with more than one mode (spec #385): how it is filled,
 * typed by name ("Outline", or "out"). None for a kind with one mode, or an open kind.
 */
export function modeStep(kind: AnyToolKind): ToolParam<unknown> | null {
    const modes = switchModes(kind);
    if (modes.length === 0) return null;
    return {
        key: "mode",
        label: tolgee.t("shapes.command.fill", "Fill: {modes}", {
            modes: formatList(modes.map((m) => MODE_LABELS[m])),
        }),
        unit: "choice",
        primary: false,
        drag: "x",
        interval: false,
        blends: false,
        display(params, n) {
            const d = distributionOf(kind, params, n);
            return d ? MODE_LABELS[d.mode] : "";
        },
        type(params, n, text, env) {
            const mode = parseMode(text, modes);
            return mode === null ? null : withMode(kind, params, n, mode, env);
        },
        scrub: (base) => base,
    };
}

/**
 * The host's layout step for a kind with layouts (#387, the box), only while the shape is in
 * Files: the layout and its block, typed by name ("stagger 5x5", "full", "8x3"); a layout alone
 * takes the version nearest the shape's proportions. It comes after the mode step and the kind's
 * own numbers, so one-liners written before it ("box 4x3 2") mean what they did. Shows as the
 * picker labels it ("Stagger 5 × 5"). None for a kind without layouts.
 */
export function layoutStep(kind: AnyToolKind): ToolParam<unknown> | null {
    if (!kind.closed?.layouts) return null;
    const display = (params: unknown, n: number): string => {
        const now = layoutOf(kind, params, n);
        if (!now) return "";
        // As the picker lists it: a Short back with no short rank is a Full block
        const key = shapeKey(now.lines, now.layout.byFile);
        for (const row of kind.closed!.layouts!.catalogue(n))
            for (const v of layoutOrientations(n, row.family))
                if (shapeKey(v.lines, v.layout.byFile) === key)
                    return layoutVersionName(row.label, v.label);
        // Outside the catalogue (past 3:1, say): its block, a full one called Full
        return tolgee.t(
            "shapes.distribute.blockName",
            "{layout} {across} × {deep}",
            {
                layout: LAYOUT_LABELS[shownFamily(now)],
                across: now.across,
                deep: now.deep,
            },
        );
    };
    return {
        key: "layout",
        label: tolgee.t("shapes.command.layout", "Layout: {layouts}", {
            layouts: formatList(LAYOUT_FAMILIES.map((f) => LAYOUT_LABELS[f])),
        }),
        unit: "choice",
        primary: false,
        drag: "x",
        interval: false,
        blends: false,
        shown: (params, n) => layoutOf(kind, params, n) !== null,
        display,
        type(params, n, text, env) {
            const now = layoutOf(kind, params, n);
            if (!now) return null;
            // The step's own answer keeps the layout (a turned version reads like its plain one)
            if (text.trim() === display(params, n)) return params;
            const version = parseLayout(
                text,
                n,
                now.layout.family,
                now.across / now.deep,
            );
            return version
                ? withLayout(kind, params, n, version.layout, env)
                : null;
        },
        scrub: (base) => base,
    };
}

/**
 * The shape the bar starts from when no shape of this kind is open: the kind filling a
 * rectangle around where the marchers start, about one default interval apart, then set to
 * each parameter's declared default. Kind-agnostic, so a new kind needs nothing extra.
 */
export function startingParams(
    kind: AnyToolKind,
    starts: readonly XY[],
    n: number,
    env: ToolEnv,
): unknown {
    const center = env.gridSnap(middleOf(starts));
    const interval =
        (kind.params.find((p) => p.interval && p.default !== undefined)
            ?.default ?? 2) * env.stepPx;
    // About square, a little wider than deep, as forms usually are
    const across = Math.ceil(Math.sqrt(Math.max(1, n)));
    const deep = Math.ceil(Math.max(1, n) / across);
    const halfWidth = Math.max(env.stepPx, ((across - 1) * interval) / 2);
    const halfDepth = Math.max(env.stepPx, ((deep - 1) * interval) / 2);
    // Filling a frame, not drawing: kinds draw differently (a box corner to corner, a circle
    // from its center out), but every kind fills a frame the same way
    let params: unknown = kind.fromFrame(
        {
            center,
            halfWidth,
            halfDepth,
            rotation: 0,
            flipX: false,
            flipY: false,
        },
        n,
        env,
    );
    for (const param of kind.params as readonly ToolParam<unknown>[]) {
        if (param.default === undefined) continue;
        if (param.shown && !param.shown(params, n)) continue;
        params = withValue(param, params, n, param.default, env) ?? params;
    }
    return params;
}

function middleOf(points: readonly XY[]): XY {
    if (points.length === 0) return { x: 0, y: 0 };
    const sum = points.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), {
        x: 0,
        y: 0,
    });
    return { x: sum.x / points.length, y: sum.y / points.length };
}
