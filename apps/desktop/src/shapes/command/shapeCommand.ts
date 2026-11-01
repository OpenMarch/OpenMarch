import tolgee from "@/global/singletons/Tolgee";
import { planCanvasEdit } from "@/timeline/timelineCoordinateWrites";
import { momentOf } from "../tool/shapeMoment";
import type { CommandRun, CommandStep } from "@/shortcuts/palette/commandBar";
import { closeDockedCommand } from "@/shortcuts/palette/commandBar";
import {
    currentShapeField,
    marchersOnField,
    shapeContextFor,
} from "../field/shapeFieldContext";
import { toolEnvFor } from "../tool/toolEnv";
import type { AnyToolKind, ToolEnv } from "../tool/toolKind";
import type { ShapeField } from "../field/shapeField";
import {
    edit,
    openTool,
    startsOf,
    switchKind,
    type ToolState,
} from "../tool/toolMachine";
import {
    isShapeShown,
    useShapeToolStore,
    type OpenShape,
} from "../tool/shapeToolStore";
import { fillAhead, shapeSteps, startingParams } from "./shapeSteps";
import { useLastLayoutStore } from "../tool/lastLayout";

/** A layout typed in the bar becomes the one a new box starts in, as picking one does (#387) */
function rememberLayout(
    kind: AnyToolKind,
    base: unknown,
    n: number,
    env: ToolEnv,
    answers: readonly string[],
) {
    const { params, steps } = shapeSteps(kind, base, n, env, answers);
    const at = steps.findIndex((s) => s.param.key === "layout");
    if (at < 0 || steps[at]!.invalid || !answers[at]?.trim()) return;
    const d = kind.closed?.distribution(params, n);
    if (d?.mode === "files")
        useLastLayoutStore.getState().remember(d.layout.family);
}

/**
 * What the command starts from: the open shape (switched to `kind` keeping its frame if it's
 * another kind), or a new one of `kind`'s defaults on `ids`. Null when there's nothing to open.
 */
function startFrom(
    kind: AnyToolKind,
    ids: readonly number[],
    field: ShapeField,
    env: ToolEnv,
): { start: ToolState; base: unknown; keeps: boolean } | null {
    // A shape waiting away from its moment isn't started from: the new one opens here (#416)
    const open = isShapeShown() ? useShapeToolStore.getState().tool : null;
    if (open !== null && open.params !== null && !open.gesture) {
        if (open.kind === kind)
            return { start: open, base: open.params, keeps: true };
        // Another kind: the open shape turns into it keeping its frame, as picking it does
        const start = switchKind(open, kind, shapeContextFor(field), env);
        return { start, base: start.params, keeps: true };
    }
    if (ids.length === 0) return null;
    const start = openTool(kind, marchersOnField(field, ids));
    if (start.spots === 0) return null;
    const base = startingParams(kind, startsOf(start), start.spots, env);
    return base === null ? null : { start, base, keeps: false };
}

/** A shape waiting elsewhere that a new one replaces, kept for undo as Escape keeps it (#416) */
function dismissedFor(before: {
    tool: ToolState | null;
    openedAt: OpenShape["openedAt"];
    moment: OpenShape["moment"];
}): OpenShape | null {
    const { tool, openedAt, moment } = before;
    return tool && tool.params !== null ? { tool, openedAt, moment } : null;
}

/**
 * Shape › kind in the command bar (#354): opens a shape of `kind` on `ids` (the selection, past
 * the selection gate) and asks its parameters, the shape showing live on the field as each is
 * typed. It starts from the open shape when there is one: the same kind keeps its numbers, and
 * another kind is switched to keeping its frame. Otherwise it starts from the kind's defaults
 * around where the marchers stand.
 *
 * The answers are one undo step in the shape's own history, and the last one places the shape
 * through the host's place function; Escape puts back whatever was open before. If the shape ends
 * another way while the bar is up, the bar closes. A shape waiting away from its moment (#416) is
 * dismissed for the new one, as Escape would, and Escape in the bar puts it back.
 */
export function beginShapeCommand(
    kind: AnyToolKind,
    ids: readonly number[],
    path: readonly string[],
    place: () => Promise<void>,
): CommandRun | null {
    const field = currentShapeField();
    if (!field) return null;
    const before = useShapeToolStore.getState();
    const ctx = shapeContextFor(field);
    const env = toolEnvFor(field);
    const from = startFrom(kind, ids, field, env);
    if (!from) return null;
    const { start, base } = from;
    const openedAt = from.keeps ? before.openedAt : planCanvasEdit();
    const moment = from.keeps ? before.moment : momentOf();
    const dismissed = from.keeps ? null : dismissedFor(before);

    /** The tool this command last showed; anything else means the shape ended another way */
    let shown: ToolState | null = null;
    let unsubscribe = () => {};
    const run: CommandRun = {
        path,
        preview(answers) {
            const { params, steps } = shapeSteps(
                kind,
                base,
                start.spots,
                env,
                answers,
            );
            const tool =
                params === start.params ? start : edit(start, params, ctx);
            if (tool !== shown) {
                shown = tool;
                useShapeToolStore.setState({
                    tool,
                    openedAt,
                    moment,
                    // One waiting elsewhere is dismissed as Escape would (#416)
                    discarded: dismissed,
                });
            }
            return steps.map(
                (s): CommandStep => ({
                    key: s.param.key,
                    label: s.param.label,
                    initial: s.initial,
                    invalid: s.invalid,
                }),
            );
        },
        // The last answer places the shape, through the host's place function (sims B354: a
        // "Done" that left it open read as a trap)
        finishLabel: tolgee.t("shapes.edit.place", "Place"),
        fillAhead: (answers) => fillAhead(kind, answers),
        finish(answers) {
            unsubscribe();
            run.preview(answers);
            rememberLayout(kind, base, start.spots, env, answers);
            void place();
        },
        cancel() {
            unsubscribe();
            useShapeToolStore.setState({
                tool: before.tool,
                openedAt: before.openedAt,
                moment: before.moment,
                discarded: before.discarded,
            });
        },
    };
    unsubscribe = useShapeToolStore.subscribe((state) => {
        if (shown !== null && state.tool !== shown) {
            unsubscribe();
            closeDockedCommand(run);
        }
    });
    return run;
}
