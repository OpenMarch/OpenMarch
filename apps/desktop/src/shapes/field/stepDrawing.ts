import { pivotPoint } from "../frame/frame";
import { pivotOf } from "../frame/pivot";
import { formatSignedSteps } from "../editor/format";
import type { AnyToolKind } from "../tool/toolKind";
import type { XY } from "../types";

/**
 * A kind's step from one marcher to the next as the field draws it (a Line's offset, owner on
 * #596): a dashed right angle from the first marcher, across (↔) to `corner` and then up or down
 * (↕) to the next, each leg labeled with its number as the editor shows it
 */
export interface StepMark {
    readonly from: XY;
    readonly corner: XY;
    readonly to: XY;
    /** "↔ 2", "↕ −1": positive right and up the screen, as the editor's numbers */
    readonly across: string;
    readonly deep: string;
}

/**
 * What the field draws of a kind's step while its numbers are engaged (`engaged`, pointed at,
 * focused or dragged) or a handle is dragged (`gesture`): the step ({@link StepMark}) and the
 * pivot it grows from, drawn lit as the pivot menu's preview is. Nothing otherwise, or for a kind
 * with no step now. Pure: a drawing only.
 */
export function stepDrawing(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    engaged: boolean,
    gesture: { readonly type: string } | null | undefined,
    stepPx: number,
): { offsetStep?: StepMark; pivotPreview?: XY } {
    if (!engaged && gesture?.type !== "handle") return {};
    const step = kind.step?.(params, n);
    if (!step) return {};
    const { from, to } = step;
    const across = (to.x - from.x) / stepPx;
    // Up the screen is field y going down
    const deep = (from.y - to.y) / stepPx;
    return {
        offsetStep: {
            from,
            corner: { x: to.x, y: from.y },
            to,
            across: `↔ ${formatSignedSteps(across)}`,
            deep: `↕ ${formatSignedSteps(deep)}`,
        },
        pivotPreview: pivotPoint(kind.frameOf(params, n), pivotOf(params)),
    };
}
