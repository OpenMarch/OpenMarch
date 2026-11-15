import type { CheckpointNamer } from "./naming";
import type { FieldEditIssue, FieldEditIssueCode } from "./types";

type Translate = (
    key: string,
    params?: Record<string, string | number>,
) => string;

/** The translated text for each issue, by code. Issues carry English `message`s for agents/logs. */
const ISSUE_KEYS: Record<FieldEditIssueCode, string> = {
    "unknown-edit": "fieldEdits.issues.invalid",
    "invalid-args": "fieldEdits.issues.invalid",
    "not-found": "fieldEdits.issues.notFound",
    "min-checkpoints": "fieldProperties.checkpoint.minimumRequired",
    "duplicate-id": "fieldEdits.issues.invalid",
    "duplicate-position": "fieldEdits.issues.duplicatePosition",
    "y-in-front": "fieldEdits.issues.yInFront",
    "invalid-step-size": "fieldEdits.issues.invalidStepSize",
    "center-locked": "fieldEdits.issues.centerLocked",
    "no-gap": "fieldEdits.issues.noGap",
    "too-many": "fieldEdits.issues.tooMany",
    "unknown-setting": "fieldEdits.issues.invalid",
    "unknown-template": "fieldEdits.issues.invalid",
    "asymmetric-x": "fieldEdits.issues.asymmetricX",
    "mirror-ignored": "fieldEdits.issues.mirrorIgnored",
    "skipped-existing": "fieldEdits.issues.skippedExisting",
    "mirror-twin-skipped": "fieldEdits.issues.mirrorTwinSkipped",
    "outside-field": "fieldEdits.issues.outsideField",
    "field-resized": "fieldEdits.issues.fieldResized",
};

/** Issues that read differently as a refusal than as a warning */
const ERROR_KEYS: Partial<Record<FieldEditIssueCode, string>> = {
    "field-resized": "fieldEdits.issues.fieldResizeRefused",
};

/**
 * A field edit's error or warning as text for the user (toasts). `asError`: the issue is in
 * `diff.errors` (the edit was refused for it).
 */
export function fieldEditIssueMessage(
    issue: FieldEditIssue,
    t: Translate,
    asError = false,
): string {
    const key =
        (asError ? ERROR_KEYS[issue.code] : undefined) ??
        ISSUE_KEYS[issue.code];
    return t(key, {
        axis: (issue.axis ?? "x").toUpperCase(),
    });
}

/** Automatic checkpoint names in the app's language, for the edits' `namer` option */
export function createCheckpointNamer(t: Translate): CheckpointNamer {
    return {
        yardLine: (yards) => t("fieldEdits.names.yardLine", { yards }),
        endZone: () => t("fieldEdits.names.endZone"),
        endZoneShort: () => t("fieldEdits.names.endZoneShort"),
        endZoneLine: (yards) => t("fieldEdits.names.endZoneLine", { yards }),
        endZoneLineShort: (yards) =>
            t("fieldEdits.names.endZoneLineShort", { yards }),
        gridLine: (line) => t("fieldEdits.names.gridLine", { line }),
        sideSteps: (side, steps) =>
            t("fieldEdits.names.sideSteps", { side, steps }),
        sideStepsShort: (side, steps) =>
            t("fieldEdits.names.sideStepsShort", { side, steps }),
        stepsFromFront: (steps) =>
            t("fieldEdits.names.stepsFromFront", { steps }),
        stepsFromFrontShort: (steps) =>
            t("fieldEdits.names.stepsFromFrontShort", { steps }),
    };
}
