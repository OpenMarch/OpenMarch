import { z } from "zod";
import { ColorSchema, hex6ToLightingRgba } from "./utils";
import type { LightingRgba, LightingSampleContext } from "./utils";

export type FadeEffectArgs = {
    /** MIlliseconds it takes to change from one color to another */
    changeDurationMs: number;
    colors: string[];
};

export const MIN_FADE_COLORS = 2;

/** Minimum fade change duration in milliseconds. */
export const MIN_FADE_CHANGE_DURATION_MS = 1;

/** Minimum fade change duration in seconds. */
export const MIN_FADE_CHANGE_DURATION_S = MIN_FADE_CHANGE_DURATION_MS / 1000;

export const defaultFadeEffectArgs: FadeEffectArgs = {
    changeDurationMs: 2000,
    colors: ["#000000", "#ff0000"],
};

const fadeEffectArgsInputSchema = z
    .object({
        changeDurationMs: z.number().nonnegative().optional(),
        durationMs: z.number().nonnegative().optional(),
        color: ColorSchema.optional(),
        colors: z.array(ColorSchema).min(1).optional(),
    })
    .strip();

type FadeEffectArgsInput = z.infer<typeof fadeEffectArgsInputSchema>;

const ensureMinFadeColors = (colors: string[]): string[] => {
    if (colors.length >= MIN_FADE_COLORS) return colors;
    const padded = [...colors];
    while (padded.length < MIN_FADE_COLORS) {
        padded.push(
            padded.at(-1) ?? defaultFadeEffectArgs.colors[0] ?? "#000000",
        );
    }
    return padded;
};

export const normalizeFadeEffectArgs = (
    input: FadeEffectArgsInput,
): FadeEffectArgs => {
    const changeDurationMs = Math.max(
        MIN_FADE_CHANGE_DURATION_MS,
        input.changeDurationMs ??
            input.durationMs ??
            defaultFadeEffectArgs.changeDurationMs,
    );

    let colors: string[];
    if (input.colors && input.colors.length > 0) {
        colors = ensureMinFadeColors(input.colors);
    } else if (input.color) {
        colors = ensureMinFadeColors([input.color]);
    } else {
        colors = defaultFadeEffectArgs.colors;
    }

    return { changeDurationMs, colors };
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

export function sampleFadeEffectFill({
    args,
}: LightingSampleContext<FadeEffectArgs>): LightingRgba {
    return hex6ToLightingRgba(args.colors.at(-1)!);
}
