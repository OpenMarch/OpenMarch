import { z } from "zod";
import {
    defaultFadeEffectArgs,
    fadeEffectArgsSchema,
    parseFadeEffectArgs,
    sampleFadeEffectFill,
} from "./effect.fade";
import type { FadeEffectArgs } from "./effect.fade";
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
    fade: FadeEffectArgs;
    strobe: SolidEffectArgs;
    wipe: WipeEffectArgs;
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
    fade: {
        defaultArgs: defaultFadeEffectArgs,
        schema: fadeEffectArgsSchema,
        parseArgs: parseFadeEffectArgs,
        sampleFill: sampleFadeEffectFill,
    },
    // Until strobe has a dedicated args model, it shares solid args.
    strobe: {
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
};

export const getEffectDefinition = <T extends LightingEffectType>(
    type: T,
): LightingEffectDefinition<T> => effectRegistry[type];

export const getDefaultArgsJson = (type: LightingEffectType): string =>
    JSON.stringify(getEffectDefinition(type).defaultArgs);

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
