import { z } from "zod";
import { ColorSchema } from "./utils";

export type WipeEffectArgs = {
    color: string;
    directionDegrees: number;
};

export const defaultWipeEffectArgs: WipeEffectArgs = {
    color: "#000000",
    directionDegrees: 0,
};

export const normalizeWipeDirectionDegrees = (value: number): number =>
    ((Math.round(value) % 360) + 360) % 360;

const wipeEffectArgsInputSchema = z
    .object({
        color: ColorSchema.optional(),
        directionDegrees: z.number().optional(),
    })
    .strip();

type WipeEffectArgsInput = z.infer<typeof wipeEffectArgsInputSchema>;

export const normalizeWipeEffectArgs = (
    input: WipeEffectArgsInput,
): WipeEffectArgs => {
    return {
        color: input.color ?? defaultWipeEffectArgs.color,
        directionDegrees: normalizeWipeDirectionDegrees(
            input.directionDegrees ?? defaultWipeEffectArgs.directionDegrees,
        ),
    };
};

export const wipeEffectArgsSchema: z.ZodType<WipeEffectArgs> =
    wipeEffectArgsInputSchema.transform(normalizeWipeEffectArgs);

export const parseWipeEffectArgs = (argsJson: string): WipeEffectArgs => {
    try {
        const parsed = JSON.parse(argsJson) as unknown;
        return wipeEffectArgsSchema.parse(parsed);
    } catch {
        return defaultWipeEffectArgs;
    }
};
