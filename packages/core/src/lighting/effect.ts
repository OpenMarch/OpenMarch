import { getDefaultArgsJson } from "./effect.registry";
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
    const newEffectArgsJson = getDefaultArgsJson("fade");
    createFunction(null, "fade", newEffectArgsJson);
};

/**
 * Updates the type of a lighting effect and sets the arguments to the default values.
 *
 * This should not be called if the type is already the new type, as it will overwrite the existing arguments.
 */
export const updateLightingEffectType = ({
    updateFunction,
    newType,
}: {
    updateFunction: (type: LightingEffectType, argsJson: string) => unknown;
    newType: LightingEffectType;
}) => {
    const newArgsJson = getDefaultArgsJson(newType);
    updateFunction(newType, newArgsJson);
};
