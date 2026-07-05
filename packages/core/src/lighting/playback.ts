import type { FadeEffectArgs } from "./effect.fade";
import { parseEffectArgs } from "./effect.registry";
import type { LightingEffectLayerRect } from "./effectLayers";
import { parseWipeEffectArgs } from "./effect.wipe";
import { getWipeActiveMarcherIds } from "./effect.wipe";
import { getLightingEffectProgress } from "./timing";
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
    /** Wipe-only spatial mask rects in canvas coordinates. */
    effectLayers?: readonly LightingEffectLayerRect[];
};

export type ParsedLightingStep = {
    startMs: number;
    endMs: number;
    type: LightingEffectType;
    solidArgs: SolidEffectArgs;
    marcherIds: ReadonlySet<number>;
    effectLayers: readonly LightingEffectLayerRect[];
    wipeDirectionDegrees?: number;
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
    effectLayers: readonly LightingEffectLayerRect[] = [],
): ParsedLightingStep {
    const safeDuration = Math.max(0, durationMs);
    const parsedArgs = parseEffectArgs(type, argsJson);
    const solidArgs: SolidEffectArgs =
        type === "fade"
            ? {
                  color: (parsedArgs as FadeEffectArgs).colors.at(-1)!,
              }
            : (parsedArgs as SolidEffectArgs);
    const wipeDirectionDegrees =
        type === "wipe"
            ? parseWipeEffectArgs(argsJson).directionDegrees
            : undefined;
    return {
        startMs,
        endMs: startMs + safeDuration,
        type,
        solidArgs,
        marcherIds: new Set(marcherIds),
        effectLayers,
        wipeDirectionDegrees,
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

    if (
        step.type === "wipe" &&
        step.effectLayers.length > 0 &&
        options?.marcherPosition != null &&
        step.wipeDirectionDegrees != null
    ) {
        const progress = getLightingEffectProgress(tSceneMs, {
            startMs: step.startMs,
            durationMs: step.endMs - step.startMs,
        });
        const activeMarcherIds = getWipeActiveMarcherIds(
            step.effectLayers,
            progress,
            step.wipeDirectionDegrees,
            [{ marcherId, ...options.marcherPosition }],
        );
        if (!activeMarcherIds.has(marcherId)) return undefined;
    }

    return hex6ToLightingRgba(step.solidArgs.color);
}
