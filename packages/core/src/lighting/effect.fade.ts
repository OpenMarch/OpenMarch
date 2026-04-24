import { z } from "zod";

export type FadeEffectArgs = {
    durationMs: number;
    color: string;
};

export const defaultFadeEffectArgs: FadeEffectArgs = {
    durationMs: 2000,
    color: "#000000",
};

export const fadeEffectArgsSchema = z.object({
    durationMs: z.int().nonnegative(),
    color: z.string().regex(/^#([0-9a-fA-F]{6})$/),
});

export const parseFadeEffectArgs = (argsJson: string): FadeEffectArgs => {
    try {
        const parsed = JSON.parse(argsJson) as unknown;
        return fadeEffectArgsSchema.parse(parsed);
    } catch {
        return defaultFadeEffectArgs;
    }
};
