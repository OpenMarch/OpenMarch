import type { NudgeArgs } from "./definitions";

const FIXED_STEPS = { quarter: 0.25, tenth: 0.1, four: 4 } as const;

export function resolveNudgeDistance(
    { direction, step }: NudgeArgs,
    rounding: { nearestXSteps?: number; nearestYSteps?: number } = {},
): number {
    if (step !== "grid") return FIXED_STEPS[step];
    const vertical = direction === "up" || direction === "down";
    return (vertical ? rounding.nearestYSteps : rounding.nearestXSteps) || 1;
}
