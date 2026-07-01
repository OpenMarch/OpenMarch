import { z } from "zod";
import { ColorSchema } from "./utils";

export type WipeEffectArgs = {
    color: string;
    cycleDurationMs: number;
    cycleFrequencyMs: number;
    directionDegrees: number;
};

/** Minimum wipe cycle duration in milliseconds. */
export const MIN_WIPE_CYCLE_DURATION_MS = 1;

/** Minimum wipe cycle duration in seconds. */
export const MIN_WIPE_CYCLE_DURATION_S = MIN_WIPE_CYCLE_DURATION_MS / 1000;

/** Minimum wipe cycle frequency in milliseconds. */
export const MIN_WIPE_CYCLE_FREQUENCY_MS = 1;

/** Minimum wipe cycle frequency in seconds. */
export const MIN_WIPE_CYCLE_FREQUENCY_S = MIN_WIPE_CYCLE_FREQUENCY_MS / 1000;

export const defaultWipeEffectArgs: WipeEffectArgs = {
    color: "#000000",
    cycleDurationMs: 2000,
    cycleFrequencyMs: 1000,
    directionDegrees: 0,
};

export const normalizeWipeDirectionDegrees = (value: number): number =>
    ((Math.round(value) % 360) + 360) % 360;

const wipeEffectArgsInputSchema = z
    .object({
        color: ColorSchema.optional(),
        cycleDurationMs: z.number().nonnegative().optional(),
        cycleFrequencyMs: z.number().nonnegative().optional(),
        directionDegrees: z.number().optional(),
    })
    .strip();

type WipeEffectArgsInput = z.infer<typeof wipeEffectArgsInputSchema>;

export const normalizeWipeEffectArgs = (
    input: WipeEffectArgsInput,
): WipeEffectArgs => {
    const cycleDurationMs = Math.max(
        MIN_WIPE_CYCLE_DURATION_MS,
        input.cycleDurationMs ?? defaultWipeEffectArgs.cycleDurationMs,
    );
    const cycleFrequencyMs = Math.max(
        MIN_WIPE_CYCLE_FREQUENCY_MS,
        input.cycleFrequencyMs ?? defaultWipeEffectArgs.cycleFrequencyMs,
    );

    return {
        color: input.color ?? defaultWipeEffectArgs.color,
        cycleDurationMs,
        cycleFrequencyMs,
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
