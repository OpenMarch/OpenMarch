import {
    parseEffectArgs,
    sampleEffectFill,
    type AnyLightingEffectArgs,
} from "./effect.registry";
import type { LightingEffectLayerRect } from "./effectLayers";
import type { LightingEffectType } from "./types";
import { hex6ToLightingRgba, type LightingRgba } from "./utils";

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
    /** Wipe-only spatial mask rects in canvas coordinates. */
    effectLayers?: readonly LightingEffectLayerRect[];
};

export type ParsedLightingStep = {
    startMs: number;
    endMs: number;
    type: LightingEffectType;
    args: AnyLightingEffectArgs;
    marcherIds: ReadonlySet<number>;
    effectLayers: readonly LightingEffectLayerRect[];
};

export type LightingScenePlan = {
    steps: ParsedLightingStep[];
    /** End time of the last effect step (0 if no steps). */
    effectsEndMs: number;
};

function buildStep(
    startMs: number,
    durationMs: number,
    type: LightingEffectType,
    argsJson: string,
    marcherIds: readonly number[],
    effectLayers: readonly LightingEffectLayerRect[] = [],
): ParsedLightingStep {
    const safeDuration = Math.max(0, durationMs);
    return {
        startMs,
        endMs: startMs + safeDuration,
        type,
        args: parseEffectArgs(type, argsJson),
        marcherIds: new Set(marcherIds),
        effectLayers,
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
            buildStep(
                start,
                e.durationMs,
                e.type,
                e.argsJson,
                e.marcherIds,
                e.effectLayers ?? [],
            ),
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
 *
 * For wipe steps with effect layers, pass `marcherPosition` in canvas coordinates so only
 * marchers inside the active wipe region receive the fill.
 */
export function sampleMarcherLightingFill(
    plan: LightingScenePlan,
    tSceneMs: number,
    marcherId: number,
    _baseFill: LightingRgba,
    options?: {
        marcherPosition?: { x: number; y: number };
    },
): LightingRgba | undefined {
    if (plan.steps.length === 0) return undefined;

    const step = plan.steps.find(
        (s) =>
            tSceneMs >= s.startMs &&
            tSceneMs < s.endMs &&
            s.marcherIds.has(marcherId),
    );
    if (!step) return undefined;

    return sampleEffectFill(step.type, {
        args: step.args,
        timestampMs: tSceneMs,
        window: {
            startMs: step.startMs,
            durationMs: step.endMs - step.startMs,
        },
        marcherId,
        baseFill: _baseFill,
        layers: step.effectLayers,
        marcherPosition: options?.marcherPosition,
    });
}

export { hex6ToLightingRgba };
export type { LightingRgba };
