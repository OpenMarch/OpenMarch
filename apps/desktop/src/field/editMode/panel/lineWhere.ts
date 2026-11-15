import type { Checkpoint, FieldProperties } from "@openmarch/core";
import { useTranslate } from "@tolgee/react";
import { mirrorTwin } from "@/field/edits";

/** Where a line is, as the Lines tab says it: a mirrored pair, one side, the center, or Y */
export type LineWhere = "both" | "left" | "right" | "center" | "y";

/** Which of those a line is; with Mirror on, an X line that has a twin is "both" */
export function lineWhere(
    fp: Pick<FieldProperties, "xCheckpoints">,
    line: Pick<Checkpoint, "axis" | "stepsFromCenterFront"> &
        Partial<Pick<Checkpoint, "id">>,
    mirror: boolean,
): LineWhere {
    if (line.axis === "y") return "y";
    const steps = line.stepsFromCenterFront;
    if (Math.abs(steps) < 1e-6) return "center";
    if (mirror && mirrorTwin(fp.xCheckpoints, line as Checkpoint))
        return "both";
    return steps < 0 ? "left" : "right";
}

/**
 * The words for where a line is ("S1+S2 · 16", "S1 · 16", "center", "8 back"), the same in the
 * list's rows and the Line section's title, so a line goes by one name everywhere (#824)
 */
export function useWhereText(fp: Pick<FieldProperties, "sideDescriptions">) {
    const { t } = useTranslate();
    const sides = fp.sideDescriptions;
    return (where: LineWhere, stepsFromCenterFront: number) => {
        const steps = Math.abs(stepsFromCenterFront);
        switch (where) {
            case "y":
                return t("fieldEditMode.list.behind", { steps });
            case "center":
                return t("fieldEditMode.list.center");
            case "both":
                return t("fieldEditMode.list.bothSides", {
                    left: sides.terseLeft,
                    right: sides.terseRight,
                    steps,
                });
            default:
                return t("fieldEditMode.list.oneSide", {
                    side: where === "left" ? sides.terseLeft : sides.terseRight,
                    steps,
                });
        }
    };
}
