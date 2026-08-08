import { z } from "zod";
import { getLightingEffectProgress } from "./timing";
import { ColorSchema, hex6ToLightingRgba } from "./utils";
import type { LightingRgba, LightingSampleContext } from "./utils";

export type FadeEffectArgs = {
    /** Color shown at the start of the effect. */
    startColor: string;
    /** Color shown at the end of the effect. */
    endColor: string;
};

export const defaultFadeEffectArgs: FadeEffectArgs = {
    startColor: "#000000",
    endColor: "#ffffff",
};

const fadeEffectArgsInputSchema = z
    .object({
        startColor: ColorSchema.optional(),
        endColor: ColorSchema.optional(),
    })
    .strip();

type FadeEffectArgsInput = z.infer<typeof fadeEffectArgsInputSchema>;

export const normalizeFadeEffectArgs = (
    input: FadeEffectArgsInput,
): FadeEffectArgs => {
    return {
        startColor: input.startColor ?? defaultFadeEffectArgs.startColor,
        endColor: input.endColor ?? defaultFadeEffectArgs.endColor,
    };
};

export const fadeEffectArgsSchema: z.ZodType<FadeEffectArgs> =
    fadeEffectArgsInputSchema.transform(normalizeFadeEffectArgs);

export const parseFadeEffectArgs = (argsJson: string): FadeEffectArgs => {
    try {
        const parsed = JSON.parse(argsJson) as unknown;
        return fadeEffectArgsSchema.parse(parsed);
    } catch {
        return defaultFadeEffectArgs;
    }
};

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

function lerpChannel(start: number, end: number, progress: number): number {
    return Math.round(start + (end - start) * progress);
}

/** Linearly interpolates between two RGBA colors; alpha is always 1. */
export function lerpLightingRgba(
    start: LightingRgba,
    end: LightingRgba,
    progress: number,
): LightingRgba {
    const clampedProgress = clamp01(progress);
    return {
        r: lerpChannel(start.r, end.r, clampedProgress),
        g: lerpChannel(start.g, end.g, clampedProgress),
        b: lerpChannel(start.b, end.b, clampedProgress),
        a: 1,
    };
}

/**
 * Fades linearly from `startColor` to `endColor` across the effect's entire
 * window (window.startMs -> window.startMs + window.durationMs). Fade has no
 * manual duration of its own — it always spans the full lifetime of the
 * effect instance on the timeline.
 */
export function sampleFadeEffectFill({
    args,
    timestampMs,
    window,
}: LightingSampleContext<FadeEffectArgs>): LightingRgba {
    const progress = getLightingEffectProgress(timestampMs, window);
    return lerpLightingRgba(
        hex6ToLightingRgba(args.startColor),
        hex6ToLightingRgba(args.endColor),
        progress,
    );
}
