import { parseEffectArgs } from "./effect.registry";
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
    /** Step length in ms. */
    durationMs: number;
    marcherIds: readonly number[];
    /**
     * Scene-local start when set; when omitted, steps chain after the previous step
     * (legacy sequential timeline).
     */
    startMs?: number;
};

export type ParsedLightingStep = {
    startMs: number;
    endMs: number;
    type: LightingEffectType;
    solidArgs: SolidEffectArgs;
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

function buildStep(
    startMs: number,
    durationMs: number,
    type: LightingEffectType,
    argsJson: string,
    marcherIds: readonly number[],
): ParsedLightingStep {
    const safeDuration = Math.max(0, durationMs);
    const solidArgs = parseEffectArgs(type, argsJson) as SolidEffectArgs;
    return {
        startMs,
        endMs: startMs + safeDuration,
        type,
        solidArgs,
        marcherIds: new Set(marcherIds),
    };
}

/**
 * Builds a lighting plan. Callers may set `startMs` on each step for absolute placement;
 * otherwise steps are placed back-to-back in input order.
 */
export function buildLightingScenePlan(
    effects: readonly LightingPlaybackEffectInput[],
): LightingScenePlan {
    let cursor = 0;
    const steps: ParsedLightingStep[] = [];
    for (const e of effects) {
        const start = e.startMs !== undefined ? e.startMs : cursor;
        steps.push(
            buildStep(start, e.durationMs, e.type, e.argsJson, e.marcherIds),
        );
        cursor = Math.max(cursor, start + Math.max(0, e.durationMs));
    }
    const effectsEndMs =
        steps.length === 0 ? 0 : Math.max(...steps.map((s) => s.endMs));
    return { steps, effectsEndMs };
}

/**
 * Returns a lighting fill override for a marcher at scene-local time, or `undefined` if the
 * marcher should use the normal appearance cascade (no active effect for this marcher at `tSceneMs`).
 */
export function sampleMarcherLightingFill(
    plan: LightingScenePlan,
    tSceneMs: number,
    marcherId: number,
    _baseFill: LightingRgba,
): LightingRgba | undefined {
    if (plan.steps.length === 0) return undefined;

    const step = plan.steps.find(
        (s) => tSceneMs >= s.startMs && tSceneMs < s.endMs,
    );
    if (!step || !step.marcherIds.has(marcherId)) return undefined;

    return hex6ToLightingRgba(step.solidArgs.color);
}
