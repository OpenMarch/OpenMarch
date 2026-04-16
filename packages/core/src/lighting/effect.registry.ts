import { z } from "zod";
import {
    defaultFadeEffectArgs,
    fadeEffectArgsSchema,
    parseFadeEffectArgs,
} from "./effect.fade";
import type { FadeEffectArgs } from "./effect.fade";
import {
    defaultSolidEffectArgs,
    parseSolidEffectArgs,
    solidEffectArgsSchema,
} from "./effect.solid";
import type { SolidEffectArgs } from "./effect.solid";
import type { LightingEffectType } from "./types";

export type LightingEffectArgsByType = {
    solid: SolidEffectArgs;
    fade: FadeEffectArgs;
    strobe: SolidEffectArgs;
};

export type LightingEffectDefinition<T extends LightingEffectType> = {
    defaultArgs: LightingEffectArgsByType[T];
    schema: z.ZodType<LightingEffectArgsByType[T]>;
    parseArgs: (argsJson: string) => LightingEffectArgsByType[T];
};

export const effectRegistry: {
    [K in LightingEffectType]: LightingEffectDefinition<K>;
} = {
    solid: {
        defaultArgs: defaultSolidEffectArgs,
        schema: solidEffectArgsSchema,
        parseArgs: parseSolidEffectArgs,
    },
    fade: {
        defaultArgs: defaultFadeEffectArgs,
        schema: fadeEffectArgsSchema,
        parseArgs: parseFadeEffectArgs,
    },
    // Until strobe has a dedicated args model, it shares solid args.
    strobe: {
        defaultArgs: defaultSolidEffectArgs,
        schema: solidEffectArgsSchema,
        parseArgs: parseSolidEffectArgs,
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
