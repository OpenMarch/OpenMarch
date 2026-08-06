import { z } from "zod";
import { ColorSchema, hex6ToLightingRgba } from "./utils";
import type { LightingRgba, LightingSampleContext } from "./utils";

export type FlickerEffectArgs = {
    /** Color to show when a marcher is "on". */
    color: string;
    /** How often (ms) each marcher's on/off state can change. */
    intervalMs: number;
    /** Chance (0-1) a marcher is "on" during any given interval. */
    onProbability: number;
};

/** Minimum flicker interval in milliseconds. */
export const MIN_FLICKER_INTERVAL_MS = 16;

export const defaultFlickerEffectArgs: FlickerEffectArgs = {
    color: "#ffffff",
    intervalMs: 100,
    onProbability: 0.5,
};

const flickerEffectArgsInputSchema = z
    .object({
        color: ColorSchema.optional(),
        intervalMs: z.number().optional(),
        onProbability: z.number().optional(),
    })
    .strip();

type FlickerEffectArgsInput = z.infer<typeof flickerEffectArgsInputSchema>;

export const normalizeFlickerEffectArgs = (
    input: FlickerEffectArgsInput,
): FlickerEffectArgs => {
    return {
        color: input.color ?? defaultFlickerEffectArgs.color,
        intervalMs: Math.max(
            MIN_FLICKER_INTERVAL_MS,
            Math.round(input.intervalMs ?? defaultFlickerEffectArgs.intervalMs),
        ),
        onProbability: Math.min(
            1,
            Math.max(
                0,
                input.onProbability ?? defaultFlickerEffectArgs.onProbability,
            ),
        ),
    };
};

export const flickerEffectArgsSchema: z.ZodType<FlickerEffectArgs> =
    flickerEffectArgsInputSchema.transform(normalizeFlickerEffectArgs);

export const parseFlickerEffectArgs = (argsJson: string): FlickerEffectArgs => {
    try {
        const parsed = JSON.parse(argsJson) as unknown;
        return flickerEffectArgsSchema.parse(parsed);
    } catch {
        return defaultFlickerEffectArgs;
    }
};

/** Deterministic 32-bit hash → [0, 1). Same seed always yields the same value. */
function flickerHash(seed: number): number {
    let h = seed >>> 0;
    h = Math.imul(h ^ (h >>> 15), h | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
}

/**
 * Whether a given marcher is "on" during a given flicker tick. Pure function of
 * (marcherId, tickIndex) so playback/export is reproducible — marcherId is folded
 * into the hash seed so each marcher's on/off sequence is independent of every
 * other marcher's, i.e. flicker is never synchronized across marchers.
 */
export function isMarcherFlickerOn(
    marcherId: number,
    tickIndex: number,
    onProbability: number,
): boolean {
    const seed =
        (Math.imul(marcherId + 1, 0x9e3779b1) ^
            Math.imul(tickIndex + 1, 0x85ebca6b)) >>>
        0;
    return flickerHash(seed) < onProbability;
}

export function sampleFlickerEffectFill({
    args,
    timestampMs,
    window,
    marcherId,
}: LightingSampleContext<FlickerEffectArgs>): LightingRgba | undefined {
    const elapsedMs = Math.max(0, timestampMs - window.startMs);
    const tickIndex = Math.floor(elapsedMs / Math.max(1, args.intervalMs));
    if (!isMarcherFlickerOn(marcherId, tickIndex, args.onProbability)) {
        return undefined;
    }
    return hex6ToLightingRgba(args.color);
}
