import {
    getDefaultArgsJson,
    getEffectColor,
    getEffectDefinition,
    withEffectColor,
} from "./effect.registry";
import type { LightingEffectType } from "./types";

/**
 * Creates a new solid lighting effect with the default arguments.
 */
export const createNewLightingEffect = (
    createFunction: (
        name: null,
        type: LightingEffectType,
        argsJson: string,
    ) => unknown,
) => {
    const newEffectArgsJson = getDefaultArgsJson("solid");
    createFunction(null, "solid", newEffectArgsJson);
};

/**
 * Updates the type of a lighting effect, resetting its arguments to the new
 * type's defaults except for color, which is carried over from the effect's
 * current args (mapped into whatever color field the new type uses).
 *
 * This should not be called if the type is already the new type, as it will overwrite the existing arguments.
 */
export const updateLightingEffectType = ({
    updateFunction,
    newType,
    currentType,
    currentArgsJson,
}: {
    updateFunction: (type: LightingEffectType, argsJson: string) => unknown;
    newType: LightingEffectType;
    currentType: LightingEffectType;
    currentArgsJson: string;
}) => {
    const defaultArgs = getEffectDefinition(newType).defaultArgs;
    const previousColor = getEffectColor(currentType, currentArgsJson);
    const newArgs =
        previousColor != null
            ? withEffectColor(newType, defaultArgs, previousColor)
            : defaultArgs;
    updateFunction(newType, JSON.stringify(newArgs));
};
