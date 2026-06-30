const GROUP_OVERLAP_MESSAGE =
    "This change overlaps another effect that uses the same group. Adjust timing or remove the group from the conflicting effect.";

const LAYER_OVERLAP_MESSAGE =
    "Effect layers cannot overlap. Adjust positions or sizes.";

export function isLightingEffectGroupOverlapError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    return /already controlled/i.test(msg);
}

export function isLightingEffectLayerOverlapError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    return /effect layers overlap/i.test(msg);
}

export function getLightingEffectLayerUpdateErrorMessage(
    error: unknown,
): string {
    if (isLightingEffectLayerOverlapError(error)) {
        return LAYER_OVERLAP_MESSAGE;
    }
    return "Error updating effect layers";
}

function getLightingEffectMutationErrorMessage(
    error: unknown,
    fallback: string,
): string {
    if (isLightingEffectLayerOverlapError(error)) {
        return LAYER_OVERLAP_MESSAGE;
    }
    if (isLightingEffectGroupOverlapError(error)) {
        return GROUP_OVERLAP_MESSAGE;
    }
    return fallback;
}

export function getLightingEffectUpdateErrorMessage(error: unknown): string {
    return getLightingEffectMutationErrorMessage(
        error,
        "Error updating lighting effect",
    );
}

export function getLightingEffectBatchUpdateErrorMessage(
    error: unknown,
): string {
    return getLightingEffectMutationErrorMessage(
        error,
        "Error updating lighting effects",
    );
}

export function getLightingEffectCreateErrorMessage(error: unknown): string {
    return getLightingEffectMutationErrorMessage(
        error,
        "Error creating lighting effects",
    );
}
