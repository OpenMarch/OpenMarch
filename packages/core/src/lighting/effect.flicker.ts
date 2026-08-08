import { z } from "zod";
import { ColorSchema, hex6ToLightingRgba } from "./utils";
import type { LightingRgba, LightingSampleContext } from "./utils";

export type FlickerEffectArgs = {
    /** Color to show when a marcher is "on". */
    color: string;
    /** Minimum time (ms) a marcher stays on before turning off. */
    onMinMs: number;
    /** Maximum time (ms) a marcher stays on before turning off. */
    onMaxMs: number;
    /** Minimum time (ms) a marcher stays off before turning on. */
    offMinMs: number;
    /** Maximum time (ms) a marcher stays off before turning on. */
    offMaxMs: number;
};

/** Minimum on/off dwell time in milliseconds. */
export const MIN_FLICKER_ON_OFF_MS = 16;

export const defaultFlickerEffectArgs: FlickerEffectArgs = {
    color: "#ffffff",
    onMinMs: 50,
    onMaxMs: 200,
    offMinMs: 50,
    offMaxMs: 200,
};

const flickerEffectArgsInputSchema = z
    .object({
        color: ColorSchema.optional(),
        onMinMs: z.number().optional(),
        onMaxMs: z.number().optional(),
        offMinMs: z.number().optional(),
        offMaxMs: z.number().optional(),
    })
    .strip();

type FlickerEffectArgsInput = z.infer<typeof flickerEffectArgsInputSchema>;

const clampFlickerMs = (value: number | undefined, fallback: number): number =>
    Math.max(MIN_FLICKER_ON_OFF_MS, Math.round(value ?? fallback));

export const normalizeFlickerEffectArgs = (
    input: FlickerEffectArgsInput,
): FlickerEffectArgs => {
    let onMinMs = clampFlickerMs(
        input.onMinMs,
        defaultFlickerEffectArgs.onMinMs,
    );
    let onMaxMs = clampFlickerMs(
        input.onMaxMs,
        defaultFlickerEffectArgs.onMaxMs,
    );
    let offMinMs = clampFlickerMs(
        input.offMinMs,
        defaultFlickerEffectArgs.offMinMs,
    );
    let offMaxMs = clampFlickerMs(
        input.offMaxMs,
        defaultFlickerEffectArgs.offMaxMs,
    );

    if (onMinMs > onMaxMs) [onMinMs, onMaxMs] = [onMaxMs, onMinMs];
    if (offMinMs > offMaxMs) [offMinMs, offMaxMs] = [offMaxMs, offMinMs];

    return {
        color: input.color ?? defaultFlickerEffectArgs.color,
        onMinMs,
        onMaxMs,
        offMinMs,
        offMaxMs,
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

/** A marcher's on/off toggle times for one effect window, starting "off" at boundaries[0]. */
type FlickerSchedule = {
    /** Sorted toggle timestamps. Even index = off interval, odd index = on interval. */
    boundaries: number[];
};

/** Random duration (ms) drawn from a plain (non-seeded) uniform distribution. */
function randomDwellMs(minMs: number, maxMs: number): number {
    if (maxMs <= minMs) return minMs;
    return minMs + Math.random() * (maxMs - minMs);
}

function buildFlickerSchedule(
    window: { startMs: number; durationMs: number },
    args: FlickerEffectArgs,
): FlickerSchedule {
    const endMs = window.startMs + Math.max(0, window.durationMs);
    const boundaries: number[] = [window.startMs];
    let cursor = window.startMs;
    let isOn = false; // all marchers start off
    while (cursor < endMs) {
        cursor += isOn
            ? randomDwellMs(args.onMinMs, args.onMaxMs)
            : randomDwellMs(args.offMinMs, args.offMaxMs);
        boundaries.push(cursor);
        isOn = !isOn;
    }
    return { boundaries };
}

/**
 * Per-(marcher, effect window, args) schedule cache. A schedule is generated once with
 * plain `Math.random()` and reused for every subsequent sample so playback/scrubbing see
 * a coherent flicker pattern instead of re-rolling on every animation frame. A new args
 * value or window placement produces a new cache key, i.e. a freshly randomized schedule.
 */
const flickerScheduleCache = new Map<string, FlickerSchedule>();

function flickerScheduleCacheKey(
    marcherId: number,
    window: { startMs: number; durationMs: number },
    args: FlickerEffectArgs,
): string {
    return `${marcherId}:${window.startMs}:${window.durationMs}:${args.onMinMs}:${args.onMaxMs}:${args.offMinMs}:${args.offMaxMs}`;
}

function getFlickerSchedule(
    marcherId: number,
    window: { startMs: number; durationMs: number },
    args: FlickerEffectArgs,
): FlickerSchedule {
    const key = flickerScheduleCacheKey(marcherId, window, args);
    let schedule = flickerScheduleCache.get(key);
    if (!schedule) {
        schedule = buildFlickerSchedule(window, args);
        flickerScheduleCache.set(key, schedule);
    }
    return schedule;
}

/** Index of the last boundary <= timestampMs, via binary search over sorted boundaries. */
function findBoundaryIndex(boundaries: number[], timestampMs: number): number {
    let low = 0;
    let high = boundaries.length - 1;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (boundaries[mid]! <= timestampMs) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    return low;
}

/**
 * Whether a given marcher is "on" at a given timestamp. Marchers start off at
 * `window.startMs` and toggle on/off at random intervals drawn from `args`; each
 * marcher's schedule is independent, so flicker is never synchronized across marchers.
 */
export function isMarcherFlickerOn(
    marcherId: number,
    window: { startMs: number; durationMs: number },
    timestampMs: number,
    args: FlickerEffectArgs,
): boolean {
    if (timestampMs < window.startMs) return false;
    const schedule = getFlickerSchedule(marcherId, window, args);
    const index = findBoundaryIndex(schedule.boundaries, timestampMs);
    return index % 2 === 1;
}

export function sampleFlickerEffectFill({
    args,
    timestampMs,
    window,
    marcherId,
}: LightingSampleContext<FlickerEffectArgs>): LightingRgba | undefined {
    if (!isMarcherFlickerOn(marcherId, window, timestampMs, args)) {
        return undefined;
    }
    return hex6ToLightingRgba(args.color);
}
