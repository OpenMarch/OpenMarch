const GROUP_OVERLAP_MESSAGE =
    "This change overlaps another effect that uses the same group. Adjust timing or remove the group from the conflicting effect.";

export function isLightingEffectGroupOverlapError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    return /already controlled/i.test(msg);
}

export function getLightingEffectUpdateErrorMessage(error: unknown): string {
    if (isLightingEffectGroupOverlapError(error)) {
        return GROUP_OVERLAP_MESSAGE;
    }
    return "Error updating lighting effect";
}

export function getLightingEffectBatchUpdateErrorMessage(
    error: unknown,
): string {
    if (isLightingEffectGroupOverlapError(error)) {
        return GROUP_OVERLAP_MESSAGE;
    }
    return "Error updating lighting effects";
}
