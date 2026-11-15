import { toast } from "sonner";
import { useTranslate } from "@tolgee/react";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";
import { useApplyFieldEdits } from "@/hooks/useApplyFieldEdits";
import type { FieldEditRequest, FieldEditResult } from "@/field/edits";
import { useActionHandler } from "../useActionHandler";
import type { ActionArgs } from "../definitions";

/**
 * Field edits (#823) the palette reaches: the ones that need no checkpoint picked. The rest
 * (remove, move, update, settings, templates) are called by name through `applyFieldEdits` until
 * the Edit field mode (#824) gives them a selection.
 *
 * None of them changes the field's size or center: a series stops at the outermost lines, and
 * any edit that would still resize the field is refused (`allowGeometryChange: false`). Refusals,
 * warnings and failed writes are toasted by `useApplyFieldEdits`.
 */
export function useFieldEditActionHandlers() {
    const { t } = useTranslate();
    const databaseReady = useDatabaseReady();
    const applyFieldEdits = useApplyFieldEdits({ allowGeometryChange: false });

    const apply = (
        edit: FieldEditRequest,
        done: (result: FieldEditResult) => void,
    ) =>
        void applyFieldEdits(edit).then((result) => {
            if (result?.diff.ok) done(result);
        });

    const addedOne = (axis: "x" | "y") => (result: FieldEditResult) => {
        const added = result.diff.checkpoints.added[0];
        if (added)
            toast.success(
                t("fieldProperties.checkpoint.created", {
                    axis: axis.toUpperCase(),
                    steps: added.stepsFromCenterFront,
                }),
            );
    };
    const addedSeries = (axis: "x" | "y") => (result: FieldEditResult) => {
        const count = result.diff.checkpoints.added.length;
        if (count === 0) toast.message(t("fieldEdits.nothingAdded"));
        else
            toast.success(
                t("fieldEdits.seriesAdded", {
                    count,
                    axis: axis.toUpperCase(),
                }),
            );
    };
    const number = (args: ActionArgs | undefined, key: string) =>
        Number(args?.[key]);

    const options = { enabled: databaseReady };
    useActionHandler(
        "fieldAddXCheckpoint",
        () =>
            apply(
                { edit: "addCheckpoint", args: { axis: "x", mirror: true } },
                addedOne("x"),
            ),
        options,
    );
    useActionHandler(
        "fieldAddYCheckpoint",
        () =>
            apply(
                { edit: "addCheckpoint", args: { axis: "y" } },
                addedOne("y"),
            ),
        options,
    );
    useActionHandler(
        "fieldAddXCheckpointSeries",
        (args) =>
            apply(
                {
                    edit: "addCheckpointSeries",
                    args: {
                        axis: "x",
                        every: number(args, "every"),
                        from: 0,
                        to: Math.abs(number(args, "to")),
                        mirror: true,
                    },
                },
                addedSeries("x"),
            ),
        options,
    );
    useActionHandler(
        "fieldAddYCheckpointSeries",
        (args) =>
            apply(
                {
                    edit: "addCheckpointSeries",
                    args: {
                        axis: "y",
                        every: number(args, "every"),
                        from: 0,
                        // Asked as steps behind the front; stored negative
                        to: -Math.abs(number(args, "to")),
                    },
                },
                addedSeries("y"),
            ),
        options,
    );
}
