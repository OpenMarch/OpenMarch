import { z } from "zod";
import {
    defaultFadeEffectArgs,
    fadeEffectArgsSchema,
    parseFadeEffectArgs,
    sampleFadeEffectFill,
} from "./effect.fade";
import type { FadeEffectArgs } from "./effect.fade";
import {
    defaultFlickerEffectArgs,
    flickerEffectArgsSchema,
    parseFlickerEffectArgs,
    sampleFlickerEffectFill,
} from "./effect.flicker";
import type { FlickerEffectArgs } from "./effect.flicker";
import {
    defaultSolidEffectArgs,
    parseSolidEffectArgs,
    sampleSolidEffectFill,
    solidEffectArgsSchema,
} from "./effect.solid";
import type { SolidEffectArgs } from "./effect.solid";
import {
    defaultWipeEffectArgs,
    parseWipeEffectArgs,
    sampleWipeEffectFill,
    wipeEffectArgsSchema,
} from "./effect.wipe";
import type { WipeEffectArgs } from "./effect.wipe";
import type { LightingEffectType } from "./types";
import type { LightingRgba, LightingSampleContext } from "./utils";

export type LightingEffectArgsByType = {
    solid: SolidEffectArgs;
    wipe: WipeEffectArgs;
    flicker: FlickerEffectArgs;
    fade: FadeEffectArgs;
};

export type LightingEffectDefinition<T extends LightingEffectType> = {
    defaultArgs: LightingEffectArgsByType[T];
    schema: z.ZodType<LightingEffectArgsByType[T]>;
    parseArgs: (argsJson: string) => LightingEffectArgsByType[T];
    sampleFill: (
        context: LightingSampleContext<LightingEffectArgsByType[T]>,
    ) => LightingRgba | undefined;
};

export type AnyLightingEffectArgs =
    LightingEffectArgsByType[LightingEffectType];

export type AnyLightingSampleContext =
    LightingSampleContext<AnyLightingEffectArgs>;

export const effectRegistry: {
    [K in LightingEffectType]: LightingEffectDefinition<K>;
} = {
    solid: {
        defaultArgs: defaultSolidEffectArgs,
        schema: solidEffectArgsSchema,
        parseArgs: parseSolidEffectArgs,
        sampleFill: sampleSolidEffectFill,
    },
    wipe: {
        defaultArgs: defaultWipeEffectArgs,
        schema: wipeEffectArgsSchema,
        parseArgs: parseWipeEffectArgs,
        sampleFill: sampleWipeEffectFill,
    },
    flicker: {
        defaultArgs: defaultFlickerEffectArgs,
        schema: flickerEffectArgsSchema,
        parseArgs: parseFlickerEffectArgs,
        sampleFill: sampleFlickerEffectFill,
    },
    fade: {
        defaultArgs: defaultFadeEffectArgs,
        schema: fadeEffectArgsSchema,
        parseArgs: parseFadeEffectArgs,
        sampleFill: sampleFadeEffectFill,
    },
};

export const getEffectDefinition = <T extends LightingEffectType>(
    type: T,
): LightingEffectDefinition<T> => effectRegistry[type];

export const getDefaultArgsJson = (type: LightingEffectType): string =>
    JSON.stringify(getEffectDefinition(type).defaultArgs);

/** Extracts a representative color from an effect's parsed args, if any. */
export function getEffectColor(
    type: LightingEffectType,
    argsJson: string,
): string | undefined {
    const parsed = parseEffectArgs(type, argsJson);
    if (type === "fade") return (parsed as FadeEffectArgs).startColor;
    return (parsed as { color?: string }).color;
}

/** Returns a copy of `args` with `color` applied. */
export function withEffectColor<T extends LightingEffectType>(
    type: T,
    args: LightingEffectArgsByType[T],
    color: string,
): LightingEffectArgsByType[T] {
    if (type === "fade") {
        return {
            ...(args as FadeEffectArgs),
            startColor: color,
        } as LightingEffectArgsByType[T];
    }
    return { ...args, color } as LightingEffectArgsByType[T];
}

export const parseEffectArgs = <T extends LightingEffectType>(
    type: T,
    argsJson: string,
): LightingEffectArgsByType[T] => getEffectDefinition(type).parseArgs(argsJson);

export function sampleEffectFill(
    type: LightingEffectType,
    context: AnyLightingSampleContext,
): LightingRgba | undefined {
    const definition = getEffectDefinition(type) as LightingEffectDefinition<
        typeof type
    >;
    return definition.sampleFill(context);
}
