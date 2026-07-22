import { FieldProperties } from "@openmarch/core";
import { RgbaColor } from "@uiw/react-color";
import { StepSize } from "@/global/classes/StepSize";

// Fixed color for pathways whose step size exceeds the threshold
export const STEP_SIZE_WARNING_COLOR: RgbaColor = {
    r: 220,
    g: 38,
    b: 38,
    a: 1,
};

// Thicker stroke for warning pathways so they are distinct in form, not just color
export const STEP_SIZE_WARNING_STROKE_WIDTH = 3;

// Dash pattern for warning pathways so they read as distinct from normal paths
export const WARNING_PATHWAY_DASH = [5, 3];

// When true, over-threshold paths may be shown even if the visibility toggle is off
export const FORCE_SHOW_OVER_THRESHOLD_PATHS = true;

// Decide whether a pathway should be shown and whether it is a step-size warning
// allowForceShow gates the over-threshold override so only the next path (the current move)
// reappears past a hidden toggle, previous paths stay hidden when toggled off
export function evaluatePathWarning({
    start,
    end,
    counts,
    fieldProperties,
    pathEnabled,
    allowForceShow,
}: {
    start: { x: number; y: number };
    end: { x: number; y: number };
    counts: number | undefined;
    fieldProperties: FieldProperties;
    pathEnabled: boolean;
    allowForceShow: boolean;
}): { show: boolean; isWarning: boolean } {
    // a path that cannot show skips the StepSize computation entirely
    if (!pathEnabled && !allowForceShow)
        return { show: false, isWarning: false };
    if (counts == null) return { show: pathEnabled, isWarning: false };

    const stepSize = new StepSize({
        marcher_id: -1,
        startingX: start.x,
        startingY: start.y,
        endingX: end.x,
        endingY: end.y,
        counts,
        fieldProperties,
    });
    const isWarning = stepSize.exceedsThreshold(
        fieldProperties.stepSizeWarningThresholdInches,
    );
    const show =
        pathEnabled ||
        (allowForceShow && FORCE_SHOW_OVER_THRESHOLD_PATHS && isWarning);
    return { show, isWarning };
}
