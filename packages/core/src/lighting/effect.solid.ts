import { z } from "zod";

export type SolidEffectArgs = {
    durationMs: number;
    color: string;
};

export const defaultSolidEffectArgs: SolidEffectArgs = {
    durationMs: 2000,
    color: "#000000",
};

export const solidEffectArgsSchema = z.object({
    durationMs: z.int().nonnegative(),
    color: z.string().regex(/^#([0-9a-fA-F]{6})$/),
});

export const parseSolidEffectArgs = (argsJson: string): SolidEffectArgs => {
    try {
        const parsed = JSON.parse(argsJson) as unknown;
        return solidEffectArgsSchema.parse(parsed);
    } catch {
        return defaultSolidEffectArgs;
    }
};
