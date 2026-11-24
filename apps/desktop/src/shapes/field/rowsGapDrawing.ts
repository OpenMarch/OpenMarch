import tolgee from "@/global/singletons/Tolgee";
import type { AnyToolKind } from "../tool/toolKind";
import type { XY } from "../types";

/**
 * The gap from one of a Line's rows to the next as the field draws it (#1190), at an end of the
 * block: a dashed leg from the drawn row's end spot straight across to the next row (`corner`),
 * then along it by the slant (`to`), labeled with the Rows menu's numbers as it shows them, beside
 * it on the `outward` side (a unit vector away from the block)
 */
export interface RowsGapMark {
    readonly from: XY;
    readonly corner: XY;
    readonly to: XY;
    readonly outward: XY;
    /** "4 steps apart" */
    readonly apart: string;
    /** "Slant 1", or null when the rows don't slant */
    readonly slant: string | null;
}

/**
 * What the field draws of a kind's rows while their Rows apart or Slant number is engaged
 * (pointed at, focused or dragged): the gap ({@link RowsGapMark}). Nothing otherwise, or for a
 * kind with fewer than two rows now. Pure: a drawing only.
 */
export function rowsGapDrawing(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    engaged: boolean,
    stepPx: number,
): { rowsGap?: RowsGapMark } {
    if (!engaged || !kind.rows) return {};
    const gap = kind.rows.gap(params, n, stepPx);
    if (!gap) return {};
    const apartSteps = kind.rows.apart.value?.(params, n, stepPx) ?? 0;
    const slanted =
        Math.hypot(gap.to.x - gap.corner.x, gap.to.y - gap.corner.y) > 1e-6;
    return {
        rowsGap: {
            ...gap,
            apart: tolgee.t(
                "shapes.rows.apartMark",
                "{count, plural, one {{steps} step apart} other {{steps} steps apart}}",
                {
                    count: apartSteps,
                    steps: kind.rows.apart.display(params, n, stepPx),
                },
            ),
            slant: slanted
                ? tolgee.t("shapes.rows.slantMark", "Slant {steps}", {
                      steps: kind.rows.slant.display(params, n, stepPx),
                  })
                : null,
        },
    };
}
