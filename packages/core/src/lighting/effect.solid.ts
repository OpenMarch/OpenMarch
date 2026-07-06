import { z } from "zod";
import { hex6ToLightingRgba } from "./utils";
import type { LightingRgba, LightingSampleContext } from "./utils";

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

export function sampleSolidEffectFill({
    args,
}: LightingSampleContext<SolidEffectArgs>): LightingRgba {
    return hex6ToLightingRgba(args.color);
}
