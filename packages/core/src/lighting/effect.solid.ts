import { z } from "zod";

export type SolidEffectArgs = {
    color: string;
};

export const defaultSolidEffectArgs: SolidEffectArgs = {
    color: "#000000",
};

export const solidEffectArgsSchema = z
    .object({
        color: z.string().regex(/^#([0-9a-fA-F]{6})$/),
    })
    .strip();

export const parseSolidEffectArgs = (argsJson: string): SolidEffectArgs => {
    try {
        const parsed = JSON.parse(argsJson) as unknown;
        return solidEffectArgsSchema.parse(parsed);
    } catch {
        return defaultSolidEffectArgs;
    }
};
