import { parseEffectArgs } from "./effect.registry";
import type { FadeEffectArgs } from "./effect.fade";
import type { SolidEffectArgs } from "./effect.solid";
import type { LightingEffectType } from "./types";

/** RGBA in 0–255 / 0–1 range (matches theme marcher colors in app). */
export type LightingRgba = {
    r: number;
    g: number;
    b: number;
    a: number;
};

export type LightingPlaybackEffectInput = {
    type: LightingEffectType;
    argsJson: string;
    /** Step length in ms (canonical: DB `duration_seconds` × 1000). */
    durationMs: number;
    marcherIds: readonly number[];
};

export type ParsedLightingStep = {
    startMs: number;
    endMs: number;
    type: LightingEffectType;
    solidArgs: SolidEffectArgs | null;
    fadeArgs: FadeEffectArgs | null;
    marcherIds: ReadonlySet<number>;
};

export type LightingScenePlan = {
    steps: ParsedLightingStep[];
    /** End time of the last effect step (0 if no steps). */
    effectsEndMs: number;
};

const HEX6 = /^#?([0-9a-fA-F]{6})$/;

export function hex6ToLightingRgba(hex: string): LightingRgba {
    const m = HEX6.exec(hex.trim());
    const hexBody = m?.[1];
    if (!hexBody) return { r: 0, g: 0, b: 0, a: 1 };
    const n = parseInt(hexBody, 16);
    return {
        r: (n >> 16) & 255,
        g: (n >> 8) & 255,
        b: n & 255,
        a: 1,
    };
}

export function lerpLightingRgba(
    a: LightingRgba,
    b: LightingRgba,
    t: number,
): LightingRgba {
    const u = Math.min(1, Math.max(0, t));
    return {
        r: a.r + (b.r - a.r) * u,
        g: a.g + (b.g - a.g) * u,
        b: a.b + (b.b - a.b) * u,
        a: a.a + (b.a - a.a) * u,
    };
}

function buildStep(
    startMs: number,
    durationMs: number,
    type: LightingEffectType,
    argsJson: string,
    marcherIds: readonly number[],
): ParsedLightingStep {
    const safeDuration = Math.max(0, durationMs);
    const solidArgs =
        type === "solid" || type === "strobe"
            ? parseEffectArgs(type, argsJson)
            : null;
    const fadeArgs = type === "fade" ? parseEffectArgs("fade", argsJson) : null;
    return {
        startMs,
        endMs: startMs + safeDuration,
        type,
        solidArgs,
        fadeArgs,
        marcherIds: new Set(marcherIds),
    };
}

/**
 * Builds a sequential lighting plan from effects ordered by `sequence_index` (caller must sort).
 * Parsed args are stored so callers do not JSON.parse in the animation loop.
 */
export function buildLightingScenePlan(
    effects: readonly LightingPlaybackEffectInput[],
): LightingScenePlan {
    let cursor = 0;
    const steps: ParsedLightingStep[] = [];
    for (const e of effects) {
        steps.push(
            buildStep(cursor, e.durationMs, e.type, e.argsJson, e.marcherIds),
        );
        cursor += Math.max(0, e.durationMs);
    }
    const effectsEndMs =
        steps.length === 0 ? 0 : steps[steps.length - 1]!.endMs;
    return { steps, effectsEndMs };
}

function resolveColorAtStepStart(
    plan: LightingScenePlan,
    stepIndex: number,
    marcherId: number,
    baseFill: LightingRgba,
): LightingRgba {
    if (stepIndex <= 0) return baseFill;
    const prev = plan.steps[stepIndex - 1]!;
    if (!prev.marcherIds.has(marcherId)) return baseFill;
    if (prev.type === "fade" && prev.fadeArgs) {
        return hex6ToLightingRgba(prev.fadeArgs.color);
    }
    if ((prev.type === "solid" || prev.type === "strobe") && prev.solidArgs) {
        return hex6ToLightingRgba(prev.solidArgs.color);
    }
    return baseFill;
}

/**
 * Returns a lighting fill override for a marcher at scene-local time, or `undefined` if the
 * marcher should use the normal appearance cascade (no active effect for this marcher at `tSceneMs`).
 */
export function sampleMarcherLightingFill(
    plan: LightingScenePlan,
    tSceneMs: number,
    marcherId: number,
    baseFill: LightingRgba,
): LightingRgba | undefined {
    if (plan.steps.length === 0) return undefined;

    const step = plan.steps.find(
        (s) => tSceneMs >= s.startMs && tSceneMs < s.endMs,
    );
    if (!step || !step.marcherIds.has(marcherId)) return undefined;

    const tLocal =
        step.endMs > step.startMs
            ? (tSceneMs - step.startMs) / (step.endMs - step.startMs)
            : 1;

    if (step.type === "solid" || step.type === "strobe") {
        if (!step.solidArgs) return undefined;
        return hex6ToLightingRgba(step.solidArgs.color);
    }

    if (step.type === "fade") {
        if (!step.fadeArgs) return undefined;
        const fromColor = resolveColorAtStepStart(
            plan,
            plan.steps.indexOf(step),
            marcherId,
            baseFill,
        );
        const toColor = hex6ToLightingRgba(step.fadeArgs.color);
        return lerpLightingRgba(fromColor, toColor, tLocal);
    }

    return undefined;
}
